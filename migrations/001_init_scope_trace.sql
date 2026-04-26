CREATE SCHEMA IF NOT EXISTS scope_trace;

CREATE TABLE IF NOT EXISTS scope_trace.actors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('internal_user', 'external_contact', 'system_agent')),
  role TEXT NOT NULL,
  department TEXT,
  clearance TEXT NOT NULL CHECK (clearance IN ('public', 'internal', 'restricted')),
  can_send_external BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  segment TEXT NOT NULL CHECK (segment IN ('smb', 'growth', 'enterprise', 'regulated_enterprise')),
  industry TEXT NOT NULL,
  arr_usd INTEGER NOT NULL CHECK (arr_usd >= 0),
  renewal_days_left INTEGER CHECK (renewal_days_left IS NULL OR renewal_days_left >= 0),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  account_owner_id TEXT REFERENCES scope_trace.actors(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.customer_contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES scope_trace.customers(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES scope_trace.actors(id),
  title TEXT NOT NULL,
  email TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS scope_trace.crm_accounts (
  customer_id TEXT PRIMARY KEY REFERENCES scope_trace.customers(id) ON DELETE CASCADE,
  health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  renewal_stage TEXT NOT NULL CHECK (renewal_stage IN ('none', 'discovery', 'negotiation', 'legal_review', 'renewed', 'at_risk')),
  support_tier TEXT NOT NULL CHECK (support_tier IN ('standard', 'growth', 'enterprise', 'regulated')),
  discount_approved BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.crm_notes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES scope_trace.customers(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES scope_trace.actors(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.contracts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES scope_trace.customers(id) ON DELETE CASCADE,
  contract_year INTEGER NOT NULL CHECK (contract_year >= 2020),
  summary TEXT NOT NULL,
  discount_floor_pct INTEGER CHECK (discount_floor_pct IS NULL OR discount_floor_pct BETWEEN 0 AND 100),
  termination_clause TEXT NOT NULL,
  renewal_clause TEXT NOT NULL,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.tickets (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES scope_trace.customers(id) ON DELETE CASCADE,
  sender_actor_id TEXT NOT NULL REFERENCES scope_trace.actors(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('external_customer', 'internal_employee', 'system')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  contains_attack BOOLEAN NOT NULL DEFAULT FALSE,
  attack_case_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.ticket_attachments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES scope_trace.tickets(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  contains_attack BOOLEAN NOT NULL DEFAULT FALSE,
  attack_case_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.support_kb_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  product_area TEXT NOT NULL,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.internal_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  owner_dept TEXT NOT NULL,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  customer_id TEXT REFERENCES scope_trace.customers(id),
  canary_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.slack_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS scope_trace.slack_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES scope_trace.slack_channels(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES scope_trace.actors(id),
  customer_id TEXT REFERENCES scope_trace.customers(id),
  body TEXT NOT NULL,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.retrieval_chunks (
  id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  customer_id TEXT REFERENCES scope_trace.customers(id),
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  canary_token TEXT,
  contains_attack BOOLEAN NOT NULL DEFAULT FALSE,
  attack_case_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS scope_trace.agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  default_mode TEXT NOT NULL CHECK (default_mode IN ('observe', 'warn', 'enforce')),
  description TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.tool_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  allowed_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  required_scope TEXT NOT NULL CHECK (required_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  side_effect BOOLEAN NOT NULL DEFAULT FALSE,
  external_egress BOOLEAN NOT NULL DEFAULT FALSE,
  default_policy TEXT NOT NULL CHECK (default_policy IN ('allow', 'approval_required', 'block')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS scope_trace.policy_rules (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  mode TEXT NOT NULL CHECK (mode IN ('observe', 'warn', 'enforce')),
  description TEXT NOT NULL,
  rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.scenario_cases (
  id TEXT PRIMARY KEY,
  case_type TEXT NOT NULL CHECK (case_type IN ('red_team', 'benign', 'positive_control')),
  title TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES scope_trace.customers(id),
  user_task TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES scope_trace.actors(id),
  attack_surface TEXT NOT NULL,
  expected_findings TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expected_allowed_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expected_forbidden_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expected_forbidden_data_classes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expected_forbidden_output_terms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  success_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.scenario_seed_records (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES scope_trace.scenario_cases(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  role_in_case TEXT NOT NULL CHECK (role_in_case IN ('attack_source', 'sensitive_target', 'safe_alternative', 'benign_source', 'expected_output_reference')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (case_id, source_table, source_id, role_in_case)
);

CREATE TABLE IF NOT EXISTS scope_trace.intent_manifests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES scope_trace.scenario_cases(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES scope_trace.actors(id),
  user_task TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  customer_scope TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blocked_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  approval_required_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blocked_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  external_recipient BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_output_data_classes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blocked_output_data_classes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.agent_memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('customer', 'global', 'user')),
  subject_id TEXT,
  content TEXT NOT NULL,
  source_trust TEXT NOT NULL CHECK (source_trust IN ('external', 'internal', 'system', 'generated')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT NOT NULL CHECK (authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  egress_policy TEXT NOT NULL CHECK (egress_policy IN ('external_ok', 'internal_only', 'restricted')),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_event_id TEXT,
  canary_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.runs (
  id TEXT PRIMARY KEY,
  agent_profile_id TEXT NOT NULL REFERENCES scope_trace.agent_profiles(id),
  mode TEXT NOT NULL CHECK (mode IN ('baseline', 'patched', 'observe', 'warn', 'enforce')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS scope_trace.trace_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scope_trace.runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES scope_trace.scenario_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source_table TEXT,
  source_id TEXT,
  source_trust TEXT CHECK (source_trust IS NULL OR source_trust IN ('external', 'internal', 'system', 'generated')),
  tool_name TEXT,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_class TEXT CHECK (data_class IS NULL OR data_class IN ('public', 'customer_confidential', 'internal', 'restricted', 'pii')),
  authority_scope TEXT CHECK (authority_scope IS NULL OR authority_scope IN ('support', 'sales', 'security', 'legal', 'finance', 'admin', 'customer')),
  policy_decision TEXT CHECK (policy_decision IS NULL OR policy_decision IN ('allowed', 'blocked', 'warned', 'observed')),
  policy_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.trace_event_sources (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES scope_trace.trace_events(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  influence_type TEXT NOT NULL CHECK (influence_type IN ('retrieved_context', 'tool_argument_overlap', 'output_reference', 'policy_evidence', 'suspected_cause')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS scope_trace.agent_outputs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scope_trace.runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES scope_trace.scenario_cases(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('external_customer', 'internal_user', 'system')),
  recipient_customer_id TEXT REFERENCES scope_trace.customers(id),
  content TEXT NOT NULL,
  referenced_source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_data_classes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  external_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  policy_decision TEXT NOT NULL CHECK (policy_decision IN ('allowed', 'blocked', 'warned', 'observed')),
  policy_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES scope_trace.runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES scope_trace.scenario_cases(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL REFERENCES scope_trace.policy_rules(code),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  remediation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.case_results (
  run_id TEXT NOT NULL REFERENCES scope_trace.runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES scope_trace.scenario_cases(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('baseline', 'patched', 'observe', 'warn', 'enforce')),
  attack_success BOOLEAN NOT NULL DEFAULT FALSE,
  benign_success BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_tool_calls INTEGER NOT NULL DEFAULT 0 CHECK (blocked_tool_calls >= 0),
  sensitive_egress_count INTEGER NOT NULL DEFAULT 0 CHECK (sensitive_egress_count >= 0),
  finding_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  output_id TEXT REFERENCES scope_trace.agent_outputs(id),
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, case_id)
);

CREATE TABLE IF NOT EXISTS scope_trace.replay_sessions (
  id TEXT PRIMARY KEY,
  baseline_run_id TEXT NOT NULL REFERENCES scope_trace.runs(id),
  patched_run_id TEXT NOT NULL REFERENCES scope_trace.runs(id),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope_trace.hard_gate_rules (
  id TEXT PRIMARY KEY,
  agent_profile_id TEXT NOT NULL REFERENCES scope_trace.agent_profiles(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  rule_code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'authority_confusion',
    'privileged_retrieval',
    'sensitive_egress',
    'unauthorized_action',
    'memory_poisoning',
    'source_laundering',
    'overblocking',
    'benign_allow',
    'inconclusive'
  )),
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  action TEXT NOT NULL CHECK (action IN ('allow', 'block', 'semantic_review')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  rationale TEXT NOT NULL,
  safe_alternative TEXT,
  example_allowed TEXT,
  example_blocked TEXT,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_profile_id, policy_version, rule_code)
);

CREATE TABLE IF NOT EXISTS scope_trace.evidence_packs (
  id TEXT PRIMARY KEY,
  agent_profile_id TEXT NOT NULL REFERENCES scope_trace.agent_profiles(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES scope_trace.runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES scope_trace.scenario_cases(id) ON DELETE CASCADE,
  plan_id TEXT,
  strategy_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('baseline', 'patched', 'observe', 'warn', 'enforce')),
  category TEXT NOT NULL CHECK (category IN (
    'authority_confusion',
    'privileged_retrieval',
    'sensitive_egress',
    'unauthorized_action',
    'memory_poisoning',
    'source_laundering',
    'overblocking',
    'benign_allow',
    'inconclusive'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'blocked_violation',
    'detected_violation',
    'missed_violation',
    'overblock',
    'benign_allowed',
    'inconclusive'
  )),
  decision_subject JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluator_summary TEXT NOT NULL,
  rejection_reason TEXT,
  safe_alternative JSONB,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  precedent_status TEXT NOT NULL CHECK (precedent_status IN ('candidate', 'approved', 'rejected')),
  recommended_hard_gate JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_owner ON scope_trace.customers(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON scope_trace.customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_customer ON scope_trace.crm_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON scope_trace.contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON scope_trace.tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_attack ON scope_trace.tickets(contains_attack, attack_case_id);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON scope_trace.ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_internal_documents_customer ON scope_trace.internal_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_slack_messages_customer ON scope_trace.slack_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_chunks_source ON scope_trace.retrieval_chunks(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_chunks_customer ON scope_trace.retrieval_chunks(customer_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_chunks_labels ON scope_trace.retrieval_chunks(source_trust, data_class, authority_scope, egress_policy);
CREATE INDEX IF NOT EXISTS idx_scenario_seed_records_case ON scope_trace.scenario_seed_records(case_id);
CREATE INDEX IF NOT EXISTS idx_intent_manifests_case ON scope_trace.intent_manifests(case_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_run_case ON scope_trace.trace_events(run_id, case_id);
CREATE INDEX IF NOT EXISTS idx_trace_events_policy ON scope_trace.trace_events(policy_decision);
CREATE INDEX IF NOT EXISTS idx_trace_event_sources_event ON scope_trace.trace_event_sources(event_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_run_case ON scope_trace.agent_outputs(run_id, case_id);
CREATE INDEX IF NOT EXISTS idx_findings_run_case ON scope_trace.findings(run_id, case_id);
CREATE INDEX IF NOT EXISTS idx_hard_gate_rules_agent_status ON scope_trace.hard_gate_rules(agent_profile_id, status, policy_version);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_agent_category ON scope_trace.evidence_packs(agent_profile_id, category, precedent_status);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_run_case ON scope_trace.evidence_packs(run_id, case_id);

CREATE INDEX IF NOT EXISTS idx_tickets_fts ON scope_trace.tickets USING GIN (to_tsvector('english', body));
CREATE INDEX IF NOT EXISTS idx_attachments_fts ON scope_trace.ticket_attachments USING GIN (to_tsvector('english', extracted_text));
CREATE INDEX IF NOT EXISTS idx_kb_fts ON scope_trace.support_kb_articles USING GIN (to_tsvector('english', body));
CREATE INDEX IF NOT EXISTS idx_crm_notes_fts ON scope_trace.crm_notes USING GIN (to_tsvector('english', body));
CREATE INDEX IF NOT EXISTS idx_contracts_fts ON scope_trace.contracts USING GIN (to_tsvector('english', summary || ' ' || termination_clause || ' ' || renewal_clause));
CREATE INDEX IF NOT EXISTS idx_internal_documents_fts ON scope_trace.internal_documents USING GIN (to_tsvector('english', body));
CREATE INDEX IF NOT EXISTS idx_slack_messages_fts ON scope_trace.slack_messages USING GIN (to_tsvector('english', body));
CREATE INDEX IF NOT EXISTS idx_retrieval_chunks_fts ON scope_trace.retrieval_chunks USING GIN (to_tsvector('english', chunk_text));
