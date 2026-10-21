# ASSISTANT-002.3: context investigation

Status: original Staging failure NOT REPRODUCED locally; no runtime correction is claimed.

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

These are local integration tests, not a real-browser test or proof of Staging behavior. They do not exercise Next.js Flight transport, the deployed bundle, remote authentication, or the live database. No Staging configuration or deployment was changed.

## Invalidation paths inspected

- `updateAssistantConversationContext` records `lastReadKind: appointments` and `lastResultCount: 0` for an empty agenda. It clears `focusedAppointmentRef`; it retains the read intent, date and time filter.
- `readAssistantConversationContext` accepts that context. Expiry and actor/clinic changes reset it with their respective reason. Malformed input follows the existing `created` path.
- `revalidateAssistantConversationContext` only invokes reference validators when patient, professional, appointment or selected-slot references exist. The fresh empty-agenda sequence contains none, so reference lookups cannot invalidate this sequence in the tested source.
- An unavailable reference causes `reason: invalidated` and resets the context. Separately, `loadAssistantContext` catches any validation exception and also labels it `invalidated`. Existing diagnostics do not distinguish those two causes or identify a reference category.
- `submitAssistantIntentWithContextAction` displays the reported selection message when loading or post-read validation returns `invalidated`. A failed agenda read returning a normal safe error stays an error and preserves the previous context in the new test.

The exception-to-invalidation conversion is an observed code path, not a proven cause of the reported zero-result incident. No exception was observed in the exact reproduction. Changing this path speculatively would not establish the requested root cause.

## Coverage

`tests/unit/appointment-assistant-context-reliability.test.ts` adds nine tests:

- Exact two-turn empty-agenda server sequence.
- Actual component form flow across three empty-result turns.
- Three turns beginning with an unfiltered read.
- One-result follow-up without mutation.
- Multiple-result follow-up without arbitrary selection.
- Expired context cannot reuse an appointment/date/filter.
- Cross-clinic context cannot reuse an appointment/date/filter.
- Lost authorization blocks actions before reads.
- A safe temporary agenda-read error remains distinct from empty results.

Provider and mutation entry points fail immediately if called. The LLM flag is disabled. Existing focused suites also cover authorization, stale selections, proposal confirmation and one-shot execution; their success is local/mocked evidence only. Changed-professional resolution after an empty read has not been established by this reproduction test and remains an explicit gap.

The prior tests covered parser/filter/context pieces and server actions starting from already populated context. They did not combine the component's initial client-parsed turn with subsequent real contextual actions. The new integrated coverage closes that test gap, but still does not produce a failing baseline. The requested red-before-fix criterion is therefore NOT MET.

## Validation and remaining evidence

- New tests: 9 passed before any application correction.
- All `appointment-assistant-*.test.ts` tests: 220 passed, 0 failed, 0 skipped.
- Typecheck: passed.
- No migrations, fixtures, provider calls, deployment or production changes.

Needed to continue root-cause analysis: the exact deployed SHA and safe invalidation diagnostics for the failing attempt. If available, report only intent, transition, reason, reference category/presence and validation outcome, without reference values, user messages, patient names, tokens or credentials. The existing generic `invalidated` reason alone cannot distinguish a stale reference from a thrown validator exception.

This investigation must not be treated as a functional fix or release approval. Keep its PR in draft until the reported failure can be reproduced and a correction can be verified against that failing case.
