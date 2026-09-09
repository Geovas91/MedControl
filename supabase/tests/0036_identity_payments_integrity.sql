create extension if not exists pgtap with schema extensions;
begin;
select extensions.no_plan();

insert into auth.users(id,email,email_confirmed_at) values
 ('36000000-0000-4000-8000-000000000001','owner-a@example.test',now()),
 ('36000000-0000-4000-8000-000000000002','admin-a@example.test',now()),
 ('36000000-0000-4000-8000-000000000003','doctor-a@example.test',now()),
 ('36000000-0000-4000-8000-000000000004','assistant-a@example.test',now()),
 ('36000000-0000-4000-8000-000000000005','invitee@example.test',now()),
 ('36000000-0000-4000-8000-000000000006','unconfirmed@example.test',null),
 ('36000000-0000-4000-8000-000000000007','owner-b@example.test',now());
insert into public.clinics(id,name) values
 ('36100000-0000-4000-8000-000000000001','Integrity A'),
 ('36100000-0000-4000-8000-000000000002','Integrity B');
insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('36100000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','owner','active'),
 ('36100000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000002','admin','active'),
 ('36100000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000003','doctor','active'),
 ('36100000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000004','assistant','active'),
 ('36100000-0000-4000-8000-000000000002','36000000-0000-4000-8000-000000000007','owner','active');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values
 ('36100000-0000-4000-8000-000000000001','pro','active','manual'),
 ('36100000-0000-4000-8000-000000000002','pro','active','manual');

select extensions.ok(not has_function_privilege('authenticated','public.add_clinic_member_by_email_for_current_user(uuid,text,text)','execute'),'legacy RPC denied to authenticated');
select extensions.ok(not has_function_privilege('anon','public.add_clinic_member_by_email_for_current_user(uuid,text,text)','execute'),'legacy RPC denied to anon');
select extensions.ok((select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid='public.add_clinic_member_by_email_for_current_user(uuid,text,text)'::regprocedure),'legacy retained with fixed search_path but disabled');

update public.profiles set email='invitee@example.test' where id='36000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000001',true);
select extensions.throws_ok(
 $$select public.add_clinic_member_by_email_for_current_user('36100000-0000-4000-8000-000000000001','invitee@example.test','doctor')$$,
 '42501',null,'tampered profile email cannot use legacy enrollment'
);
reset role;
select extensions.ok(not exists(select 1 from public.clinic_members where user_id='36000000-0000-4000-8000-000000000005'),'profile tampering creates no membership');

set local role authenticated;
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000001',true);
select extensions.lives_ok($$select * from public.create_clinic_member_invitation_for_current_user('36100000-0000-4000-8000-000000000001','owner-created@example.test','assistant')$$,'owner can create modern invitation');
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000002',true);
select extensions.lives_ok($$select * from public.create_clinic_member_invitation_for_current_user('36100000-0000-4000-8000-000000000001','admin-created@example.test','assistant')$$,'admin keeps current invitation permission');
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000003',true);
select extensions.throws_ok($$select * from public.create_clinic_member_invitation_for_current_user('36100000-0000-4000-8000-000000000001','doctor-created@example.test','assistant')$$,'P0001','Not allowed to manage invitations.','doctor cannot invite');
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000004',true);
select extensions.throws_ok($$select * from public.create_clinic_member_invitation_for_current_user('36100000-0000-4000-8000-000000000001','assistant-created@example.test','doctor')$$,'P0001','Not allowed to manage invitations.','assistant cannot invite');
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000007',true);
select extensions.throws_ok($$select * from public.create_clinic_member_invitation_for_current_user('36100000-0000-4000-8000-000000000001','cross@example.test','assistant')$$,'P0001','Not allowed to manage invitations.','cross-tenant invitation denied');
reset role;

