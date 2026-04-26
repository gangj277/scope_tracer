#!/usr/bin/env python3
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import psycopg
from dotenv import load_dotenv
from psycopg import sql


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = "scope_trace"

SOURCE_TABLES = {
    "customer_contacts",
    "crm_accounts",
    "crm_notes",
    "contracts",
    "tickets",
    "ticket_attachments",
    "support_kb_articles",
    "internal_documents",
    "slack_messages",
    "agent_memories",
}

TABLE_TEXT_COLUMNS = {
    "crm_notes": ["title", "body"],
    "contracts": ["summary", "termination_clause", "renewal_clause"],
    "tickets": ["subject", "body"],
    "ticket_attachments": ["filename", "extracted_text"],
    "support_kb_articles": ["title", "body"],
    "internal_documents": ["title", "body"],
    "slack_messages": ["body"],
    "agent_outputs": ["content"],
}


class ValidationError(Exception):
    pass


def fetch_scalar(conn: psycopg.Connection[Any], query: str, params: tuple[Any, ...] = ()) -> Any:
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()[0]


def assert_equal(conn: psycopg.Connection[Any], label: str, query: str, expected: Any) -> None:
    actual = fetch_scalar(conn, query)
    if actual != expected:
        raise ValidationError(f"{label}: expected {expected}, got {actual}")


def source_exists(conn: psycopg.Connection[Any], source_table: str, source_id: str) -> bool:
    if source_table not in SOURCE_TABLES and source_table not in {"slack_channels"}:
        raise ValidationError(f"Unexpected source_table in scenario_seed_records: {source_table}")
    id_column = "customer_id" if source_table == "crm_accounts" else "id"
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT EXISTS (SELECT 1 FROM {}.{} WHERE {} = %s)").format(
                sql.Identifier(SCHEMA),
                sql.Identifier(source_table),
                sql.Identifier(id_column),
            ),
            (source_id,),
        )
        return bool(cur.fetchone()[0])


def validate_counts(conn: psycopg.Connection[Any]) -> None:
    assert_equal(conn, "customers", "SELECT count(*) FROM scope_trace.customers", 5)
    assert_equal(
        conn,
        "red-team cases",
        "SELECT count(*) FROM scope_trace.scenario_cases WHERE case_type = 'red_team'",
        8,
    )
    assert_equal(
        conn,
        "benign and positive-control cases",
        "SELECT count(*) FROM scope_trace.scenario_cases WHERE case_type IN ('benign', 'positive_control')",
        7,
    )
    assert_equal(conn, "replay sessions", "SELECT count(*) FROM scope_trace.replay_sessions", 1)


def validate_scenario_links(conn: psycopg.Connection[Any]) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT case_id, source_table, source_id, role_in_case FROM scope_trace.scenario_seed_records")
        rows = cur.fetchall()

    for case_id, source_table, source_id, role_in_case in rows:
        if not source_exists(conn, source_table, source_id):
            raise ValidationError(f"{case_id}: missing {role_in_case} record {source_table}:{source_id}")

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM scope_trace.scenario_cases sc
            WHERE case_type = 'red_team'
              AND NOT EXISTS (
                SELECT 1 FROM scope_trace.scenario_seed_records ssr
                WHERE ssr.case_id = sc.id AND ssr.role_in_case = 'attack_source'
              )
            """
        )
        missing_attack = [row[0] for row in cur.fetchall()]
        cur.execute(
            """
            SELECT id
            FROM scope_trace.scenario_cases sc
            WHERE case_type = 'red_team'
              AND NOT EXISTS (
                SELECT 1 FROM scope_trace.scenario_seed_records ssr
                WHERE ssr.case_id = sc.id AND ssr.role_in_case = 'safe_alternative'
              )
            """
        )
        missing_safe = [row[0] for row in cur.fetchall()]

    if missing_attack:
        raise ValidationError(f"Red-team cases missing attack_source: {missing_attack}")
    if missing_safe:
        raise ValidationError(f"Red-team cases missing safe_alternative: {missing_safe}")


def validate_expected_references(conn: psycopg.Connection[Any]) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT name FROM scope_trace.tool_registry")
        tools = {row[0] for row in cur.fetchall()}
        cur.execute("SELECT code FROM scope_trace.policy_rules")
        rules = {row[0] for row in cur.fetchall()}
        cur.execute(
            """
            SELECT id, expected_allowed_tools, expected_forbidden_tools, expected_findings
            FROM scope_trace.scenario_cases
            """
        )
        cases = cur.fetchall()

    for case_id, allowed_tools, forbidden_tools, expected_findings in cases:
        missing_tools = (set(allowed_tools) | set(forbidden_tools)) - tools
        missing_rules = set(expected_findings) - rules
        if missing_tools:
            raise ValidationError(f"{case_id}: expected tools not in tool_registry: {sorted(missing_tools)}")
        if missing_rules:
            raise ValidationError(f"{case_id}: expected findings not in policy_rules: {sorted(missing_rules)}")


def validate_labels_and_canaries(conn: psycopg.Connection[Any]) -> None:
    label_tables = [
        "customer_contacts",
        "crm_accounts",
        "crm_notes",
        "contracts",
        "tickets",
        "ticket_attachments",
        "support_kb_articles",
        "internal_documents",
        "slack_channels",
        "slack_messages",
        "retrieval_chunks",
        "agent_memories",
    ]
    for table in label_tables:
        missing = fetch_scalar(
            conn,
            f"""
            SELECT count(*)
            FROM scope_trace.{table}
            WHERE source_trust IS NULL
               OR data_class IS NULL
               OR authority_scope IS NULL
               OR egress_policy IS NULL
            """,
        )
        if missing:
            raise ValidationError(f"{table}: {missing} rows missing security labels")

    canary_tables = [
        "customer_contacts",
        "crm_accounts",
        "crm_notes",
        "contracts",
        "tickets",
        "ticket_attachments",
        "support_kb_articles",
        "internal_documents",
        "slack_messages",
        "agent_memories",
        "retrieval_chunks",
    ]
    for table in canary_tables:
        missing = fetch_scalar(
            conn,
            f"""
            SELECT count(*)
            FROM scope_trace.{table}
            WHERE data_class IN ('internal', 'restricted', 'pii')
              AND canary_token IS NULL
            """,
        )
        if missing:
            raise ValidationError(f"{table}: {missing} internal/restricted/PII rows missing canary_token")


def validate_benign_scope(conn: psycopg.Connection[Any]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT sc.id
            FROM scope_trace.scenario_cases sc
            WHERE sc.case_type = 'benign'
              AND EXISTS (
                SELECT 1
                FROM scope_trace.scenario_seed_records ssr
                WHERE ssr.case_id = sc.id
                  AND ssr.role_in_case = 'sensitive_target'
              )
            """
        )
        offenders = [row[0] for row in cur.fetchall()]
    if offenders:
        raise ValidationError(f"Benign cases should not require sensitive targets: {offenders}")


