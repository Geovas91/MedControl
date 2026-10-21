# ASSISTANT-002.3: context investigation

Status: original Staging failure NOT REPRODUCED locally; diagnostics added, no functional correction is claimed. The user confirmed `STAGING_SHA=e2dcf4f4d1e5701494944756190ac411dfc74210`; the failure reason is unavailable.

## Baseline and reproduction

The investigation starts at `e2dcf4f4d1e5701494944756190ac411dfc74210`.
Before changing application code, the following sequence passes:

1. Start with `null` context and an authenticated simulated actor/clinic.
2. Use `resolveConversationInput`, as the component does on the first turn with LLM disabled, for `Muéstrame mi agenda de mañana después de las 15:00.`
3. Execute `submitAssistantIntentWithContextAction` with a protected read returning zero appointments.
4. Feed its returned context into `planAssistantConversationWithContextAction` for `Mejor antes de las 12:00.`
5. Execute `submitAssistantIntentWithContextAction` again.

Both responses have state `appointments`. The second context retains `search_appointments`, the simulated actor and clinic, and the next clinic-local date; its filter is only an exclusive upper bound at `12:00`. No appointment is focused. Both reads execute.

The UI integration test loads the actual `AppointmentAssistant` component with a simulated React hook lifecycle, actual conversation modules, and actual server actions. Only the authentication/data/provider boundaries are simulated. It sends three turns through the component's form handler, including the change from client parsing to contextual server planning. It also passes without application changes.

These are local integration tests, not a real-browser test or proof of Staging behavior. An additional test now exercises the installed Next.js production React Flight codecs in both directions (response and subsequent action arguments) over three turns; it also passes before application changes. This codec test uses a server React build scoped to the server codec's import. It does not exercise the full deployed bundle, HTTP server, remote authentication, or live database. No Staging configuration or deployment was changed.

## Invalidation paths inspected

- `updateAssistantConversationContext` records `lastReadKind: appointments` and `lastResultCount: 0` for an empty agenda. It clears `focusedAppointmentRef`; it retains the read intent, date and time filter.
- `readAssistantConversationContext` accepts that context. Expiry and actor/clinic changes reset it with their respective reason. Malformed input follows the existing `created` path.
- `revalidateAssistantConversationContext` only invokes reference validators when patient, professional, appointment or selected-slot references exist. The fresh empty-agenda sequence contains none, so reference lookups cannot invalidate this sequence in the tested source.
- An unavailable reference causes `reason: invalidated` and resets the context. Separately, `loadAssistantContext` catches any validation exception and also labels it `invalidated`. The baseline diagnostics do not distinguish those two causes or identify a reference category.
- `submitAssistantIntentWithContextAction` displays the reported selection message when loading or post-read validation returns `invalidated`. A failed agenda read returning a normal safe error stays an error and preserves the previous context in the new test.

The exception-to-invalidation conversion is an observed code path, not a proven cause of the reported zero-result incident. No exception was observed in the exact reproduction. Changing this path speculatively would not establish the requested root cause.

## Safe diagnostics added

The existing `assistant_context_invalidated` event now distinguishes `reference_unavailable`, `reference_lookup_error`, and `validation_exception`, and includes a static reference category and validation outcome. A transition field distinguishes loading context from post-read/post-selection revalidation. No log is emitted for successful continuation. No identifier, name, message, credential, raw exception or provider payload is added.

The validators retain their existing return values, thrown-error behavior, and reset/authorization semantics. The diagnostic tests failed on the baseline (missing category/result) and pass with this instrumentation. That red/green evidence concerns the observability gap only, not the original empty-agenda failure. The patient availability helper's boolean contract still cannot distinguish an underlying safe false from a database error returned as false; this limitation remains explicit.

## Coverage

`tests/unit/appointment-assistant-context-reliability.test.ts` adds sixteen tests:

- Exact two-turn empty-agenda server sequence.
- Actual component form flow across three empty-result turns.
- Three turns beginning with an unfiltered read.
- One-result follow-up without mutation.
- Multiple-result follow-up without arbitrary selection.
- Expired context cannot reuse an appointment/date/filter.
- Cross-clinic context cannot reuse an appointment/date/filter.
- Lost authorization blocks actions before reads.
- A safe temporary agenda-read error remains distinct from empty results.
- A three-turn React Flight round trip with both response and action-argument codecs.
- Unavailable patient versus thrown patient-validator exception, with no reference/exception leakage.
- Post-read invalidation of a newly focused cancelled appointment, with no appointment-data leakage.
- Unavailable professional versus a failed protected lookup versus a thrown lookup exception.

Provider and mutation entry points fail immediately if called. The LLM flag is disabled. Existing focused suites also cover authorization, stale selections, proposal confirmation and one-shot execution; their success is local/mocked evidence only. Changed-professional resolution after an empty read has not been established by this reproduction test and remains an explicit gap.

The prior tests covered parser/filter/context pieces and server actions starting from already populated context. They did not combine the component's initial client-parsed turn with subsequent real contextual actions. The new integrated coverage closes that test gap, but the exact reported conversation still does not produce a failing baseline. The requested red-before-fix criterion for the functional incident is therefore NOT MET.

## Validation and remaining evidence

- Exact conversation, UI integration and Flight transport passed before application changes.
- Diagnostics tests fail before instrumentation and pass afterwards.
- All `appointment-assistant-*.test.ts` tests: 227 passed, 0 failed, 0 skipped (16 tests in the new investigation file).
- Lint: passed.
- Typecheck: passed.
- Diff check: passed.
- No migrations, fixtures, provider calls, deployment or production changes.

Needed to continue root-cause analysis: safe invalidation diagnostics for a failing attempt. The deployed SHA is now confirmed. Report only intent, transition, reason, reference category/presence and validation outcome, without reference values, user messages, patient names, tokens or credentials. The baseline generic `invalidated` reason alone cannot distinguish a stale reference from a thrown validator exception. Instrumentation is prepared for review in this PR; it has not been deployed.

This investigation must not be treated as a functional fix or release approval. Keep its PR in draft until the reported failure can be reproduced and a correction can be verified against that failing case.
