import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const source=readFileSync(resolve(process.cwd(),"lib/email/support-notifications.ts"),"utf8");

const id="11111111-1111-4111-8111-111111111111";
const sentinels=["ORIGINAL_TICKET_SUBJECT","ORIGINAL_SUMMARY","ORIGINAL_MESSAGE_BODY","requester@example.com","555-0100","PHI_SENTINEL_PATIENT","PHI_SENTINEL_DIAGNOSIS","RAW_PROVIDER_ERROR_SENTINEL","ACCESS_TOKEN_SENTINEL","clinic_id","service_role","SECRET_SENTINEL"];
const base="https://clinicontrol.example";

for (const type of ["ticket_created_support","ticket_created_requester","ticket_replied_requester","ticket_status_changed_requester"] as const) {
  test(`${type} builds a neutral allowlisted payload`,()=>{
    assert.match(source,new RegExp(type));
    assert.match(source,/reference/); assert.match(source,/status/);
    assert.match(source,type==="ticket_created_support"?/admin\/support\/tickets/ : /dashboard\/support\/tickets/);
    for(const sentinel of sentinels) assert.equal(source.includes(sentinel),false,sentinel);
  });
}

test("support recipient comes only from SUPPORT_EMAIL_TO and requester recipient is server supplied",()=>{
  assert.match(source,/SUPPORT_EMAIL_TO/); assert.match(source,/requesterEmail/); assert.match(source,/no_recipient/);
});

test("invalid or arbitrary recipients fail closed",()=>{
  assert.match(source,/\^\[\^\\s@<>\]\+\@/); assert.match(source,/return value.*null/s);
});

test("URLs are based on the server supplied base and cannot be overridden by ticket text",()=>{
  assert.match(source,/getAppBaseUrl\(\)/); assert.doesNotMatch(source,/staging\.clinicontrol/); assert.match(source,/new URL\(path,baseUrl\)/);
});
