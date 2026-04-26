# ScopeTrace: Scalable Guardrails for Authorized AI Agents

## Deck Overview
- **Output mode**: `nano-banana-art`
- **Purpose**: hackathon keynote / product pitch deck
- **Audience**: AI safety hackathon judges, enterprise AI builders, product/security engineers
- **Narrative arc**: AI safety has mostly protected model conversations, but AX agents are becoming authorized actors that retrieve private data, call tools, mutate systems, and send information outward. ScopeTrace reframes safety as a runtime control plane over intent, tool use, data provenance, egress, evidence, and replay.
- **Total slides**: 5
- **Core thesis**: As agents gain authority, enterprises need guardrails that trace and enforce behavior, not just prompts or outputs.
- **Audience starting state -> ending state**: Starts with "agent safety is mostly prompt injection and output filtering"; ends with "agent safety needs scalable behavioral infrastructure around authority, provenance, and replayable evidence."

## Design Direction
- **Tone**: premium enterprise safety command deck; technical, urgent, restrained, not cyberpunk.
- **Mode-specific rendering logic**: image-first keynote slides generated with GPT Image 2; each slide must look like a native 16:9 presentation canvas, not a poster, paper sheet, framed print, or mockup scene.
- **Display font**: IBM Plex Sans Condensed style — compact, technical, authoritative.
- **Body font**: Suisse/Neue Haas Grotesk style — clean enterprise readability.
- **Color palette**:
  - Background: deep graphite black `#0B0F14`
  - Text: warm off-white `#F4EFE6`
  - Accent: signal red `#FF4B3E` for violations / authority breach
  - Secondary: electric cyan `#39D5FF` for legitimate system paths
  - Tertiary: muted amber `#E3A64B` for untrusted external input
- **Spatial signature**: left-aligned action title; right-side system diagram or authority map; bottom proof strip.
- **Texture**: very low grain, faint technical grid, subtle terminal-like trace lines.
- **Differentiator**: authority-boundary line that visually separates low-trust language from privileged actions.
- **Deck style lock target**:
  - Background family: dark graphite command-center slide canvas
  - Brightness range: dark, high contrast, text-first
  - Accent behavior: red only for risk/violation; cyan only for safe system flow; amber only for external/untrusted input
  - Texture intensity: very low
  - Illustration language: clean geometric system maps, thin trace lines, restrained icons, no 3D spectacle

## Design System Spec — `components.js`

Not applicable for build output because this deck uses `nano-banana-art`. If later converted to `html-system`, use the palette, typography, and spatial signature above as the source of truth.

## Narrative Logic Map

| Step | Logical move | Slides | Audience reaction |
|------|-------------|--------|-------------------|
| 1 | Establish that AI safety was built around models that answer | 1 | "Yes, current safety mostly protects conversation/output." |
| 2 | Show that agent autonomy changes the unit of risk | 2 | "The problem is now authority, not just content." |
| 3 | Define the concrete failure mode | 3 | "I understand what breaks in enterprise agents." |
| 4 | Introduce the required future architecture | 4 | "Guardrails must follow intent-to-egress, not sit at the end." |
| 5 | Position ScopeTrace as the implementation | 5 | "This product makes that safety layer traceable and replayable." |

## Slide Plan

## Mode-Specific Build Notes
- **Viewer behavior**: image-first review; save prompts under `prompts/` and final images under `images/`. Optional browser viewer can be added after all slides are approved.
- **Anchor slides first**: Slide 1 first, then Slide 3 or Slide 5 after approval. Slide 1 establishes style; Slide 3/5 proves the diagram/product credibility.
- **Slide-frame guardrails**: every prompt must say native 16:9 presentation slide canvas, full-bleed slide composition, no paper edges, no page curl, no desk, no wall, no mounted poster, no framed-board look, no mockup scene.
- **Deck consistency guardrails**: keep dark graphite background, low grain, red/cyan/amber semantic accents, thin geometric trace lines, and restrained enterprise command-center polish across the deck.
- **Export target**: image set first; optional PDF wrapper/viewer later.

