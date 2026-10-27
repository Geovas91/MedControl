# V1-01 — Next.js security update

Local review and validation: **2026-10-27**. Branch: `codex/v1-01-nextjs-security-update`, created directly from the reviewed Staging integration `d1079819eec335244c2848ad45ffb0e1864f665f`. Main (`eec7274…`), PR #95's branch (`cf7c969…`) and the SMTP branch (`d668ec5…`) are unchanged. No experimental commits were incorporated. No push, merge, deployment, migration or remote configuration change is part of this delivery.

## Selection and change boundary

Select exact **Next.js16.4.3**, a stable16.x release with fixes beyond the first patched16.4.1, and align `eslint-config-next` with that release. The registry declares Node>=20.9.0 and React19 compatibility; the existing React/ReactDOM19.2.7 are unchanged. The installed bundled upgrade/Server Actions guides and the upstream release/advisory were reviewed. No codemod, application refactor, runtime feature or security-policy change is needed.

| Dependency | Baseline lockfile | Resulting lockfile | Reason |
| --- | --- | --- | --- |
| `next` / `@next/env` / platform SWC packages | 16.3.3 | 16.4.3 | Patched framework and matching internal packages |
| `eslint-config-next` / `@next/eslint-plugin-next` | 16.2.7 | 16.4.3 | Match framework tooling; pin the direct config exactly |
| `sharp` / platform sharp binaries | 0.35.4 | 0.35.5 | Patched image dependency required by Next; associated libvips artifacts1.3.3→1.3.4 |
| `source-map-js` | 1.2.1 | 1.2.2 | Remove affected production dependency within the existing range |
| `baseline-browser-mapping` | 2.10.32 | 2.11.33 | Remove affected production dependency within the existing range |
| `react` / `react-dom` | 19.2.7 | 19.2.7 | Unchanged |

Only the two direct framework/tooling pins change in `package.json`. The lockfile changes are confined to these packages and their matching native/internal artifacts. No overrides, new direct dependencies, blind major updates or `npm audit fix --force` are used. Application, Supabase, SQL, outbound guards, role checks, subscriptions and document code remain byte-for-byte identical to the baseline. The other changed file is this validation/advisory report.

Upstream evidence:

- [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r): App Router with Server Actions can be denied service; affected16.x versions through16.4.0, patched16.4.1. CliniControl uses that pattern. No exploit is executed.
- [Release16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3): stable maintenance release, rather than canary.
- [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): image-optimization advisory; upstream documents patched Next and sharp>=0.35.5. This update meets both version conditions without asserting that the previous application's RCE path was demonstrated.
- The baseline registry audit also reported source-map-js [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) and baseline-browser-mapping [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv). Both disappear from the resulting production audit.

## Executed checks

Windows x64, **Node22.23.2 / npm12.0.0**. Commands use the pinned local Node runtime on PATH.

| Check | Result / scope |
| --- | --- |
| `npm ci --no-audit --no-fund` | PASS;446 packages installed; SHA-256 of the resulting lockfile unchanged by installation |
| `npm run build` | PASS; Next16.4.3, default Turbopack production build and generated types |
| `npm run lint` | PASS, exit0;0 errors,2 warnings described below |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS after the production build |
| `npm run test:unit` | **823 PASS,0 FAIL,0 SKIP** |
| `npm run test:auth-oauth` | PASS; actual redirect/origin/profile helper assertions, no OAuth-provider request |
| Existing public browser suite on the production build | **40 PASS**; authenticated patient-write test explicitly excluded |
| Existing Assistant browser suite | **14 PASS**; actual forms/components with simulated persistence/providers and blocked external connections in the harness |
| Actual Next Server Action HTTP smoke checks | **4 PASS**; empty-input login, registration, password recovery and password reset, one POST each followed by the expected error/message redirect |
| `npm audit --omit=dev` | **0 critical /0 high /0 moderate /0 low**, exit0 |
| `npm audit` including development dependencies | **0 critical /4 high /1 moderate** by affected package, exit1; evaluated individually below |
| Git diff whitespace/scope checks | PASS; no application or security-control source change |

The full unit suite includes real React Flight serialization and mocked Server Action regressions, appointment lifecycle/conflicts/availability, clinical notes, actual PDF rendering with synthetic evidence, consent signing, tenant/role checks, PayPal handlers and outbound isolation. These are executed local tests; mock/source-assertion cases are not live database RLS or real-provider verification. The823 count belongs to the integration baseline plus this dependency update; it deliberately excludes the82 tests on the unrelated SMTP branch. Browser counts are separate, not part of823.

