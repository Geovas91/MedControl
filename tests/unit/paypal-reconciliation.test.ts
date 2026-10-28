import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaypalWebhookHandler } from '../../lib/paypal/webhook-handler.ts';
import { createReconciler, verifyObservation, providerStatuses } from '../../lib/paypal/reconciliation.ts';
import type { ProviderSubscription } from '../../lib/paypal/billing-policy.ts';
function fixture() {
 const s={generation:0,revision:0,status:'active',now:0,lease:0,failures:0,applied:0,known:true};
 let read:()=>Promise<ProviderSubscription>=async()=>({id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE',custom_id:'intent'});
 const snapshots=new Map<string,number>(); const events=new Set<string>();
 const reconcile=createReconciler({
  begin:async()=>{if(!s.known)throw new Error('review');const id=String(++s.generation);snapshots.set(id,s.revision);s.lease=s.now+120;return {id,generation:s.generation,provider_plan:'P-BASIC',custom_id:'intent'};},
  details:async()=>read(),
  finish:async(t,o)=>{if(t.generation!==s.generation||s.now>=s.lease)return 'stale';if(snapshots.get(t.id)!==s.revision)return 'requires_review';if(s.status==='cancelled'&&o.status!=='CANCELLED')return 'requires_review';s.status=providerStatuses[o.status];s.revision++;s.applied++;return 'processed';},
  fail:async()=>{s.failures++;}
 });
 const handler=createPaypalWebhookHandler({verify:async()=>true,claim:async(id)=>{if(events.has(id))return {state:'processed'};events.add(id);return {state:'claimed',token:id};},
  reconcile:async()=>reconcile('I-EXAMPLE123'),details:async()=>read(),finish:async()=>{throw new Error('unfenced writer reached');},fail:async()=>{}});
 const deliver=(id='WH-1',type='BILLING.SUBSCRIPTION.ACTIVATED')=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({id,event_type:type,resource:{id:'I-EXAMPLE123'}})}));
 return {s,reconcile,deliver,setRead:(fn:typeof read)=>{read=fn;}};
}
test('old payment failure preserves verified ACTIVE',async()=>{const f=fixture();assert.equal((await f.deliver('WH-OLD','BILLING.SUBSCRIPTION.PAYMENT.FAILED')).status,200);assert.equal(f.s.status,'active');});
test('different events cannot apply older GET after newer cancellation',async()=>{
 const f=fixture();let release!:()=>void;let started!:()=>void;let calls=0;
 const blocked=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{started=r;});
 f.setRead(async()=>{const first=++calls===1;if(first){started();await blocked;}return {id:'I-EXAMPLE123',plan_id:'P-BASIC',custom_id:'intent',status:first?'ACTIVE':'CANCELLED'};});
 const older=f.deliver('WH-OLD');await ready;await f.deliver('WH-NEW');release();assert.equal((await older).status,503);assert.equal(f.s.status,'cancelled');assert.equal(f.s.applied,1);
});
test('same event duplicate does not observe or apply twice',async()=>{const f=fixture();await f.deliver();await f.deliver();assert.equal(f.s.applied,1);});
test('expired reconciliation lease rejects late response',async()=>{const f=fixture();f.setRead(async()=>{f.s.now=121;return {id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'};});assert.equal(await f.reconcile('I-EXAMPLE123'),'stale');assert.equal(f.s.applied,0);});
test('provider timeout records recoverable failure',async()=>{const f=fixture();f.setRead(async()=>{throw new Error('private');});assert.equal(await f.reconcile('I-EXAMPLE123'),'failed');assert.equal(f.s.failures,1);});
test('local approval during GET makes snapshot stale',async()=>{const f=fixture();f.setRead(async()=>{f.s.revision++;return {id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'};});assert.equal(await f.reconcile('I-EXAMPLE123'),'requires_review');assert.equal(f.s.applied,0);});
test('cancelled subscription is not revived by an old payment event',async()=>{const f=fixture();f.s.status='cancelled';assert.equal((await f.deliver('WH-OLD','PAYMENT.SALE.COMPLETED')).status,503);assert.equal(f.s.status,'cancelled');});
test('webhook before local association fails without assigning a clinic',async()=>{const f=fixture();f.s.known=false;assert.equal((await f.deliver()).status,503);assert.equal(f.s.applied,0);});
for(const patch of [{id:'I-OTHER123'},{plan_id:'P-OTHER'},{custom_id:'other'},{status:'UNKNOWN'},{status_update_time:'invalid'}])test('inconsistent provider observation is rejected '+Object.keys(patch)[0],()=>{
 assert.throws(()=>verifyObservation('I-EXAMPLE123',{id:'ticket',generation:1,provider_plan:'P-BASIC',custom_id:'intent'},{id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE',custom_id:'intent',...patch}));
});
test('failed finalization and failed failure marker remain sanitized and retryable',async()=>{
 const r=createReconciler({begin:async()=>({id:'a',generation:1,provider_plan:'P-BASIC',custom_id:null}),details:async()=>({id:'I-EXAMPLE123',plan_id:'P-BASIC',status:'ACTIVE'}),finish:async()=>{throw new Error('lost acknowledgement');},fail:async()=>{throw new Error('database outage');}});
 assert.equal(await r('I-EXAMPLE123'),'failed');
});