import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaypalWebhookHandler } from '../../lib/paypal/webhook-handler.ts';
import { createReconciler, verifyObservation, providerStatuses } from '../../lib/paypal/reconciliation.ts';
import { createRpcReconciler } from '../../lib/paypal/reconciliation-rpc.ts';
import type { ProviderSubscription } from '../../lib/paypal/billing-policy.ts';
function fixture() {
 const s={generation:0,revision:0,status:'active',now:0,lease:0,failures:0,applied:0,known:true,trusted:true,reads:0,beforeCommitFails:false,loseAcknowledgment:false,markerFails:false,start:null as string|null,end:null as string|null};
 let read:()=>Promise<ProviderSubscription>=async()=>({id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE',custom_id:'intent'});
 // Explicit transactional MODEL; this does not certify PostgreSQL behavior.
 const attempts=new Map<string,{revision:number,event?:string,token?:string,state:string}>();
 const events=new Map<string,{state:'received'|'processing'|'failed'|'processed',token:string|null,lease:number,attempts:number,type:string}>();let tokens=0;
 const engine=(event?:string,token?:string)=>createReconciler({
  begin:async()=>{if(!s.known||!s.trusted)throw new Error('review');const id=String(++s.generation);attempts.set(id,{revision:s.revision,event,token,state:'claimed'});s.lease=s.now+120;return {id,generation:s.generation,provider_plan:'P-BASIC',custom_id:'intent',identity_trusted:true};},
  details:async()=>{s.reads++;return read();},
  finish:async(t,o)=>{
   if(s.beforeCommitFails)throw new Error('private database error');const a=attempts.get(t.id)!;
   if(t.generation!==s.generation||s.now>=s.lease){a.state='stale';return 'stale';}
   const e=a.event?events.get(a.event)!:null;
   if(e&&(e.state!=='processing'||e.token!==a.token||e.lease<=s.now))throw new Error('lease_lost');
   if(a.revision!==s.revision)return 'requires_review';if(s.status==='cancelled'&&providerStatuses[o.status]!=='cancelled')return 'requires_review';
   s.status=providerStatuses[o.status];s.start=o.start??s.start;s.end=o.end??s.end;s.revision++;s.applied++;a.state='applied';
   if(e){e.state='processed';e.token=null;e.lease=0;}if(s.loseAcknowledgment)throw new Error('lost acknowledgment after commit');return 'processed';
  },
  fail:async(t)=>{s.failures++;const a=attempts.get(t.id)!;if(a.state==='claimed')a.state='failed';}
 });
 const reconcile=engine();
 const handler=createPaypalWebhookHandler({verify:async()=>true,claim:async(id,type)=>{
   if(!events.has(id))events.set(id,{state:'received',token:null,lease:0,attempts:0,type});const e=events.get(id)!;assert.equal(e.type,type);
   if(e.state==='processed')return {state:'processed'};if(e.state==='processing'&&e.lease>s.now)return {state:'busy'};
   e.state='processing';e.token=String(++tokens);e.lease=s.now+120;e.attempts++;return {state:'claimed',token:e.token};},
  reconcile:async(id,token)=>engine(id,token)('I-EXAMPLE123'),details:async()=>{throw new Error('unfenced read');},finish:async()=>{throw new Error('unfenced writer reached');},
  fail:async(id,token)=>{if(s.markerFails)throw new Error('marker unavailable');const e=events.get(id)!;if(e.state==='processing'&&e.token===token){e.state='failed';e.token=null;e.lease=0;}}});
 const deliver=(id='WH-1',type='BILLING.SUBSCRIPTION.ACTIVATED')=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({id,event_type:type,resource:{id:'I-EXAMPLE123'}})}));
 return {s,events,attempts,reconcile,deliver,setRead:(fn:typeof read)=>{read=fn;}};
}
test('old payment failure preserves verified ACTIVE',async()=>{const f=fixture();assert.equal((await f.deliver('WH-OLD','BILLING.SUBSCRIPTION.PAYMENT.FAILED')).status,200);assert.equal(f.s.status,'active');});
test('different events cannot apply older GET after newer cancellation',async()=>{
 const f=fixture();let release!:()=>void;let started!:()=>void;let calls=0;
 const blocked=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{started=r;});
 f.setRead(async()=>{const first=++calls===1;if(first){started();await blocked;}return {id:'I-EXAMPLE123',plan_id:'P-BASIC',custom_id:'intent',status:first?'ACTIVE':'CANCELLED'};});
 const older=f.deliver('WH-OLD');await ready;assert.equal((await f.deliver('WH-NEW')).status,200);release();assert.equal((await older).status,503);assert.equal(f.s.status,'cancelled');assert.equal(f.s.applied,1);
 assert.equal(f.events.get('WH-OLD')?.state,'failed');assert.equal(f.events.get('WH-NEW')?.state,'processed');
});
test('same event duplicate does not observe or apply twice',async()=>{const f=fixture();await f.deliver();await f.deliver();assert.equal(f.s.applied,1);});
test('expired reconciliation lease rejects late response',async()=>{const f=fixture();f.setRead(async()=>{f.s.now=121;return {id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'};});assert.equal(await f.reconcile('I-EXAMPLE123'),'stale');assert.equal(f.s.applied,0);});
test('provider timeout records recoverable failure',async()=>{const f=fixture();f.setRead(async()=>{throw new Error('private');});assert.equal(await f.reconcile('I-EXAMPLE123'),'failed');assert.equal(f.s.failures,1);});
test('local approval during GET makes snapshot stale',async()=>{const f=fixture();f.setRead(async()=>{f.s.revision++;return {id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'};});assert.equal(await f.reconcile('I-EXAMPLE123'),'requires_review');assert.equal(f.s.applied,0);});
test('cancelled subscription is not revived by an old payment event',async()=>{const f=fixture();f.s.status='cancelled';assert.equal((await f.deliver('WH-OLD','PAYMENT.SALE.COMPLETED')).status,503);assert.equal(f.s.status,'cancelled');});
test('webhook before local association fails without assigning a clinic',async()=>{const f=fixture();f.s.known=false;assert.equal((await f.deliver()).status,503);assert.equal(f.s.applied,0);});
for(const patch of [{id:'I-OTHER123'},{plan_id:'P-OTHER'},{custom_id:'other'},{status:'UNKNOWN'},{status_update_time:'invalid'}])test('inconsistent provider observation is rejected '+Object.keys(patch)[0],()=>{
 assert.throws(()=>verifyObservation('I-EXAMPLE123',{id:'ticket',generation:1,provider_plan:'P-BASIC',custom_id:'intent',identity_trusted:true},{id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE',custom_id:'intent',...patch}),/provider_mismatch/);
});
test('failed finalization and failed failure marker remain sanitized and retryable',async()=>{
 const r=createReconciler({begin:async()=>({id:'a',generation:1,provider_plan:'P-BASIC',custom_id:'intent',identity_trusted:true}),details:async()=>({id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'}),finish:async()=>{throw new Error('lost acknowledgement');},fail:async()=>{throw new Error('database outage');}});
 assert.equal(await r('I-EXAMPLE123'),'failed');
});

test('provider failure after claim and failed event redelivery',async()=>{
 const f=fixture();f.setRead(async()=>{throw new Error('PRIVATE_PROVIDER');});const failed=await f.deliver();
 assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/PRIVATE_PROVIDER/);assert.equal(f.events.get('WH-1')?.state,'failed');assert.equal(f.s.applied,0);
 f.setRead(async()=>({id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'}));assert.equal((await f.deliver()).status,200);
 assert.equal(f.events.get('WH-1')?.attempts,2);assert.equal(f.s.applied,1);
});
test('duplicate during processing is busy; duplicate after commit is a no-op',async()=>{
 const f=fixture();let release!:()=>void;let started!:()=>void;
 const blocked=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{started=r;});
 f.setRead(async()=>{started();await blocked;return {id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'};});
 const first=f.deliver();await ready;assert.equal((await f.deliver()).status,503);assert.equal(f.events.get('WH-1')?.state,'processing');assert.equal(f.s.applied,0);
 release();assert.equal((await first).status,200);assert.equal((await f.deliver()).status,200);assert.equal(f.s.reads,1);assert.equal(f.s.applied,1);
});
test('failure after provider GET before finalization is recoverable',async()=>{
 const f=fixture();f.s.beforeCommitFails=true;assert.equal((await f.deliver()).status,503);assert.equal(f.s.reads,1);assert.equal(f.s.applied,0);assert.equal(f.events.get('WH-1')?.state,'failed');
 f.s.beforeCommitFails=false;assert.equal((await f.deliver()).status,200);assert.equal(f.s.applied,1);assert.equal(f.s.reads,2);
});
test('lost acknowledgment after committed finalization preserves processed journal',async()=>{
 const f=fixture();f.s.loseAcknowledgment=true;assert.equal((await f.deliver()).status,503);assert.equal(f.events.get('WH-1')?.state,'processed');assert.equal([...f.attempts.values()][0].state,'applied');
 assert.equal((await f.deliver()).status,200);assert.equal(f.s.reads,1);assert.equal(f.s.applied,1);
});
test('expired processing lease reclaims with new token; older failure cannot overwrite recovery',async()=>{
 const f=fixture();let release!:()=>void;let started!:()=>void;let calls=0;
 const blocked=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{started=r;});
 f.setRead(async()=>{if(++calls===1){started();await blocked;}return {id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'};});
 const older=f.deliver();await ready;const oldToken=f.events.get('WH-1')!.token;f.s.now=121;
 assert.equal((await f.deliver()).status,200);release();assert.equal((await older).status,503);assert.ok(oldToken);
 assert.equal(f.events.get('WH-1')?.state,'processed');assert.equal(f.events.get('WH-1')?.attempts,2);assert.equal(f.s.applied,1);
});
test('marker outage leaves processing until lease expiry then recovers',async()=>{
 const f=fixture();f.s.beforeCommitFails=true;f.s.markerFails=true;
 assert.equal((await f.deliver()).status,503);assert.equal(f.events.get('WH-1')?.state,'processing');assert.equal((await f.deliver()).status,503);assert.equal(f.s.reads,1);
 f.s.now=121;f.s.beforeCommitFails=false;assert.equal((await f.deliver()).status,200);assert.equal(f.s.applied,1);
});

const trustedTicket={id:'ticket',generation:1,provider_plan:'P-BASIC',custom_id:'intent',identity_trusted:true};
const provider={id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE',custom_id:'intent'};
const periodStart='2026-01-01T00:00:00Z',periodEnd='2026-02-01T00:00:00Z';
test('matching custom and missing custom with trusted binding accepted',()=>{
 assert.equal(verifyObservation(provider.id,trustedTicket,provider).custom,'intent');
 assert.equal(verifyObservation(provider.id,trustedTicket,{...provider,custom_id:undefined}).custom,null);
});
test('matching or absent custom cannot compensate for missing local trust',()=>{
 for(const custom_id of ['intent',undefined])assert.throws(()=>verifyObservation(provider.id,{...trustedTicket,identity_trusted:false},{...provider,custom_id}),/identity_unverified/);
 assert.throws(()=>verifyObservation(provider.id,{...trustedTicket,custom_id:null},{...provider,custom_id:undefined}),/identity_unverified/);
});
test('historical unresolved local binding is review-only without provider GET',async()=>{
 const f=fixture();f.s.trusted=false;assert.equal((await f.deliver()).status,503);assert.equal(f.s.reads+f.s.applied,0);
});
test('untrusted ticket returns review and never applies',async()=>{
 let reason='';let applies=0;const run=createReconciler({begin:async()=>({...trustedTicket,identity_trusted:false}),details:async()=>provider,
 finish:async()=>{applies++;return 'processed';},fail:async(_t,r)=>{reason=r;}});
 assert.equal(await run(provider.id),'requires_review');assert.equal(reason,'identity_unverified');assert.equal(applies,0);
});
test('invalid provider period is recorded for review, not applied',async()=>{
 let reason='';let applies=0;const run=createReconciler({begin:async()=>trustedTicket,details:async()=>({...provider,start_time:'invalid'}),
 finish:async()=>{applies++;return 'processed';},fail:async(_t,r)=>{reason=r;}});
 assert.equal(await run(provider.id),'requires_review');assert.equal(reason,'provider_mismatch');assert.equal(applies,0);
});
for(const [label,patch,start,end] of [
 ['both',{start_time:periodStart,billing_info:{next_billing_time:periodEnd}},periodStart,periodEnd],
 ['start only',{start_time:periodStart},periodStart,null],
 ['end only',{billing_info:{next_billing_time:periodEnd}},null,periodEnd],
 ['neither',{},null,null]
] as const){
 test('optional date projection: '+label,()=>{const o=verifyObservation(provider.id,trustedTicket,{...provider,...patch});assert.equal(o.start,start);assert.equal(o.end,end);});
 for(const authorization of [{p_event:'WH-1',p_token:'token'},{p_clinic:'clinic',p_actor:'owner'}])test(`production RPC adapter projects ${label} dates (${Object.keys(authorization)[0]})`,async()=>{
  const calls:{name:string,args:Record<string,unknown>}[]=[];
  const run=createRpcReconciler(async<T>(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return (name==='begin_paypal_reconciliation'?{...trustedTicket,state:'claimed'}:'processed') as T;},async()=>({...provider,...patch}),authorization);
  assert.equal(await run(provider.id),'processed');assert.deepEqual(calls[0],{name:'begin_paypal_reconciliation',args:{p_subscription:provider.id,...authorization}});assert.equal(calls.length,2);
  assert.deepEqual(calls[1],{name:'finish_paypal_reconciliation',args:{p_id:'ticket',p_generation:1,p_subscription:provider.id,p_plan:'P-BASIC',p_status:'ACTIVE',p_custom:'intent',p_updated:null,p_verified:calls[1].args.p_verified,p_start:start,p_end:end}});
  assert.ok(Number.isFinite(Date.parse(calls[1].args.p_verified as string)));
 });
}
for(const bad of ['invalid','2026-02-31T00:00:00Z','2026-01-01','infinity','2026-01-01T25:00:00Z'])for(const field of ['start','end','updated'])test(`invalid ${field} rejected (${bad})`,()=>{
 const patch=field==='start'?{start_time:bad}:field==='end'?{billing_info:{next_billing_time:bad}}:{status_update_time:bad};
 assert.throws(()=>verifyObservation(provider.id,trustedTicket,{...provider,...patch}),/provider_mismatch/);
});
test('inconsistent period rejected',()=>{assert.throws(()=>verifyObservation(provider.id,trustedTicket,{...provider,start_time:periodEnd,billing_info:{next_billing_time:periodStart}}),/provider_mismatch/);});
for(const end of [periodStart,'2025-12-31T18:00:00-06:00']) {
 test('equal period instants rejected: '+end,()=>{
  assert.throws(()=>verifyObservation(provider.id,trustedTicket,{...provider,start_time:periodStart,billing_info:{next_billing_time:end}}),/provider_mismatch/);
 });
 for(const authorization of [{p_event:'WH-PERIOD',p_token:'token'},{p_clinic:'clinic',p_actor:'owner'}])test(`invalid equal interval never reaches SQL finalization (${end}, ${Object.keys(authorization)[0]})`,async()=>{
  const calls:{name:string,args:Record<string,unknown>}[]=[];
  const run=createRpcReconciler(async<T>(name:string,args:Record<string,unknown>)=>{
   calls.push({name,args});return {...trustedTicket,state:'claimed'} as T;
  },async()=>({...provider,start_time:periodStart,billing_info:{next_billing_time:end}}),authorization);
  assert.equal(await run(provider.id),'requires_review');
  assert.deepEqual(calls.map(c=>c.name),['begin_paypal_reconciliation','fail_paypal_reconciliation']);
  assert.deepEqual(calls[1].args,{p_id:'ticket',p_generation:1,p_reason:'provider_mismatch'});
 });
}
test('strictly later instant accepted despite offset spelling',()=>{
 const end='2025-12-31T19:00:00-06:00';
 assert.equal(verifyObservation(provider.id,trustedTicket,{...provider,start_time:periodStart,billing_info:{next_billing_time:end}}).end,end);
});
test('RPC review ticket prevents provider read and finalization',async()=>{
 let calls=0;const run=createRpcReconciler(async<T>()=>{calls++;return {...trustedTicket,state:'requires_review',identity_trusted:false} as T;},async()=>{throw new Error('must not read');},{});
 await assert.rejects(()=>run(provider.id),/reconciliation_review_required/);assert.equal(calls,1);
});
test('stale deferred observation cannot overwrite newer dates (transaction model)',async()=>{
 const f=fixture();let release!:()=>void;let started!:()=>void;let calls=0;
 const blocked=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{started=r;});
 f.setRead(async()=>{const first=++calls===1;if(first){started();await blocked;}return {...provider,start_time:periodStart,billing_info:{next_billing_time:first?periodEnd:'2026-03-01T00:00:00Z'}};});
 const older=f.deliver('WH-OLD');await ready;assert.equal((await f.deliver('WH-NEW')).status,200);release();assert.equal((await older).status,503);
 assert.equal(f.s.start,periodStart);assert.equal(f.s.end,'2026-03-01T00:00:00Z');assert.equal(f.s.applied,1);
});
