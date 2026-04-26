"use client";

import { useRouter } from "next/navigation";
import { Play, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { RunMode } from "@/lib/types";

export function RunControls({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<RunMode | "replay" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: RunMode) {
    setPending(mode);
    setError(null);
    try {
      const runRes = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, caseIds: [caseId] }),
      });
      const runBody = await runRes.json();
      if (!runRes.ok) throw new Error(runBody.error ?? "Run creation failed");

      const execRes = await fetch(`/api/runs/${runBody.runId}/cases/${caseId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, modelMode: "deterministic" }),
      });
      const execBody = await execRes.json();
      if (!execRes.ok) throw new Error(execBody.error ?? "Case execution failed");

      router.push(`/runs/${runBody.runId}/cases/${caseId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  async function replay() {
    setPending("replay");
    setError(null);
    try {
      const res = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: [caseId], modelMode: "deterministic" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Replay failed");
      router.push(`/runs/${body.enforceRunId}/cases/${caseId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="btn-row">
        <button className="btn" disabled={Boolean(pending)} onClick={() => run("observe")} type="button">
          {pending === "observe" ? <span className="spinner" /> : <Play size={14} />}
          {pending === "observe" ? "Running" : "Observe"}
        </button>
        <button className="btn btn-primary" disabled={Boolean(pending)} onClick={() => run("enforce")} type="button">
          {pending === "enforce" ? <span className="spinner" /> : <ShieldCheck size={14} />}
          {pending === "enforce" ? "Running" : "Enforce"}
        </button>
        <button className="btn btn-accent" disabled={Boolean(pending)} onClick={replay} type="button">
          {pending === "replay" ? <span className="spinner" /> : <RefreshCw size={14} />}
          {pending === "replay" ? "Replaying" : "Replay both"}
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
