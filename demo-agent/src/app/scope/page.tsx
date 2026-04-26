import { ScopePanels } from "./scope-panels";

export const dynamic = "force-dynamic";

export default function ScopePage() {
  return (
    <main className="shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Scope</p>
          <h1>ScopeTrace policy review</h1>
          <p className="lead">Draft hard-gate rules from the agent profile and convert attack results into evidence-pack precedents. Approved rules and packs become the runtime decision input.</p>
        </div>
      </header>
      <ScopePanels />
    </main>
  );
}
