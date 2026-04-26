"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

export function ReplayAllButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function replayAll() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelMode: "deterministic" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Replay failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className="btn btn-primary" disabled={pending} onClick={replayAll} type="button">
        {pending ? <span className="spinner" /> : <RefreshCw size={14} />}
        {pending ? "Replaying suite" : "Replay red-team suite"}
      </button>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
