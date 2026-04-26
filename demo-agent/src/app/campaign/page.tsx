import { CampaignFlow } from "./campaign-flow";
import { getCases } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function CampaignPage() {
  const cases = await getCases();
  const redTeamCases = cases
    .filter((c) => c.case_type === "red_team")
    .map((c) => ({ id: c.id, title: c.title, customer_name: c.customer_name ?? "—", attack_surface: c.attack_surface }));

  return (
    <main className="shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Campaign</p>
          <h1>Red-team campaign</h1>
          <p className="lead">Convert a red-team goal into structured attack strategies, run specialist attackers in parallel, and review every payload, trace, and policy decision.</p>
        </div>
      </header>
      <CampaignFlow cases={redTeamCases} />
    </main>
  );
}
