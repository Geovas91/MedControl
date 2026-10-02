-- Local PostgreSQL regression coverage; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users(id,email,email_confirmed_at)
select ('56100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'single-member-'||n||'@example.test',now() from generate_series(1,6) n;
insert into public.clinics(id,name) values
 ('56200000-0000-4000-8000-000000000001','Single membership A'),
 ('56200000-0000-4000-8000-000000000002','Single membership B'),
 ('56200000-0000-4000-8000-000000000003','Single membership C');
insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('56200000-0000-4000-8000-000000000001','56100000-0000-4000-8000-000000000001','owner','active'),
 ('56200000-0000-4000-8000-000000000001','56100000-0000-4000-8000-000000000002','admin','active'),
 ('56200000-0000-4000-8000-000000000001','56100000-0000-4000-8000-000000000003','doctor','active'),
 ('56200000-0000-4000-8000-000000000001','56100000-0000-4000-8000-000000000004','assistant','active'),
 ('56200000-0000-4000-8000-000000000002','56100000-0000-4000-8000-000000000005','doctor','suspended'),
 ('56200000-0000-4000-8000-000000000002','56100000-0000-4000-8000-000000000006','owner','active');

select extensions.ok((select indisunique from pg_index where indexrelid='public.clinic_members_one_active_per_user_idx'::regclass),'single-active unique index exists');
select extensions.ok(exists(select 1 from pg_constraint where conrelid='public.clinic_members'::regclass and conname='clinic_members_clinic_user_unique'),'per-clinic identity uniqueness remains');
select extensions.throws_ok(
 format('insert into public.clinic_members(clinic_id,user_id,role,status) values (%L,%L,%L,''active'')',
 '56200000-0000-4000-8000-000000000002',user_id,role),
 '23505',null,role::text||' cannot have two active memberships even in a privileged write')
from public.clinic_members where clinic_id='56200000-0000-4000-8000-000000000001' order by role;

select extensions.lives_ok($$insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('56200000-0000-4000-8000-000000000002','56100000-0000-4000-8000-000000000003','doctor','suspended'),
 ('56200000-0000-4000-8000-000000000003','56100000-0000-4000-8000-000000000003','doctor','invited')$$,
 'active + suspended + invited are allowed');
select extensions.throws_ok($$update public.clinic_members set status='active'
 where clinic_id='56200000-0000-4000-8000-000000000002' and user_id='56100000-0000-4000-8000-000000000003'$$,
 '23505',null,'reactivation cannot bypass the unique index');
select extensions.lives_ok($$update public.clinic_members set status='suspended'
 where user_id='56100000-0000-4000-8000-000000000003'$$,'multiple suspended memberships are allowed');
select extensions.lives_ok($$update public.clinic_members set status='active'
 where clinic_id='56200000-0000-4000-8000-000000000001' and user_id='56100000-0000-4000-8000-000000000003'$$,
 'suspend then reactivate one membership is valid');

insert into public.platform_admins(user_id,email,role) values
 ('56100000-0000-4000-8000-000000000001','single-member-1@example.test','admin');
select extensions.throws_ok($$insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('56200000-0000-4000-8000-000000000002','56100000-0000-4000-8000-000000000001','owner','active')$$,
 '23505',null,'platform admin has no exception to clinical uniqueness');
select extensions.ok(not has_function_privilege('authenticated','public.create_personal_clinic_for_current_user(text,text,text)','execute'),'legacy onboarding denied');
select extensions.ok(not has_function_privilege('anon','public.create_personal_clinic_for_current_user(text,text,text)','execute'),'legacy onboarding denied to anon');
select extensions.ok(not has_function_privilege('authenticated','public.add_clinic_member_by_email_for_current_user(uuid,text,text)','execute'),'legacy email activation remains denied');
select extensions.ok((select bool_and(prosecdef and proconfig @> array['search_path=public, pg_temp']) from pg_proc
 where oid in ('public.accept_clinic_member_invitation_for_current_user(text)'::regprocedure,
 'public.complete_clinic_onboarding_for_current_user(text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean)'::regprocedure)),
 'modern mutation RPCs retain SECURITY DEFINER with fixed search_path');

-- A has no subscription: membership remains usable for onboarding/Billing resolution.
set local role authenticated;
select set_config('request.jwt.claim.sub','56100000-0000-4000-8000-000000000001',true);
select extensions.ok(public.is_platform_admin(),'global platform authority remains independent');
select extensions.is((select count(*) from public.clinic_members where user_id=auth.uid() and status='active'),1::bigint,'missing subscription preserves active membership read');
select extensions.ok(not public.clinic_has_write_entitlement('56200000-0000-4000-8000-000000000001'),'missing subscription grants no write entitlement');
select extensions.is(public.complete_clinic_onboarding_for_current_user('Ignored','',null,null,'America/Mexico_City',null,null,null,'Synthetic Owner','plus',true,true,true),
 '56200000-0000-4000-8000-000000000001'::uuid,'onboarding returns sole active clinic without creating a second tenant');
reset role;
select extensions.is((select count(*) from public.clinics where id::text like '56200000-%'),3::bigint,'idempotent onboarding preserves clinic count');

insert into public.clinic_subscriptions(clinic_id,plan_id,status) values
 ('56200000-0000-4000-8000-000000000002','pro','active');
-- Creation must not inspect or disclose membership in another tenant.
set local role authenticated;
select set_config('request.jwt.claim.sub','56100000-0000-4000-8000-000000000006',true);
select extensions.lives_ok($$select * from public.create_clinic_member_invitation_for_current_user(
 '56200000-0000-4000-8000-000000000002','single-member-1@example.test','admin')$$,
 'owner may invite without learning that the recipient has another membership');
reset role;
create temp table single_member_invites as select id,token_hash from public.clinic_member_invitations
 where clinic_id='56200000-0000-4000-8000-000000000002' and normalized_email='single-member-1@example.test';
grant select on single_member_invites to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','56100000-0000-4000-8000-000000000001',true);
select extensions.throws_ok($$select public.accept_clinic_member_invitation_for_current_user((select token_hash from single_member_invites))$$,
 'P0001','Invitation is unavailable.','active user cannot accept another invitation');
reset role;
select extensions.ok((select status='pending' and token_hash is not null and accepted_at is null and accepted_user_id is null
 from public.clinic_member_invitations where id=(select id from single_member_invites)),'denial preserves one-shot token and pending state');
select extensions.is((select count(*) from public.audit_logs where entity_id=(select id from single_member_invites) and action='invitation_accepted'),0::bigint,'denial creates no acceptance audit');

insert into public.clinic_member_invitations(clinic_id,invited_email,normalized_email,role,token_hash,expires_at,created_by) values
 ('56200000-0000-4000-8000-000000000002','single-member-5@example.test','single-member-5@example.test','doctor',repeat('f',64),now()+interval '1 day','56100000-0000-4000-8000-000000000006');
set local role authenticated;
select set_config('request.jwt.claim.sub','56100000-0000-4000-8000-000000000005',true);
select extensions.is(public.accept_clinic_member_invitation_for_current_user(repeat('f',64)),
 '56200000-0000-4000-8000-000000000002'::uuid,'suspended member without active membership can accept and reactivate');
reset role;
select extensions.is((select count(*) from public.clinic_members where user_id='56100000-0000-4000-8000-000000000005' and status='active'),1::bigint,'reactivation has exactly one active membership');
select extensions.ok((select status='accepted' and token_hash is null from public.clinic_member_invitations where accepted_user_id='56100000-0000-4000-8000-000000000005'),'success consumes token');
select extensions.is((select count(*) from public.audit_logs where actor_user_id='56100000-0000-4000-8000-000000000005' and action='invitation_accepted'),1::bigint,'success records exactly one acceptance audit');
set local role service_role;
select extensions.throws_ok($$insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('56200000-0000-4000-8000-000000000003','56100000-0000-4000-8000-000000000005','doctor','active')$$,
 '23505',null,'service_role cannot bypass unique membership authority');
reset role;
select * from extensions.finish();
rollback;
