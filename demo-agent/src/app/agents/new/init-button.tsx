"use client";

import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw } from "lucide-react";
import { useState } from "react";

export function InitButton({ label, mode }: { label: string; mode: "init" | "reinit" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function initialize() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/scope/hard-gates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persist: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Initialization failed");
      router.push("/scope");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <>
      <button className={mode === "init" ? "btn btn-primary" : "btn"} disabled={pending} onClick={initialize} type="button">
        {pending ? <span className="spinner" /> : mode === "init" ? <Sparkles size={14} /> : <RefreshCw size={14} />}
        {pending ? (mode === "init" ? "Initializing…" : "Drafting…") : label}
      </button>
      {error ? <p className="error-text">{error}</p> : null}
    </>
  );
}
