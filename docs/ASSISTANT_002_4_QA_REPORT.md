# ASSISTANT-002.4 — Automated Appointment Assistant QA Bundle

## Scope and baseline

- Baseline: `eec7274b108394664f98daff52da03488a0ffe55` on `main`.
- This branch adds a reusable local command: `npm run test:assistant:qa`.
- The bundle uses the Node.js test runner and mocks authentication, provider and protected-data boundaries. It neither calls Staging nor performs real mutations.
- It does not modify production assistant behavior, migrations, RLS, authorization rules, environment variables or external integrations.

## Execution levels

| Level | Status | Evidence |
| --- | --- | --- |
| Unit/integration | Executed locally | `npm run test:assistant:qa`; mocked server boundaries and real orchestration/contracts |
| Browser E2E | NOT RUN | No dedicated Appointment Assistant Playwright workflow, authenticated QA browser credentials, or isolated lifecycle fixture were available. Existing browser suites do not cover this component. |
| Live Staging smoke | BLOCKED | No explicit live-QA flag, QA browser credentials, Supabase QA credentials, verified isolated temporary fixture, or approved cleanup evidence was available locally. No remote read/write was attempted. |
| OpenAI provider | BLOCKED | No explicit live-provider flag or API key was available. Provider behavior is covered only with mocks. |

## Test architecture

`scripts/test-appointment-assistant-qa.mjs` discovers every `tests/unit/appointment-assistant-*.test.ts` file deterministically and invokes the project’s registered TypeScript loader. The focused suites exercise the actual parser, context orchestration, domain gate, planner contracts, read/mutation registry and UI component with controlled mock boundaries.

`tests/unit/appointment-assistant-qa-bundle.test.ts` is a compact acceptance layer for incomplete creation/amendment, scope and expiry isolation, structured-reference shape validation, deterministic provider fallback and domain-gate rejection. It complements rather than replaces the specialized suites.

## Scenario evidence

| Scenario | Level executed | Status | Evidence |
| --- | --- | --- | --- |
| QA-001 incomplete creation | Unit | PASS | `appointment-assistant-qa-bundle.test.ts` |
| QA-002 patient selection | Unit | PASS | `appointment-assistant-patient-autocomplete.test.ts` |
| QA-003 professional selection | Unit | PASS | `appointment-assistant-patient-autocomplete.test.ts` |
| QA-004 availability | Unit | PASS | `appointment-assistant-time-filters.test.ts`, `appointment-assistant-read-tools.test.ts` |
| QA-005 creation proposal | Unit | PASS | `appointment-assistant-confirm-eligibility.test.ts` |
| QA-006 confirm creation | Unit | PASS | `appointment-assistant-confirm-eligibility.test.ts` |
| QA-007 duplicate confirmation | Unit | PASS | `appointment-assistant-confirm-eligibility.test.ts` |
| QA-008 date search | Unit | PASS | `appointment-assistant-read-tools.test.ts` |
| QA-009 upcoming appointments | Unit | PASS | `appointment-assistant-llm-planner.test.ts` |
| QA-010 appointment selection | Unit | PASS | `appointment-assistant-qa-bundle.test.ts`, `appointment-assistant-structured-selection.test.ts` |
| QA-011 reschedule proposal | Unit | PASS | `appointment-assistant-tools.test.ts`, `appointment-assistant-proposal-amendments.test.ts` |
| QA-012 confirm rescheduling | Unit | PASS | `appointment-assistant-confirm-eligibility.test.ts` |
| QA-013 cancellation confirmation | Unit | PASS | `appointment-assistant-confirm-eligibility.test.ts` |
| QA-014 three turns | Unit | PASS | `appointment-assistant-context-reliability.test.ts` |
| QA-015 empty-result continuity | Unit | PASS | `appointment-assistant-context-reliability.test.ts` |
| QA-016 selection continuity | Unit | PASS | `appointment-assistant-structured-selection.test.ts`, `appointment-assistant-context-reliability.test.ts` |
| QA-017 correction of draft | Unit | PASS | `appointment-assistant-qa-bundle.test.ts`, `appointment-assistant-proposal-amendments.test.ts` |
| QA-018 context isolation | Unit | PASS | `appointment-assistant-qa-bundle.test.ts`, `appointment-assistant-ephemeral-context.test.ts` |
| QA-019 natural-language classification | Unit | PASS | `appointment-assistant-llm-planner.test.ts` |
| QA-020 real provider request | Live provider | BLOCKED | Explicit live-provider flag and configured key absent; no paid request was made. |
| QA-021 provider fallback | Unit | PASS | `appointment-assistant-qa-bundle.test.ts`, `appointment-assistant-llm-planner.test.ts` |
| QA-022 LLM safety boundaries | Unit | PASS | `appointment-assistant-qa-bundle.test.ts`, `appointment-assistant-domain-gate.test.ts` |
| QA-023 tenant isolation | Unit | PASS | `appointment-assistant-patient-autocomplete.test.ts`, `appointment-assistant-read-tools.test.ts` |
| QA-024 authentication enforcement | Unit | PASS | `appointment-assistant-confirm-eligibility.test.ts`, `appointment-assistant-context-reliability.test.ts` |
| QA-025 confirmation required | Unit | PASS | `appointment-assistant-tools.test.ts`, `appointment-assistant-confirm-eligibility.test.ts` |
| QA-026 stale references | Unit | PASS | `appointment-assistant-qa-bundle.test.ts`, `appointment-assistant-context-reliability.test.ts` |
| QA-027 concurrent confirmation | Unit | PASS | `appointment-assistant-confirm-eligibility.test.ts` |
| QA-028 unavailable slot | Unit | PASS | `appointment-assistant-confirm-eligibility.test.ts`, `appointment-assistant-tools.test.ts` |
| QA-029 temporary read failure | Unit | PASS | `appointment-assistant-context-reliability.test.ts` |
| QA-030 expired context | Unit | PASS | `appointment-assistant-qa-bundle.test.ts`, `appointment-assistant-ephemeral-context.test.ts` |

## Results and limits

Executed locally: `npm run test:assistant:qa` — 234 passed, 0 failed, 0 skipped. Scenario results in this table mean unit/integration execution only; they are not browser or Staging claims.

- PASS: 29 unit/integration scenarios.
- FAIL: 0.
- BLOCKED: 1 scenario (QA-020) at the live-provider level.
- NOT RUN: Browser E2E and the live Staging lifecycle.
- Fixture cleanup: NOT APPLICABLE locally; no fixture was created.

The existing QA seed and cleanup utilities operate on persistent QA datasets and are not used by this bundle. They cannot satisfy the temporary-fixture requirement without a dedicated isolated lifecycle fixture and an exact, idempotent cleanup contract that preserves pre-existing baseline records.

## Security and remaining risks

The local suite covers authorization rejection, tenant scoping, one-shot claims, confirmation-only mutation flow, expired/stale context handling, protected reference shape validation, provider fallback, prompt injection and medical-domain rejection. It does not prove real browser authentication, RLS behavior against Staging, provider success, external notification isolation or cleanup against a remote database.

No root cause for a new functional defect was established. The original conversational-context incident remains outside the scope of this QA infrastructure change and is not claimed resolved.

## Recommendation for ASSISTANT-003

Do not approve a full lifecycle release based solely on this bundle. First provision a dedicated disposable QA clinic and account, an exact cleanup mechanism for newly created appointment records, isolated notification/calendar channels, browser credentials, and an explicit live-provider opt-in. Then execute the browser and Staging levels and record their results separately.