insert into public.clinic_member_invitations(clinic_id,invited_email,normalized_email,role,token_hash,expires_at,created_by) values
 ('36100000-0000-4000-8000-000000000001','invitee@example.test','invitee@example.test','assistant',encode(extensions.digest('verified-token','sha256'),'hex'),now()+interval '1 day','36000000-0000-4000-8000-000000000001'),
 ('36100000-0000-4000-8000-000000000001','unconfirmed@example.test','unconfirmed@example.test','assistant',encode(extensions.digest('unconfirmed-token','sha256'),'hex'),now()+interval '1 day','36000000-0000-4000-8000-000000000001');
update public.profiles set email='attacker-controlled@example.test' where id='36000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000005',true);
select extensions.is(public.accept_clinic_member_invitation_for_current_user(encode(extensions.digest('verified-token','sha256'),'hex')),'36100000-0000-4000-8000-000000000001'::uuid,'verified auth identity accepts invitation');
reset role;
select extensions.is((select email from public.profiles where id='36000000-0000-4000-8000-000000000005'),'invitee@example.test','profile email repaired from verified auth identity');
select extensions.ok(exists(select 1 from public.clinic_members where clinic_id='36100000-0000-4000-8000-000000000001' and user_id='36000000-0000-4000-8000-000000000005' and role='assistant' and status='active'),'modern invitation creates expected membership');
set local role authenticated;
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000006',true);
select extensions.throws_ok($$select public.accept_clinic_member_invitation_for_current_user(encode(extensions.digest('unconfirmed-token','sha256'),'hex'))$$,'P0001','Invitation is unavailable.','unconfirmed auth email cannot accept');
reset role;
select extensions.ok(not exists(select 1 from public.clinic_members where user_id='36000000-0000-4000-8000-000000000006'),'unconfirmed user receives no membership');
select extensions.ok((select bool_and(prosecdef and proconfig @> array['search_path=public, pg_temp']) from pg_proc where oid in
 ('public.create_clinic_member_invitation_for_current_user(uuid,text,text)'::regprocedure,'public.accept_clinic_member_invitation_for_current_user(text)'::regprocedure)),'modern invitation RPCs keep SECURITY DEFINER and fixed search_path');

insert into public.patients(id,clinic_id,full_name,first_names,internal_identifier) values
 ('36200000-0000-4000-8000-000000000001','36100000-0000-4000-8000-000000000001','Patient A1','Patient A1','PAC-INTA0001'),
 ('36200000-0000-4000-8000-000000000002','36100000-0000-4000-8000-000000000001','Patient A2','Patient A2','PAC-INTA0002'),
 ('36200000-0000-4000-8000-000000000003','36100000-0000-4000-8000-000000000002','Patient B','Patient B','PAC-INTB0001');
insert into public.appointments(id,clinic_id,patient_id,title,starts_at,ends_at) values
 ('36300000-0000-4000-8000-000000000001','36100000-0000-4000-8000-000000000001','36200000-0000-4000-8000-000000000001','Appointment A1',now()+interval '1 day',now()+interval '2 days'),
 ('36300000-0000-4000-8000-000000000002','36100000-0000-4000-8000-000000000001','36200000-0000-4000-8000-000000000002','Appointment A2',now()+interval '1 day',now()+interval '2 days'),
 ('36300000-0000-4000-8000-000000000003','36100000-0000-4000-8000-000000000002','36200000-0000-4000-8000-000000000003','Appointment B',now()+interval '1 day',now()+interval '2 days');

