import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const source=readFileSync(resolve(process.cwd(),"lib/email/support-notifications.ts"),"utf8");
const require=createRequire(import.meta.url);

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

test("idempotency is tied to a concrete event or message id",()=>{
  assert.match(source,/eventId:string/);
  assert.match(source,/support-\$\{input\.type\}-\$\{input\.ticketId\}-\$\{input\.eventId\}/);
  assert.doesNotMatch(source,/idempotencyKey:`[^`]*input\.status/);
});

function notificationRuntime(throwProvider=false) {
  const keys:string[]=[];
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,any>={};
  const mocks:Record<string,any>={
    "server-only":{},
    "@/lib/email/config":{getInvitationEmailConfiguration:()=>({state:"ready"})},
    "@/lib/email/resend-provider":{sendWithResend:async (_config:unknown,input:any)=>{keys.push(input.idempotencyKey);if(throwProvider)throw new Error("PRIVATE_PROVIDER_ERROR");return {ok:true};}},
    "@/lib/supabase/config":{getAppBaseUrl:()=>base},
    "@/lib/logger":{logger:{info:()=>{},error:()=>{}}}
  };
  runInNewContext(output,{exports,process:{env:{SUPPORT_EMAIL_TO:"support@example.test"}},URL,require:(name:string)=>Object.hasOwn(mocks,name)?mocks[name]:require(name)});
  return {send:exports.sendSupportNotification,keys};
}

const safeNotification={type:"ticket_replied_requester" as const,ticketId:id,reference:"ABCDEF0123456789",status:"in_progress",requesterEmail:"requester@example.test"};

test("two replies in the same status produce distinct provider idempotency keys",async()=>{
  const runtime=notificationRuntime();
  await runtime.send({...safeNotification,eventId:"11111111-1111-4111-8111-111111111112"});
  await runtime.send({...safeNotification,eventId:"11111111-1111-4111-8111-111111111113"});
  assert.equal(new Set(runtime.keys).size,2);
});

test("retrying the same event reuses the exact provider idempotency key",async()=>{
  const runtime=notificationRuntime();
  await runtime.send({...safeNotification,eventId:"11111111-1111-4111-8111-111111111114"});
  await runtime.send({...safeNotification,eventId:"11111111-1111-4111-8111-111111111114"});
  assert.equal(runtime.keys[0],runtime.keys[1]);
});

test("unexpected provider errors remain best-effort and sanitized",async()=>{
  const runtime=notificationRuntime(true);
  const result=await runtime.send({...safeNotification,eventId:"11111111-1111-4111-8111-111111111115"});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{state:"failed",reason:"notification_failed"});
});