### Slide 1 — Situation
- **Action title**: "Today’s AI safety stack was built for models that answer, not agents that act."
- **Slide type**: opener / AS-IS framework
- **Nano task family**: `diagram-explainer`
- **Layout**: left title and thesis block; center-left current safety stack around a chat model; right edge shows emerging cracks where tools, memory, CRM, and egress appear.
- **Narrative role**: Establishes the current safety baseline and creates the first gap. The audience needs to agree that current safety is model/output-centric before the deck can argue for behavior-level guardrails.
- **Setup -> Evidence -> Takeaway**:
  - *Setup*: Current AI safety primarily protects conversations: prompts, outputs, model behavior, and content risk.
  - *Evidence*: Prompt policy, jailbreak test, content filter, model eval, output moderation, and static access rules sit around the model, but tool calls and side effects begin escaping that frame.
  - *Takeaway*: This protects conversations; it does not fully govern authorized actions.
- **Primary content**:
  - Prompt policies: define what the model should or should not say, but do not trace downstream tool authority.
  - Jailbreak tests: probe model robustness, but usually stop before enterprise workflow execution.
  - Content filters: catch unsafe or sensitive text at the response boundary, but not the retrieval path that produced it.
  - Model evals: measure model behavior in test cases, but rarely govern live tool/data transitions.
  - Static access rules: restrict broad permissions, but do not decide whether a specific action follows the user's original intent.
- **Supporting section**: bottom callout: "This protects conversations. It does not fully govern actions."
- **Nano prompt notes**:
  - Audience: AI safety judges and enterprise AI builders.
  - Product truth: The deck must prove that agent safety needs a system-level frame beyond prompt/output controls.
  - Why now: AX agents are beginning to retrieve, mutate, remember, and send.
  - Emotional target: clear recognition of a structural gap, not panic.
  - Proof detail: show tool call, CRM update, external email, and memory write emerging beyond the old chat safety perimeter.
  - Slide-frame guardrails: native slide canvas only; no paper/poster/mockup environment.
- **Bridge to next**: If current safety was built for conversation, the next slide explains why increasing autonomy turns the problem into authority control.
- **Source**: product thesis and current ScopeTrace PRD framing.

### Slide 2 — Complication
- **Action title**: "As agents gain autonomy, the safety problem becomes authority control."
- **Slide type**: autonomy expansion map
- **Nano task family**: `diagram-explainer`
- **Layout**: central agent core with four expanding axes: tools, private context, side effects, memory.
- **Narrative role**: Shows why agent safety is structurally harder than chatbot safety.
- **Setup -> Evidence -> Takeaway**:
  - *Setup*: Agents are moving from answering to operating across enterprise systems.
  - *Evidence*: They gain more tools, more private context, more side effects, and longer memory.
  - *Takeaway*: Prompt-only safety does not scale with expanding authority.
- **Primary content**:
  - More tools: search, retrieve, update, send, route.
  - More private context: CRM, contracts, tickets, Slack, internal docs.
  - More side effects: customer emails, CRM mutation, workflow routing.
  - Longer memory: persistent preferences and cross-session state.
- **Supporting section**: "The more authority an agent has, the less prompt-only safety scales."
- **Nano prompt notes**: maintain same dark command-center system map style.
- **Bridge to next**: Defines why the real failure mode is low-trust input causing high-authority action.
- **Source**: ScopeTrace PRD and app architecture.

### Slide 3 — Complication
- **Action title**: "The critical failure is when untrusted input causes privileged action."
- **Slide type**: attack path / violation map
- **Nano task family**: `diagram-explainer`
- **Layout**: horizontal attack path with boundary breach: external ticket -> agent tool chain -> internal data -> external output/mutation.
- **Narrative role**: Converts the abstract autonomy problem into a concrete enterprise failure mode.
- **Setup -> Evidence -> Takeaway**:
  - *Setup*: Agent risk emerges when low-trust language influences high-trust systems.
  - *Evidence*: Customer tickets can trigger contract search, private Slack leakage, CRM approval mutation, covert URL egress, or memory poisoning.
  - *Takeaway*: The problem is authority laundering, not just prompt injection.
