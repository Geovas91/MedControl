import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
// @ts-expect-error QA guard module is intentionally plain JavaScript.
import { getDryRunConfig, getRuntimeConfig } from "../../scripts/qa/seed-rbac-demo-users.mjs";

const names = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "QA_DEMO_PASSWORD", "QA_RBAC_DEMO_ALLOW_LOCAL"] as const;
const saved = new Map(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function setBase(url: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.QA_DEMO_PASSWORD = "test-only";
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

describe("QA RBAC local target guards", () => {
  it("rejects loopback apply without --local", () => {
    setBase("http://127.0.0.1:54321");
    assert.throws(() => getRuntimeConfig(), /loopback.*--local/i);
  });

  it("rejects local apply without the explicit guard", () => {
    setBase("http://127.0.0.1:54321");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local";
    assert.throws(() => getRuntimeConfig({ local: true }), /QA_RBAC_DEMO_ALLOW_LOCAL/i);
  });

  it("allows loopback only with the explicit guard and local service key", () => {
    setBase("http://127.0.0.1:54321");
    process.env.QA_RBAC_DEMO_ALLOW_LOCAL = "1";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local";
    assert.equal(getRuntimeConfig({ local: true }).local, true);
  });

  it("rejects HTTPS staging when --local is supplied", () => {
    setBase("https://fnknctihnrryntkjqxeo.supabase.co");
    process.env.QA_RBAC_DEMO_ALLOW_LOCAL = "1";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local";
    assert.throws(() => getRuntimeConfig({ local: true }), /loopback/i);
  });

  it("preserves the staging project-ref guard", () => {
    setBase("https://otherproject.supabase.co");
    process.env.SUPABASE_SECRET_KEY = "staging";
    assert.throws(() => getRuntimeConfig(), /approved staging project/i);
  });

  it("rejects ambiguous remote credentials in local mode", () => {
    setBase("http://localhost:54321");
    process.env.QA_RBAC_DEMO_ALLOW_LOCAL = "1";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local";
    process.env.SUPABASE_SECRET_KEY = "remote";
    assert.throws(() => getRuntimeConfig({ local: true }), /SUPABASE_SECRET_KEY.*not accepted/i);
  });

  it("keeps dry-run offline for local and staging targets", () => {
    setBase("http://127.0.0.1:54321");
    assert.equal(getDryRunConfig({ local: true }).local, true);
    setBase("https://fnknctihnrryntkjqxeo.supabase.co");
    assert.equal(getDryRunConfig().local, false);
  });

  it("protects cleanup local mode with the same guard", () => {
    setBase("http://127.0.0.1:54321");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local";
    assert.throws(() => getRuntimeConfig({ local: true }), /QA_RBAC_DEMO_ALLOW_LOCAL/i);
  });
});
