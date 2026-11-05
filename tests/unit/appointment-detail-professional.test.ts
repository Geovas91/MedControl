import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const clinic = "10000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000002";
const doctor = "10000000-0000-4000-8000-000000000003";
function harness({ visible = true, assigned = true, memberClinic = clinic, lookupError = false } = {}) {
  const calls: string[] = [];
  const exports: any = {};
  const source = ts.transpileModule(readFileSync("lib/server/appointment-detail.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/appointments/query": { isCanonicalAppointmentUuid: () => true },
    "@/lib/logger": { logger: { error() {} } },
    "@/lib/server/active-tenant": { getActiveTenantContext: async () => ({
      state: "ready", user: { id: doctor }, tenant: { clinic: { id: clinic }, membership: { role: "owner" } }
    }) },
    "@/lib/supabase/server": { createClient: async () => ({
      from(table: string) {
        const query = {
          select: () => query, eq: () => query, limit: () => query,
          maybeSingle: async () => ({
            data: table === "appointments" && visible ? { id, patient_id: id, doctor_id: assigned ? doctor : null } : null,
            error: null
          })
        };
        return query;
      }
    }) },
    "@/lib/supabase/clinic-members": { listClinicMembersForClinic: async (target: string) => {
      calls.push(target);
      return { data: [{ clinic_id: memberClinic, user_id: doctor, full_name: "Synthetic professional" }],
        error: lookupError ? { code: "42501" } : null };
    } }
  };
  runInNewContext(source, { exports, require: (key: string) => {
    assert.ok(Object.hasOwn(mocks, key), key);
    return mocks[key];
  } });
  return { load: () => exports.getAppointmentDetailForActiveTenant(id), calls };
}
test("assigned professional without directory entry resolves through authorized tenant RPC", async () => {
  const h = harness();
  const result = await h.load();
  assert.equal(result.state, "ready");
  assert.equal(result.data.doctor?.display_name, "Synthetic professional");
  assert.deepEqual(h.calls, [clinic]);
});
test("invisible appointment never resolves the professional", async () => {
  const h = harness({ visible: false });
  assert.equal((await h.load()).state, "not_found");
  assert.deepEqual(h.calls, []);
});
test("unassigned appointment and foreign RPC rows do not invent a professional", async () => {
  for (const options of [{ assigned: false }, { memberClinic: id }]) {
    const h = harness(options);
    assert.equal((await h.load()).data.doctor, null);
  }
});
test("professional RPC errors fail closed", async () => {
  assert.equal((await harness({ lookupError: true }).load()).state, "error");
});