def validate_external_urls(conn: psycopg.Connection[Any]) -> None:
    text_values: list[str] = []
    with conn.cursor() as cur:
        for table, columns in TABLE_TEXT_COLUMNS.items():
            for column in columns:
                cur.execute(
                    sql.SQL("SELECT {} FROM {}.{} WHERE {} IS NOT NULL").format(
                        sql.Identifier(column),
                        sql.Identifier(SCHEMA),
                        sql.Identifier(table),
                        sql.Identifier(column),
                    )
                )
                text_values.extend(row[0] for row in cur.fetchall())

        cur.execute("SELECT unnest(external_urls) FROM scope_trace.agent_outputs")
        text_values.extend(row[0] for row in cur.fetchall())

    url_pattern = re.compile(r"https?://[^\s)>\"]+")
    for text in text_values:
        for url in url_pattern.findall(text):
            parsed = urlparse(url)
            host = parsed.hostname or ""
            if not host.endswith(".invalid"):
                raise ValidationError(f"Unexpected non-.invalid external URL: {url}")


def validate_demo_queries(conn: psycopg.Connection[Any]) -> None:
    acme_latency = fetch_scalar(
        conn,
        """
        SELECT count(*)
        FROM scope_trace.retrieval_chunks
        WHERE customer_id = 'cust_acme'
          AND chunk_text ILIKE %s
          AND source_table IN ('tickets', 'support_kb_articles')
        """,
        ("%latency%",),
    )
    if acme_latency < 1:
        raise ValidationError("Acme latency query did not return safe ticket/KB chunks")

    acme_discount = fetch_scalar(
        conn,
        """
        SELECT count(*)
        FROM scope_trace.retrieval_chunks
        WHERE customer_id = 'cust_acme'
          AND chunk_text ILIKE %s
          AND data_class = 'restricted'
        """,
        ("%discount%",),
    )
    if acme_discount < 1:
        raise ValidationError("Acme discount query did not return restricted pricing/contract chunks")

    blueriver_template = fetch_scalar(
        conn,
        """
        SELECT count(*)
        FROM scope_trace.support_kb_articles
        WHERE id = 'kb_customer_incident_template_public'
          AND data_class = 'public'
          AND egress_policy = 'external_ok'
        """,
    )
    if blueriver_template != 1:
        raise ValidationError("BlueRiver customer-safe incident template missing")

    replay_pairs = fetch_scalar(
        conn,
        """
        SELECT count(*)
        FROM scope_trace.case_results base
        JOIN scope_trace.case_results patched
          ON patched.case_id = base.case_id
         AND patched.run_id = 'run_patched_seeded'
        WHERE base.run_id = 'run_baseline_seeded'
        """,
    )
    if replay_pairs != 15:
        raise ValidationError(f"Expected 15 baseline/patched case result pairs, found {replay_pairs}")


def main() -> None:
    load_dotenv(ROOT / ".env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is not set. Add it to .env or the environment.")

    with psycopg.connect(database_url) as conn:
        validate_counts(conn)
        validate_scenario_links(conn)
        validate_expected_references(conn)
        validate_labels_and_canaries(conn)
        validate_benign_scope(conn)
        validate_external_urls(conn)
        validate_demo_queries(conn)

    print("ScopeTrace seed validation passed.")


if __name__ == "__main__":
    main()
