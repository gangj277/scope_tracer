import { InspectForm } from "./inspect-form";
import { getCases } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function InspectPage() {
  const cases = await getCases();
  return (
    <main className="shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Inspect</p>
          <h1>Runtime decision inspector</h1>
          <p className="lead">Probe how ScopeTrace would decide a proposed tool call without executing it. Approved hard gates → category router → approved evidence packs → deterministic or LLM semantic decision.</p>
        </div>
      </header>
      <InspectForm cases={cases.map((c) => ({ id: c.id, title: c.title }))} />
    </main>
  );
}