- **Primary content**:
  - Privileged retrieval.
  - Sensitive egress.
  - Unauthorized mutation.
  - Memory poisoning.
  - Source laundering.
- **Supporting section**: "The risk is not that the model says something strange. The risk is that language becomes authority."
- **Nano prompt notes**: this should be the second anchor after Slide 1 if continuing.
- **Bridge to next**: Sets up the need for guardrails across the full intent-to-egress path.
- **Source**: ScopeTrace scenario and policy categories.

### Slide 4 — Resolution
- **Action title**: "Future guardrails must control the full path from intent to egress."
- **Slide type**: target architecture
- **Nano task family**: `diagram-explainer`
- **Layout**: runtime control plane over intent manifest, data provenance, tool scope, runtime decision, egress check, replay evidence.
- **Narrative role**: Defines the TO-BE safety architecture before introducing ScopeTrace as the implementation.
- **Setup -> Evidence -> Takeaway**:
  - *Setup*: A single output filter cannot govern multi-step agent behavior.
  - *Evidence*: Each action needs intent, source, tool, recipient, and policy context.
  - *Takeaway*: Agent safety must be a runtime control plane.
- **Primary content**:
  - Intent Manifest.
  - Data Provenance.
  - Tool Scope.
  - Runtime Decision.
  - Egress Check.
  - Replay Evidence.
- **Supporting section**: "Not just: Is this output safe? But: Was this action authorized by the original intent?"
- **Nano prompt notes**: more architectural, less dramatic; same style lock.
- **Bridge to next**: Opens the door for ScopeTrace.
- **Source**: ScopeTrace architecture.

### Slide 5 — Resolution
- **Action title**: "ScopeTrace makes agent guardrails traceable, enforceable, and replayable."
- **Slide type**: product proof / lifecycle
- **Nano task family**: `diagram-explainer`
- **Layout**: observe vs enforce split plus lifecycle loop: red-team -> evidence -> hard gate -> enforce -> replay -> improve.
- **Narrative role**: Lands the product and why the demo matters.
- **Setup -> Evidence -> Takeaway**:
  - *Setup*: Guardrails are credible only if they produce evidence and survive replay.
  - *Evidence*: ScopeTrace records scenario cases, intent manifest, tool timeline, findings, evidence packs, hard gates, and replay proof.
  - *Takeaway*: ScopeTrace is behavioral safety infrastructure for authorized AI agents.
- **Primary content**:
  - Scenario Cases.
  - Intent Manifest.
  - Tool Timeline.
  - Policy Findings.
  - Evidence Packs.
  - Replay Proof.
- **Supporting section**: "A guardrail is credible only when the same attack can be replayed after the patch."
- **Nano prompt notes**: product credibility, not abstract AI art.
- **Bridge to next**: closing slide.
- **Source**: current ScopeTrace app E2E.

## Density Gate
All non-title slides include body context, at least four primary content items, and a supporting section. Slide 1 is an opener but still includes five AS-IS safety elements plus a bottom callout.

## Narrative Substance Gate
- **So What**: Each slide moves from model-output safety toward authority-level behavioral safety.
- **Evidence, Not Labels**: Each slide includes concrete agent system elements such as tool calls, CRM mutation, egress, memory, trace, findings, replay.
- **Bridge**: The sequence moves from AS-IS -> autonomy shift -> failure mode -> TO-BE architecture -> ScopeTrace implementation.
- **Internal Flow**: Each slide has setup, evidence, and takeaway.

## Storyline Test
1. Today’s AI safety stack was built for models that answer, not agents that act.
2. As agents gain autonomy, the safety problem becomes authority control.
3. The critical failure is when untrusted input causes privileged action.
4. Future guardrails must control the full path from intent to egress.
5. ScopeTrace makes agent guardrails traceable, enforceable, and replayable.

### Chain Coherence Check
The titles form a complete argument: current safety is conversation-centric; agent autonomy changes the safety object; the central failure is authority transfer; the future architecture must control the full action path; ScopeTrace is the implementation that traces, enforces, and replays that path.
