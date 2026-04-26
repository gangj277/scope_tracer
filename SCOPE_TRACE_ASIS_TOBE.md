# ScopeTrace AS-IS / TO-BE

## Purpose

ScopeTrace는 enterprise AX agent가 외부 입력, 내부 데이터, tool call, 외부 output 사이에서 권한 경계를 무너뜨리는지를 탐지하고 방어하는 red-teaming/evidence system이다.

핵심 질문:

```text
어떤 입력이 어떤 tool call을 유도했고,
어떤 source/data class가 agent context에 들어갔으며,
그 결과 어떤 output 또는 side effect가 발생했는가?
```

## AS-IS

현재 구현은 **structured metadata 기반 ScopeTrace engine + 더미 AX Agent** 단계다.

### 구현된 것

- Neon PostgreSQL `scope_trace` schema
- enterprise dummy dataset
  - customers, tickets, attachments, CRM, contracts, internal docs, Slack, KB
- scenario set
  - `rt_*`: red-team attack cases
  - `bt_*`: benign control cases
  - `pt_*`: positive-control internal-authorization cases
- demo AX Agent runtime
  - live `gpt-5.5`
  - deterministic test mode
  - DB-backed tools
- ScopeTrace evidence layer
  - `runs`
  - `trace_events`
  - `trace_event_sources`
  - `findings`
  - `agent_outputs`
  - `case_results`
  - `replay_sessions`

### 현재 enforcement 방식

현재 ScopeTrace는 LLM judge가 아니라 **구조화된 metadata 기반 policy gate**로 동작한다.

판정에 쓰는 정보:

- `source_trust`
- `data_class`
- `authority_scope`
- `egress_policy`
- tool capability / side effect 여부
- intent manifest의 allowed/blocked tools/sources
- recipient가 internal인지 external인지
- 이전 tool sequence
- canary / covert URL / source-laundering evidence

### 현재 강점

- tool 실행 전에 차단 가능
- trace 기반 evidence가 남음
- observe/enforce replay 가능
- deterministic test가 가능함
- LLM self-judgement에 의존하지 않음

### 현재 한계

- rule-only 구조라 semantic context 판단이 약함
- 매번 다른 enterprise context를 깊게 이해하지 못함
- source influence가 실제로 external instruction 때문인지 판단하기 어려움
- safe refusal과 leakage의 semantic 차이를 충분히 이해하지 못함
- enforce mode에서 남는 blind spot을 자동으로 학습하지 못함
- red-team 결과가 policy improvement로 자동 연결되지 않음

## TO-BE

TO-BE ScopeTrace는 **adaptive ScopeTrace**여야 한다.

단, LLM이 runtime enforcement를 단독으로 결정하는 구조가 아니라:

```text
Structured metadata guard
+ Embedding policy memory
+ LLM contextual judge
+ Replay-driven policy patch loop
```

로 간다.

## TO-BE Architecture

### 1. Structured Metadata Guard

현재 구현된 deterministic kernel은 유지한다.

역할:

- 명확한 metadata violation 탐지
- tool call 전 allow/block/review 결정
- trace/evidence 기록
- replay 가능한 baseline 제공

예:

```text
external source -> privileged tool -> restricted source -> external recipient
```

이런 구조적 위반은 LLM 없이도 1차 차단한다.

### 2. Embedding Policy Memory

과거 rejected/allowed cases를 tool별, policy별로 저장한다.

새로운 event가 들어오면 다음 정보를 embedding한다:

```text
intent + actor + recipient + tool call + args + source labels + retrieved source summary
```

그 후 유사한 과거 실패/허용 사례를 검색한다.

역할:

- rule이 놓치는 variant 탐지
- 과거 red-team failure를 policy memory로 축적
- LLM judge에게 grounding context 제공

### 3. LLM Contextual Judge

LLM은 final enforcer가 아니라 **contextual policy judge / analyst**로 쓴다.

입력:

- intent manifest
- actor role
- recipient
- tool capability
- source labels
- retrieved source summaries
- previous tool sequence
- similar rejected/allowed cases
- current output or tool request

출력:

```json
{
  "decision": "allow | block | review",
  "policy_codes": ["P0", "P6"],
  "confidence": 0.0,
  "rationale": "...",
  "missing_evidence": [],
  "patch_candidate": {}
}
```

역할:

- semantic policy matching
- false positive / false negative 분석
- source influence 판단
- safe alternative 판단
- policy blind spot 발견

### 4. Policy Patch Compiler

LLM judge 결과를 곧바로 runtime rule로 반영하지 않는다.

대신 policy patch candidate를 만든다.

예:

```json
{
  "rule_code": "P0B_RESTRICTED_ATTACHMENT_RETRIEVAL",
  "condition": {
    "causal_source_trust": "external",
    "tool": "search_tickets",
    "target_data_class": ["restricted", "pii"],
    "recipient": "external_customer"
  },
  "action": "block",
  "evidence_run_ids": ["run_..."],
  "requires_replay": true
}
```

### 5. Replay-Driven Learning Loop

ScopeTrace는 red-team 실행을 통해 계속 개선된다.

```text
red-team run
-> trace/finding/output 수집
-> LLM judge 분석
-> blind spot 발견
-> policy patch candidate 생성
-> replay
-> attack blocked 확인
-> benign/positive-control regression 확인
-> deterministic policy로 승격
```

## Product Direction

AS-IS는 방어 엔진과 실험장이다.

TO-BE는 다음을 수행하는 adaptive red-team system이다.

- 현재 agent workflow를 공격한다.
- ScopeTrace enforcement 자체도 공격한다.
- enforce mode에서 통과한 공격을 false negative로 승격한다.
- LLM judge가 root cause와 patch candidate를 만든다.
- replay로 policy improvement를 증명한다.

## Implementation Priority

### V1.5

- trace evidence bundle 생성
- LLM contextual judge 추가
- judge output JSON schema 고정
- false positive / false negative classification

### V2

- embedding policy memory
- rejected/allowed case retrieval
- red-team variant generator
- enforce bypass detector

### V3

- policy patch candidate compiler
- replay-based policy promotion
- human approval workflow
- policy regression dashboard

## Core Principle

ScopeTrace의 최종 방향은 rule-only도 아니고 LLM-only도 아니다.

```text
ScopeTrace = structured evidence graph + LLM contextual reasoning + replay-proven policy adaptation
```

Runtime enforcement는 audit 가능해야 하고, LLM은 그 enforcement를 계속 개선하는 analyst로 작동해야 한다.