Public browser tests use loopback addresses and literal synthetic configuration, with LLM/read tools/WhatsApp disabled and outbound blocked. Provider keys are dummy values; `.env` files are not edited. The build/test child processes override configured endpoints so local checks do not use real Supabase/payment/patient data. The browser tests cover320–1440px public routes, protected redirects, OAuth error callbacks/canonical origin, auth field behavior, response headers and automated accessibility. The excluded patient test would require an authenticated database and mutations, so no live clinical journey is claimed.

The four additional HTTP smoke checks launch the actual production Next server on127.0.0.1, use a fresh headless browser context that aborts nonlocal requests, and submit the existing empty forms with client-side HTML validation bypassed. They require one POST and the expected error/message redirect per form. These exercise real Next Server Action dispatch, response and navigation, not just a transpiled service or mocked action. The selected empty-input branches reject/skip provider operations; this is not a successful sign-in, registration or password mutation against Supabase. To reproduce, use the same synthetic configuration, visit `/login`, `/register`, `/forgot-password` and `/reset-password`, set the form's `noValidate` property, submit empty values, and check the safe redirect plus one local POST. No test or application source was changed for these transient Playwright checks.

Non-failing warnings: the new matching Next ESLint rules flag existing `window.location.assign()` in `tests/assistant-browser/patient-actions.ts` at lines6 and12. This is the isolated browser harness, not application navigation; it remains unchanged to keep the update scoped. Type-stripped scripts retain MODULE_TYPELESS_PACKAGE_JSON warnings; Playwright reports FORCE_COLOR/NO_COLOR warnings. npm12 warns that the pre-existing `unrs-resolver@1.12.2` postinstall script is not covered by allowScripts; no approval policy was changed, and lint/build/browser checks pass with the installed optional artifacts.

## Remaining development advisories — explicitly not fixed

The full audit reports **five affected packages with14 unique advisory IDs**; repeated ranges/installed copies are not separate vulnerabilities. All affected lockfile nodes have `dev:true`, and their versions match `d1079819` exactly. No direct import of these packages was found in `app`, `lib`, `components` or `config`. The production audit excludes them and reports zero. This is a dependency-graph/static reachability assessment, not a claim that dev tooling is harmless or absent from a host that installs all dependencies.

**Disposition for every row:** retain as an outstanding development/build-tooling issue, separate from V1-01's production fix. Malicious repository config, styles, stats, schema inputs or untrusted changes can still attack build/lint workers. Do not feed untrusted input to these tools or call the advisories resolved. Remediation should use a separately reviewed targeted toolchain lock update, without overrides or blanket major upgrades. Reassess any row if the package enters an application request path.

| Package / installed version | Advisory | Severity | Evaluated input and remaining risk |
| --- | --- | --- | --- |
| brace-expansion1.1.15 /5.0.6 | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | High | Glob expansion of repeated empty groups; excessive build/lint CPU |
| Same | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | High | Unbounded expansion output; build/lint memory exhaustion |
| Same | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | High | Intermediate expansion arrays bypass an earlier limit; memory exhaustion |
| Same | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | Moderate | Quadratic glob rewrite; build/lint CPU exhaustion |
| Same | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | High | Nested brace recursion; build/lint stack exhaustion |
| Same | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | High | Comma-part parser recursion; build/lint stack exhaustion |
| browserslist4.28.2 | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | High | Distinct query results retained without eviction; build memory growth |
| Same | [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | High | Untrusted custom stats normalization; crash/prototype write in tooling |
| js-yaml4.2.0 | [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) | High | YAML merge-key chains; quadratic tooling CPU |
| Same | [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | High | Ordered-map resolution; quadratic tooling CPU |
| Same | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | High | Empty merge sources bypass a limit; tooling CPU exhaustion |
| postcss-selector-parser6.1.2 | [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92) | Low | Deep selector AST recursion; stylesheet-tooling denial of service |
| Same | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Moderate | Flat selector parsing; quadratic stylesheet-tooling CPU |
| zod4.4.3 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | High | Oversized constrained collections; tooling/schema-validation memory exhaustion |

## Review and operational limit

Recommend review and integration of this focused update after inspecting the manifest/lockfile diff and the development-advisory dispositions. No new critical finding is present; production audit findings are zero. This does not approve public launch, deploy this build, authorize Assistant live mutations or attest Staging isolation. Actual Linux/Ubuntu native execution, real login/RLS, merchant configuration and a Staging smoke test remain outside this local validation. The local build uses synthetic public configuration and must not be deployed as-is; the separately authorized deployment must rebuild with the approved Staging public configuration and perform its smoke checks.
