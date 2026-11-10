-- PostgreSQL disposable lab only. Run after 0001–0067 and 0069.
begin;
select extensions.plan(8);

insert into auth.users(id,email) values
  ('69000000-0000-4000-8000-000000000001','trial-owner@example.test'),
  ('69000000-0000-4000-8000-000000000002','legacy-owner@example.test');
insert into public.clinics(id,name) values
  ('69100000-0000-4000-8000-000000000001','Synthetic trial'),
  ('69100000-0000-4000-8000-000000000002','Synthetic legacy');
insert into public.clinic_members(clinic_id,user_id,role,status) values
  ('69100000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000001','owner','active'),
  ('69100000-0000-4000-8000-000000000002','69000000-0000-4000-8000-000000000002','owner','active');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider,current_period_start,current_period_end) values
  ('69100000-0000-4000-8000-000000000001','basic','trialing','manual',now(),now()+interval '30 days'),
  ('69100000-0000-4000-8000-000000000002','basic','active','manual',null,null);

set local role authenticated;
set local request.jwt.claim.sub = '69000000-0000-4000-8000-000000000001';
select extensions.lives_ok($$insert into public.patients(id,clinic_id,full_name) values
  ('69200000-0000-4000-8000-000000000001','69100000-0000-4000-8000-000000000001','Synthetic patient')$$,
  'current trial permits direct writes');

reset role;
insert into public.appointments(id,clinic_id,patient_id,title,starts_at,ends_at) values
  ('69300000-0000-4000-8000-000000000001','69100000-0000-4000-8000-000000000001',
   '69200000-0000-4000-8000-000000000001','Synthetic appointment',now()+interval '1 day',now()+interval '25 hours');
update public.clinic_subscriptions set current_period_start=now()-interval '30 days',current_period_end=clock_timestamp()
where clinic_id='69100000-0000-4000-8000-000000000001';

set local role authenticated;
select extensions.is((select count(*) from public.patients where id='69200000-0000-4000-8000-000000000001'),1::bigint,
  'expired owner retains scoped reads');
select extensions.throws_ok($$update public.patients set full_name='Denied' where id='69200000-0000-4000-8000-000000000001'$$,
  '42501','clinical_workspace_read_only','direct update fails after expiry');
select extensions.throws_ok($$select * from public.mutate_appointment_lifecycle_for_current_user(
  '69100000-0000-4000-8000-000000000001','69300000-0000-4000-8000-000000000001','cancel')$$,
  '42501','clinical_workspace_read_only','definer RPC cancellation fails after expiry');
select extensions.is((select status::text from public.appointments where id='69300000-0000-4000-8000-000000000001'),'scheduled',
  'rejected cancellation leaves the appointment unchanged');

set local request.jwt.claim.sub = '69000000-0000-4000-8000-000000000002';
select extensions.is((select count(*) from public.patients where id='69200000-0000-4000-8000-000000000001'),0::bigint,
  'another clinic cannot read the trial patient');
select extensions.lives_ok($$insert into public.patients(clinic_id,full_name)
  values ('69100000-0000-4000-8000-000000000002','Legacy patient')$$,'pre-existing active plan has write access');

reset role;
update public.clinic_subscriptions set status='active' where clinic_id='69100000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '69000000-0000-4000-8000-000000000001';
select extensions.lives_ok($$update public.patients set full_name='Reactivated patient' where id='69200000-0000-4000-8000-000000000001'$$,
  'confirmed active status restores writes');

reset role;
select * from extensions.finish();
rollback;
