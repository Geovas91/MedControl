-- Run after a local `supabase db reset` with:
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0019_patient_universal_clinical_record.sql
begin;

insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','clinical-a@example.test'),
 ('10000000-0000-4000-8000-000000000002','clinical-b@example.test'),
 ('10000000-0000-4000-8000-000000000003','assistant-a@example.test');
insert into public.clinics(id,name) values
 ('20000000-0000-4000-8000-000000000001','Clínica A'),('20000000-0000-4000-8000-000000000002','Clínica B');
insert into public.clinic_members(clinic_id,user_id,role,status) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','doctor','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','doctor','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','assistant','active');
insert into public.clinic_subscriptions(clinic_id,plan_id,status,billing_provider) values
 ('20000000-0000-4000-8000-000000000001','pro','active','manual'),('20000000-0000-4000-8000-000000000002','pro','active','manual');
create temporary table patient_test_ids(key text primary key,value uuid);
grant all on patient_test_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select * from public.create_patient_with_record('20000000-0000-4000-8000-000000000001','Ana','López',p_date_of_birth=>'1990-05-10',p_phone=>'+525500000001');
insert into patient_test_ids select 'history_a',h.id from public.initial_clinical_histories h where h.clinic_id='20000000-0000-4000-8000-000000000001';
insert into patient_test_ids select 'record_a',r.id from public.clinical_records r where r.clinic_id='20000000-0000-4000-8000-000000000001';
insert into patient_test_ids select 'patient_a',p.id from public.patients p where p.clinic_id='20000000-0000-4000-8000-000000000001' and p.first_names='Ana';
select public.save_initial_clinical_history('20000000-0000-4000-8000-000000000001',
  (select id from public.patients where first_names='Ana'),'draft',p_chief_complaint=>'Consulta preventiva');
insert into public.vital_sign_measurements(clinic_id,clinical_record_id,patient_id,measured_at,weight_kg,height_cm,recorded_by)
select '20000000-0000-4000-8000-000000000001',(select value from patient_test_ids where key='record_a'),p.id,now()-interval '1 hour',70,175,'10000000-0000-4000-8000-000000000001'
from public.patients p where p.first_names='Ana';
insert into public.vital_sign_measurements(clinic_id,clinical_record_id,patient_id,measured_at,temperature_c,recorded_by)
select '20000000-0000-4000-8000-000000000001',(select value from patient_test_ids where key='record_a'),p.id,now(),37.1,'10000000-0000-4000-8000-000000000001'
from public.patients p where p.first_names='Ana';

do $$ begin
 if (select count(*) from public.patients where clinic_id='20000000-0000-4000-8000-000000000001')<>1 then raise exception 'Atomic patient insert failed'; end if;
 if (select count(*) from public.clinical_records where clinic_id='20000000-0000-4000-8000-000000000001')<>1 then raise exception 'Atomic record insert failed'; end if;
 if (select count(*) from public.initial_clinical_histories where clinic_id='20000000-0000-4000-8000-000000000001' and status='draft')<>1 then raise exception 'Draft history insert failed'; end if;
 if not exists(select 1 from public.initial_clinical_assessments where history_id=(select value from patient_test_ids where key='history_a') and chief_complaint='Consulta preventiva') then raise exception 'Draft history save failed'; end if;
 if (select count(*) from public.vital_sign_measurements where clinical_record_id=(select value from patient_test_ids where key='record_a'))<>2 then raise exception 'Vital history was overwritten'; end if;
 if not exists(select 1 from public.vital_sign_measurements where clinical_record_id=(select value from patient_test_ids where key='record_a') and bmi=22.86) then raise exception 'Generated BMI is incorrect'; end if;
 begin insert into public.clinical_records(clinic_id,patient_id) select clinic_id,id from public.patients where first_names='Ana';
  raise exception 'A second active record was accepted'; exception when unique_violation then null; end;
 begin
  perform public.create_patient_with_record('20000000-0000-4000-8000-000000000001','Ana','López',p_date_of_birth=>'1990-05-10',p_phone=>'+525500000001');
  raise exception 'Duplicate patient was accepted';
 exception when unique_violation then null; end;
end $$;