select extensions.lives_ok($$insert into public.payments(id,clinic_id,patient_id,appointment_id,amount) values('36400000-0000-4000-8000-000000000001','36100000-0000-4000-8000-000000000001','36200000-0000-4000-8000-000000000001','36300000-0000-4000-8000-000000000001',100)$$,'valid payment relation passes');
select extensions.throws_ok($$insert into public.payments(clinic_id,patient_id,amount) values('36100000-0000-4000-8000-000000000001','36200000-0000-4000-8000-000000000003',100)$$,'23503',null,'cross-clinic patient rejected');
select extensions.throws_ok($$insert into public.payments(clinic_id,patient_id,appointment_id,amount) values('36100000-0000-4000-8000-000000000001','36200000-0000-4000-8000-000000000003','36300000-0000-4000-8000-000000000003',100)$$,'23503',null,'cross-clinic appointment rejected');
select extensions.throws_ok($$insert into public.payments(clinic_id,patient_id,appointment_id,amount) values('36100000-0000-4000-8000-000000000001','36200000-0000-4000-8000-000000000002','36300000-0000-4000-8000-000000000001',100)$$,'23503',null,'patient appointment mismatch rejected');
select extensions.throws_ok($$insert into public.payments(clinic_id,appointment_id,amount) values('36100000-0000-4000-8000-000000000001','36300000-0000-4000-8000-000000000001',100)$$,'23514',null,'appointment requires patient');
select extensions.throws_ok($$insert into public.appointments(clinic_id,patient_id,title,starts_at,ends_at) values('36100000-0000-4000-8000-000000000001','36200000-0000-4000-8000-000000000003','Cross patient',now()+interval '1 day',now()+interval '2 days')$$,'23503',null,'appointment patient cross-clinic rejected');

set local role service_role;
select extensions.throws_ok($$insert into public.payments(clinic_id,patient_id,amount) values('36100000-0000-4000-8000-000000000001','36200000-0000-4000-8000-000000000003',100)$$,'23503',null,'service role cannot bypass relational integrity');
reset role;
select extensions.throws_ok($$update public.payments set patient_id='36200000-0000-4000-8000-000000000003' where id='36400000-0000-4000-8000-000000000001'$$,'23503',null,'payment update to another tenant rejected');
select extensions.lives_ok($$update public.payments set amount=125 where id='36400000-0000-4000-8000-000000000001'$$,'valid same-tenant payment update passes');

set local role authenticated;
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000001',true);
select extensions.is((select count(*)::integer from public.payments where clinic_id='36100000-0000-4000-8000-000000000001'),1,'tenant A reads own payment');
select extensions.is((select count(*)::integer from public.payments where clinic_id='36100000-0000-4000-8000-000000000002'),0,'tenant A cannot read tenant B payments');
reset role;

select extensions.lives_ok($$delete from public.appointments where id='36300000-0000-4000-8000-000000000001'$$,'appointment delete succeeds');
select extensions.ok((select appointment_id is null and patient_id='36200000-0000-4000-8000-000000000001' from public.payments where id='36400000-0000-4000-8000-000000000001'),'appointment delete nulls only appointment reference');
select extensions.lives_ok($$delete from public.patients where id='36200000-0000-4000-8000-000000000001'$$,'patient delete succeeds with existing semantics');
select extensions.ok((select patient_id is null and appointment_id is null from public.payments where id='36400000-0000-4000-8000-000000000001'),'patient delete leaves payment with nullable references');
select extensions.ok((select relrowsecurity from pg_class where oid='public.payments'::regclass),'payments RLS remains enabled');
set local role authenticated;
select set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000001',true);
with attempted as (delete from public.payments where id='36400000-0000-4000-8000-000000000001' returning id)
select extensions.is((select count(*)::integer from attempted),0,'authenticated receives no new effective delete permission');
reset role;
select extensions.ok(not exists(select 1 from information_schema.table_constraints where table_schema='public' and table_name in ('payments','appointments') and constraint_name in ('payments_patient_id_fkey','payments_appointment_id_fkey','appointments_patient_id_fkey')),'unsafe single-column foreign keys replaced');
select extensions.is((select count(*)::integer from information_schema.table_constraints where table_schema='public' and constraint_name in ('appointments_clinic_patient_fkey','payments_clinic_patient_fkey','payments_clinic_appointment_patient_fkey')),3,'three composite tenant integrity FKs installed');

select * from extensions.finish();
rollback;