-- A record and patient that both belong to the same clinic must still belong to each other.
select * from public.create_patient_with_record('20000000-0000-4000-8000-000000000001','Beatriz','Santos',p_date_of_birth=>'1992-06-15',p_phone=>'+525500000004');
insert into patient_test_ids select 'patient_same_clinic_b',p.id from public.patients p
where p.clinic_id='20000000-0000-4000-8000-000000000001' and p.first_names='Beatriz';

do $$ declare v_record_a uuid; v_patient_b uuid; begin
 select value into strict v_record_a from patient_test_ids where key='record_a';
 select value into strict v_patient_b from patient_test_ids where key='patient_same_clinic_b';
 begin
  insert into public.initial_clinical_histories(clinic_id,clinical_record_id,patient_id,archived_at)
  values('20000000-0000-4000-8000-000000000001',v_record_a,v_patient_b,now());
  raise exception 'History accepted a record belonging to another patient in the same clinic';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.clinical_alerts(clinic_id,clinical_record_id,patient_id,alert_type,name)
  values('20000000-0000-4000-8000-000000000001',v_record_a,v_patient_b,'allergy','Mismatch test');
  raise exception 'Alert accepted a record belonging to another patient in the same clinic';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.vital_sign_measurements(clinic_id,clinical_record_id,patient_id,temperature_c,recorded_by)
  values('20000000-0000-4000-8000-000000000001',v_record_a,v_patient_b,37,'10000000-0000-4000-8000-000000000001');
  raise exception 'Vital signs accepted a record belonging to another patient in the same clinic';
 exception when foreign_key_violation then null; end;
 begin
 update public.initial_clinical_histories set completed_at=now()
  where id=(select value from patient_test_ids where key='history_a');
  raise exception 'Non-completed history accepted completed_at';
 exception when check_violation then null; end;
 begin
  update public.initial_clinical_histories set status='completed',completed_at=null
  where id=(select value from patient_test_ids where key='history_a');
  raise exception 'Completed history accepted a null completed_at';
 exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select * from public.create_patient_with_record('20000000-0000-4000-8000-000000000002','Bruno','Pérez',p_date_of_birth=>'1988-04-03',p_phone=>'+525500000002');
insert into patient_test_ids select 'record_b',r.id from public.clinical_records r where r.clinic_id='20000000-0000-4000-8000-000000000002';
insert into patient_test_ids select 'patient_b',p.id from public.patients p where p.clinic_id='20000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare v_record_b uuid; v_patient_b uuid; begin
 if exists(select 1 from public.patients where clinic_id='20000000-0000-4000-8000-000000000002') then raise exception 'Cross-clinic patient read was allowed'; end if;
 select value into v_record_b from patient_test_ids where key='record_b'; select value into v_patient_b from patient_test_ids where key='patient_b';
 update public.clinical_records set status='archived' where id=v_record_b;
 if found then raise exception 'Cross-clinic record update was allowed'; end if;
 begin insert into public.initial_clinical_histories(clinic_id,clinical_record_id,patient_id)
  values('20000000-0000-4000-8000-000000000001',v_record_b,v_patient_b); raise exception 'Foreign history was accepted';
 exception when foreign_key_violation or insufficient_privilege then null; end;
 begin insert into public.vital_sign_measurements(clinic_id,clinical_record_id,patient_id,temperature_c,recorded_by)
  values('20000000-0000-4000-8000-000000000001',v_record_b,v_patient_b,37,'10000000-0000-4000-8000-000000000001'); raise exception 'Foreign vital signs were accepted';
 exception when foreign_key_violation or insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select * from public.create_patient_with_record('20000000-0000-4000-8000-000000000001','Carla','Ruiz',p_date_of_birth=>'1995-01-02',p_phone=>'+525500000003');
do $$ begin
 begin perform allergies from public.patients limit 1; raise exception 'Assistant read legacy clinical columns';
  exception when insufficient_privilege then null; end;
 update public.initial_clinical_histories set status='pending' where id=(select value from patient_test_ids where key='history_a');
 if found then raise exception 'Assistant edited clinical history'; end if;
 begin perform public.save_initial_clinical_history('20000000-0000-4000-8000-000000000001',(select id from public.patients where first_names='Carla'),'draft');
  raise exception 'Assistant used clinical RPC'; exception when insufficient_privilege then null; end;
end $$;

rollback;
