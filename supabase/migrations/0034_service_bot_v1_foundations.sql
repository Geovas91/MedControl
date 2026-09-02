-- Service Bot Tier 1 foundations. No chat, AI provider, clinical access or corrective actions.

create function public.support_safe_codes(values_to_check text[], maximum_count integer)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(cardinality(values_to_check), 0) <= maximum_count
    and not exists (
      select 1 from unnest(coalesce(values_to_check, '{}'::text[])) code
      where code !~ '^[a-z][a-z0-9_]{0,63}$'
    );
$$;

create function public.support_safe_metadata(metadata_to_check jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(metadata_to_check) = 'object'
    and metadata_to_check - array['category','severity','diagnostic_id','diagnostic_code','visibility','assignment_state']::text[] = '{}'::jsonb
    and not exists (
      select 1 from jsonb_each(metadata_to_check) item
      where jsonb_typeof(item.value) <> 'string' or item.value #>> '{}' !~ '^[a-z0-9_]{1,64}$'
    );
$$;

create table public.support_article_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_article_categories_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint support_article_categories_label_check check (char_length(label) between 1 and 100),
  constraint support_article_categories_sort_order_check check (sort_order between 0 and 10000)
);

create table public.support_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id uuid not null references public.support_article_categories(id) on delete restrict,
  audience_roles public.clinic_member_role[] not null default array['owner','admin','doctor','assistant']::public.clinic_member_role[],
  required_features text[] not null default '{}',
  current_published_version_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_articles_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint support_articles_audience_check check (cardinality(audience_roles) between 1 and 4),
  constraint support_articles_features_check check (public.support_safe_codes(required_features, 12)),
  unique (id, current_published_version_id)
);

create table public.support_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.support_articles(id) on delete cascade,
  version integer not null,
  title text not null,
  summary text not null,
  body_markdown text not null,
  search_document tsvector generated always as (
    to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(body_markdown, ''))
  ) stored,
  status text not null default 'draft',
  content_hash text not null,
  reviewed_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_article_versions_version_check check (version > 0),
  constraint support_article_versions_title_check check (char_length(title) between 1 and 160),
  constraint support_article_versions_summary_check check (char_length(summary) between 1 and 500),
  constraint support_article_versions_body_check check (char_length(body_markdown) between 1 and 20000),
  constraint support_article_versions_status_check check (status in ('draft','review','published','retired')),
  constraint support_article_versions_hash_check check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint support_article_versions_published_check check (
    status <> 'published' or (reviewed_by is not null and published_at is not null)
  ),
  constraint support_article_versions_no_raw_html_check check (
    body_markdown !~* '<[[:space:]]*/?[[:space:]]*(script|iframe|img|object|embed|style|link|meta)([[:space:]>])'
    and body_markdown !~* '(javascript|data|vbscript)[[:space:]]*:'
    and body_markdown !~ '!\[[^]]*\]\('
  ),
  unique (article_id, version),
  unique (article_id, id)
);

alter table public.support_articles
  add constraint support_articles_current_version_fk
  foreign key (id, current_published_version_id)
  references public.support_article_versions(article_id, id)
  on delete restrict;

create index support_article_versions_search_idx on public.support_article_versions using gin(search_document);

create function public.validate_support_current_article_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.current_published_version_id is not null and not exists (
    select 1 from public.support_article_versions version
    where version.id = new.current_published_version_id and version.article_id = new.id
      and version.status = 'published' and version.reviewed_by is not null and version.published_at is not null
  ) then
    raise exception 'Current support article version must be published and reviewed.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger support_articles_validate_current_version
before insert or update of current_published_version_id on public.support_articles
for each row execute function public.validate_support_current_article_version();

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null default upper(encode(extensions.gen_random_bytes(8), 'hex')) unique,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  category text not null,
  severity text not null,
  status text not null default 'open',
  subject text not null,
  summary text not null,
  diagnostic_codes text[] not null default '{}',
  assigned_to uuid references auth.users(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  constraint support_tickets_reference_check check (reference_code ~ '^[0-9A-F]{16}$'),
  constraint support_tickets_category_check check (category in ('how_to','authentication','appointments','members','configuration','google_calendar','appointment_assistant','email','billing','other')),
  constraint support_tickets_severity_check check (severity in ('low','normal','high')),
  constraint support_tickets_status_check check (status in ('open','triaged','in_progress','waiting_user','resolved','closed')),
  constraint support_tickets_subject_check check (char_length(subject) between 1 and 140),
  constraint support_tickets_summary_check check (char_length(summary) between 1 and 2000),
  constraint support_tickets_diagnostic_codes_check check (public.support_safe_codes(diagnostic_codes, 12)),
  constraint support_tickets_resolution_dates_check check (
    (status not in ('resolved','closed') or resolved_at is not null)
    and (status <> 'closed' or closed_at is not null)
  ),
  constraint support_tickets_creator_membership_fk foreign key (clinic_id, created_by)
    references public.clinic_members(clinic_id, user_id) on delete restrict
);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_kind text not null,
  visibility text not null,
  body text not null,
  created_at timestamptz not null default now(),
  redacted_at timestamptz,
  redacted_by uuid references auth.users(id) on delete restrict,
  constraint support_ticket_messages_author_kind_check check (author_kind in ('clinic_user','platform_admin')),
  constraint support_ticket_messages_visibility_check check (visibility in ('requester','clinic','internal')),
  constraint support_ticket_messages_body_check check (char_length(body) between 1 and 4000),
  constraint support_ticket_messages_internal_check check (visibility <> 'internal' or author_kind = 'platform_admin'),
  constraint support_ticket_messages_redaction_check check ((redacted_at is null) = (redacted_by is null))
);

create table public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint support_ticket_events_type_check check (event_type in (
    'support_ticket_created','support_ticket_status_changed','support_ticket_assignment_changed',
    'support_ticket_message_added','support_diagnostic_executed','support_ticket_redacted'
  )),
  constraint support_ticket_events_from_status_check check (from_status is null or from_status in ('open','triaged','in_progress','waiting_user','resolved','closed')),
  constraint support_ticket_events_to_status_check check (to_status is null or to_status in ('open','triaged','in_progress','waiting_user','resolved','closed')),
  constraint support_ticket_events_transition_check check (
    (event_type = 'support_ticket_status_changed' and from_status is not null and to_status is not null and from_status <> to_status)
    or (event_type <> 'support_ticket_status_changed' and from_status is null and to_status is null)
  ),
  constraint support_ticket_events_metadata_check check (public.support_safe_metadata(safe_metadata))
);

create table public.support_interaction_metrics (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  intent text not null,
  article_ids uuid[] not null default '{}',
  diagnostic_codes text[] not null default '{}',
  outcome text not null,
  created_at timestamptz not null default now(),
  constraint support_interaction_metrics_membership_fk foreign key (clinic_id, user_id)
    references public.clinic_members(clinic_id, user_id) on delete cascade,
  constraint support_interaction_metrics_intent_check check (intent in ('create_appointment','reschedule_appointment','cancel_appointment','manage_members','login_problem','email_problem','google_calendar_problem','appointment_assistant_problem','subscription_question','configuration_question','feature_explanation','clinical_question','unresolved')),
  constraint support_interaction_metrics_articles_check check (cardinality(article_ids) <= 10),
  constraint support_interaction_metrics_codes_check check (public.support_safe_codes(diagnostic_codes, 12)),
  constraint support_interaction_metrics_outcome_check check (outcome in ('resolved','ticket_created','abandoned'))
);

create table public.support_rate_limit_counters (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  primary key (clinic_id, user_id, operation, window_started_at),
  constraint support_rate_limit_operation_check check (operation in ('diagnostic','ticket_create','message_create')),
  constraint support_rate_limit_count_check check (request_count > 0)
);

create index support_tickets_clinic_status_activity_idx on public.support_tickets(clinic_id, status, last_activity_at desc);
create index support_tickets_creator_activity_idx on public.support_tickets(created_by, last_activity_at desc);
create index support_ticket_messages_ticket_created_idx on public.support_ticket_messages(ticket_id, created_at);
create index support_ticket_events_ticket_created_idx on public.support_ticket_events(ticket_id, created_at);
create index support_interaction_metrics_retention_idx on public.support_interaction_metrics(created_at);
create index support_rate_limit_retention_idx on public.support_rate_limit_counters(window_started_at);

create trigger support_article_categories_set_updated_at before update on public.support_article_categories for each row execute function public.set_updated_at();
create trigger support_articles_set_updated_at before update on public.support_articles for each row execute function public.set_updated_at();
create trigger support_tickets_set_updated_at before update on public.support_tickets for each row execute function public.set_updated_at();

create function public.validate_support_ticket_actor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clinic_id uuid;
begin
  select clinic_id into v_clinic_id from public.support_tickets where id = new.ticket_id;
  if new.author_kind = 'clinic_user' then
    if new.visibility = 'internal' or not public.has_clinic_role(v_clinic_id, array['owner','admin','doctor','assistant'])
      or new.author_user_id <> auth.uid() then
      raise exception 'Invalid support ticket clinic actor.' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.platform_admins where user_id = new.author_user_id) then
    raise exception 'Invalid support ticket platform actor.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger support_ticket_messages_validate_actor before insert or update on public.support_ticket_messages
for each row execute function public.validate_support_ticket_actor();

create function public.validate_support_ticket_event_actor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_clinic_id uuid;
begin
  select clinic_id into v_clinic_id from public.support_tickets where id = new.ticket_id;
  if not exists (
    select 1 from public.clinic_members where clinic_id = v_clinic_id and user_id = new.actor_user_id and status = 'active'
  ) and not exists (select 1 from public.platform_admins where user_id = new.actor_user_id) then
    raise exception 'Invalid support ticket event actor.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger support_ticket_events_validate_actor before insert or update on public.support_ticket_events
for each row execute function public.validate_support_ticket_event_actor();

create function public.validate_support_ticket_assignment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.assigned_to is not null and not exists (select 1 from public.platform_admins where user_id = new.assigned_to) then
    raise exception 'Support tickets may be assigned only to platform administrators.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger support_tickets_validate_assignment before insert or update of assigned_to on public.support_tickets
for each row execute function public.validate_support_ticket_assignment();

alter table public.support_article_categories enable row level security;
alter table public.support_articles enable row level security;
alter table public.support_article_versions enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_events enable row level security;
alter table public.support_interaction_metrics enable row level security;
alter table public.support_rate_limit_counters enable row level security;

revoke all privileges on table public.support_article_categories, public.support_articles, public.support_article_versions,
  public.support_tickets, public.support_ticket_messages, public.support_ticket_events,
  public.support_interaction_metrics, public.support_rate_limit_counters from public, anon, authenticated;

grant select on table public.support_article_categories to authenticated;
grant select (id,slug,category_id,audience_roles,required_features,current_published_version_id,active,created_at,updated_at)
  on public.support_articles to authenticated;
grant select (id,article_id,version,title,summary,body_markdown,status,published_at,created_at)
  on public.support_article_versions to authenticated;
grant select (id,reference_code,clinic_id,created_by,category,severity,status,subject,summary,diagnostic_codes,last_activity_at,created_at,updated_at,resolved_at,closed_at)
  on public.support_tickets to authenticated;
grant select (id,ticket_id,author_kind,visibility,body,created_at,redacted_at)
  on public.support_ticket_messages to authenticated;
grant select (id,ticket_id,event_type,from_status,to_status,safe_metadata,created_at)
  on public.support_ticket_events to authenticated;

create policy "Authenticated members can read active support categories" on public.support_article_categories
for select to authenticated using (active and exists(select 1 from public.clinic_members where user_id=auth.uid() and status='active'));

create policy "Authenticated members can read eligible published support articles" on public.support_articles
for select to authenticated using (
  active and current_published_version_id is not null and exists(
    select 1 from public.clinic_members member where member.user_id=auth.uid() and member.status='active' and member.role=any(audience_roles)
  )
);

create policy "Authenticated members can read current support article versions" on public.support_article_versions
for select to authenticated using (
  status='published' and exists(
    select 1 from public.support_articles article join public.clinic_members member on member.user_id=auth.uid() and member.status='active'
    where article.id=article_id and article.current_published_version_id=support_article_versions.id
      and article.active and member.role=any(article.audience_roles)
  )
);

create policy "Clinic members can read permitted support tickets" on public.support_tickets
for select to authenticated using (
  public.is_clinic_member(clinic_id)
  and (created_by=auth.uid() or public.has_clinic_role(clinic_id,array['owner','admin']))
);

create policy "Clinic members can read non-internal permitted ticket messages" on public.support_ticket_messages
for select to authenticated using (
  visibility <> 'internal' and exists(
    select 1 from public.support_tickets ticket where ticket.id=ticket_id
      and public.is_clinic_member(ticket.clinic_id)
      and (ticket.created_by=auth.uid() or public.has_clinic_role(ticket.clinic_id,array['owner','admin']))
  )
);

create policy "Clinic members can read permitted ticket events" on public.support_ticket_events
for select to authenticated using (
  exists(select 1 from public.support_tickets ticket where ticket.id=ticket_id
    and public.is_clinic_member(ticket.clinic_id)
    and (ticket.created_by=auth.uid() or public.has_clinic_role(ticket.clinic_id,array['owner','admin'])))
);

create function public.consume_support_rate_limit(p_clinic_id uuid, p_operation text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limit integer;
  v_window_seconds integer;
  v_window timestamptz;
  v_count integer;
begin
  if not public.has_clinic_role(p_clinic_id,array['owner','admin','doctor','assistant']) then return false; end if;
  select limits.max_requests, limits.window_seconds into v_limit, v_window_seconds
  from (values ('diagnostic',10,60),('ticket_create',3,3600),('message_create',20,3600)) limits(operation,max_requests,window_seconds)
  where limits.operation=p_operation;
  if v_limit is null then return false; end if;
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp())/v_window_seconds)*v_window_seconds);
  insert into public.support_rate_limit_counters(clinic_id,user_id,operation,window_started_at,request_count)
  values (p_clinic_id,auth.uid(),p_operation,v_window,1)
  on conflict (clinic_id,user_id,operation,window_started_at) do update
    set request_count=public.support_rate_limit_counters.request_count+1
    where public.support_rate_limit_counters.request_count < v_limit
  returning request_count into v_count;
  return v_count is not null and v_count <= v_limit;
end;
$$;

create function public.create_support_ticket_for_current_user(
  p_clinic_id uuid, p_category text, p_impact text, p_subject text, p_summary text, p_diagnostic_codes text[] default '{}'
)
returns setof public.support_tickets language plpgsql security definer set search_path = public, pg_temp as $$
declare v_severity text; v_ticket public.support_tickets;
begin
  if not public.has_clinic_role(p_clinic_id,array['owner','admin','doctor','assistant']) then raise exception 'Support ticket not found.' using errcode='P0002'; end if;
  if not public.consume_support_rate_limit(p_clinic_id,'ticket_create') then raise exception 'Support ticket rate limit exceeded.' using errcode='P0001'; end if;
  if p_category not in ('how_to','authentication','appointments','members','configuration','google_calendar','appointment_assistant','email','billing','other')
    or p_impact not in ('informational','single_user_blocked','multiple_users_blocked','access_blocked') then raise exception 'Invalid support ticket input.' using errcode='22023'; end if;
  v_severity := case when p_impact in ('multiple_users_blocked','access_blocked') then 'high' when p_impact='informational' or p_category='how_to' then 'low' else 'normal' end;
  insert into public.support_tickets(clinic_id,created_by,category,severity,subject,summary,diagnostic_codes)
  values (p_clinic_id,auth.uid(),p_category,v_severity,trim(p_subject),trim(p_summary),coalesce(p_diagnostic_codes,'{}')) returning * into v_ticket;
  insert into public.support_ticket_events(ticket_id,actor_user_id,event_type,safe_metadata)
  values (v_ticket.id,auth.uid(),'support_ticket_created',jsonb_build_object('category',v_ticket.category,'severity',v_ticket.severity));
  return next v_ticket;
end;
$$;

create function public.add_support_ticket_message_for_current_user(p_clinic_id uuid, p_ticket_id uuid, p_body text)
returns setof public.support_ticket_messages language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ticket public.support_tickets; v_message public.support_ticket_messages; v_visibility text;
begin
  if not public.has_clinic_role(p_clinic_id,array['owner','admin','doctor','assistant']) then raise exception 'Support ticket not found.' using errcode='P0002'; end if;
  select * into v_ticket from public.support_tickets where id=p_ticket_id and clinic_id=p_clinic_id
    and (created_by=auth.uid() or public.has_clinic_role(clinic_id,array['owner','admin']));
  if v_ticket.id is null then raise exception 'Support ticket not found.' using errcode='P0002'; end if;
  if v_ticket.status='closed' then raise exception 'Closed support ticket cannot receive messages.' using errcode='22023'; end if;
  if not public.consume_support_rate_limit(p_clinic_id,'message_create') then raise exception 'Support message rate limit exceeded.' using errcode='P0001'; end if;
  v_visibility := case when v_ticket.created_by=auth.uid() then 'requester' else 'clinic' end;
  insert into public.support_ticket_messages(ticket_id,author_user_id,author_kind,visibility,body)
  values (v_ticket.id,auth.uid(),'clinic_user',v_visibility,trim(p_body)) returning * into v_message;
  update public.support_tickets set last_activity_at=now() where id=v_ticket.id;
  insert into public.support_ticket_events(ticket_id,actor_user_id,event_type,safe_metadata)
  values (v_ticket.id,auth.uid(),'support_ticket_message_added',jsonb_build_object('visibility',v_visibility));
  return next v_message;
end;
$$;

create function public.transition_support_ticket_for_requester(p_clinic_id uuid, p_ticket_id uuid, p_to_status text)
returns setof public.support_tickets language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ticket public.support_tickets; v_updated public.support_tickets;
begin
  if not public.has_clinic_role(p_clinic_id,array['owner','admin','doctor','assistant']) then raise exception 'Support ticket not found.' using errcode='P0002'; end if;
  select * into v_ticket from public.support_tickets where id=p_ticket_id and clinic_id=p_clinic_id and created_by=auth.uid() for update;
  if v_ticket.id is null then raise exception 'Support ticket not found.' using errcode='P0002'; end if;
  if not ((v_ticket.status='waiting_user' and p_to_status='open') or (v_ticket.status='resolved' and p_to_status in ('open','closed'))) then
    raise exception 'Invalid requester support ticket transition.' using errcode='22023';
  end if;
  update public.support_tickets set status=p_to_status,last_activity_at=now(),
    resolved_at=case when p_to_status='open' then null else resolved_at end,
    closed_at=case when p_to_status='closed' then now() else null end
  where id=v_ticket.id returning * into v_updated;
  insert into public.support_ticket_events(ticket_id,actor_user_id,event_type,from_status,to_status)
  values (v_ticket.id,auth.uid(),'support_ticket_status_changed',v_ticket.status,v_updated.status);
  return next v_updated;
end;
$$;

create function public.record_support_interaction_metric_for_current_user(
  p_clinic_id uuid, p_intent text, p_article_ids uuid[], p_diagnostic_codes text[], p_outcome text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.has_clinic_role(p_clinic_id,array['owner','admin','doctor','assistant']) then raise exception 'Support context not found.' using errcode='P0002'; end if;
  insert into public.support_interaction_metrics(clinic_id,user_id,intent,article_ids,diagnostic_codes,outcome)
  values (p_clinic_id,auth.uid(),p_intent,coalesce(p_article_ids,'{}'),coalesce(p_diagnostic_codes,'{}'),p_outcome) returning id into v_id;
  return v_id;
end;
$$;

create function public.record_support_diagnostic_audit_for_current_user(p_clinic_id uuid, p_diagnostic_id text, p_diagnostic_code text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_clinic_role(p_clinic_id,array['owner','admin','doctor','assistant']) then return false; end if;
  if p_diagnostic_id not in ('session_status','current_role','subscription_access','appointment_write_readiness','member_management_readiness','google_calendar_status','appointment_automation_status','email_provider_readiness','feature_entitlement')
    or p_diagnostic_code !~ '^[a-z][a-z0-9_]{0,63}$' then return false; end if;
  insert into public.audit_logs(clinic_id,actor_user_id,entity_type,action,metadata)
  values (p_clinic_id,auth.uid(),'support_diagnostic','support_diagnostic_executed',jsonb_build_object('diagnostic_id',p_diagnostic_id,'diagnostic_code',p_diagnostic_code));
  return true;
end;
$$;

revoke all on function public.consume_support_rate_limit(uuid,text) from public,anon,authenticated;
revoke all on function public.create_support_ticket_for_current_user(uuid,text,text,text,text,text[]) from public,anon,authenticated;
revoke all on function public.add_support_ticket_message_for_current_user(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.transition_support_ticket_for_requester(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.record_support_interaction_metric_for_current_user(uuid,text,uuid[],text[],text) from public,anon,authenticated;
revoke all on function public.record_support_diagnostic_audit_for_current_user(uuid,text,text) from public,anon,authenticated;
grant execute on function public.consume_support_rate_limit(uuid,text) to authenticated;
grant execute on function public.create_support_ticket_for_current_user(uuid,text,text,text,text,text[]) to authenticated;
grant execute on function public.add_support_ticket_message_for_current_user(uuid,uuid,text) to authenticated;
grant execute on function public.transition_support_ticket_for_requester(uuid,uuid,text) to authenticated;
grant execute on function public.record_support_interaction_metric_for_current_user(uuid,text,uuid[],text[],text) to authenticated;
grant execute on function public.record_support_diagnostic_audit_for_current_user(uuid,text,text) to authenticated;

revoke all on function public.validate_support_current_article_version() from public,anon,authenticated;
revoke all on function public.validate_support_ticket_actor() from public,anon,authenticated;
revoke all on function public.validate_support_ticket_event_actor() from public,anon,authenticated;
revoke all on function public.validate_support_ticket_assignment() from public,anon,authenticated;

comment on table public.support_interaction_metrics is 'Structured Service Bot outcomes only. It intentionally contains no question, answer or conversation text.';
comment on table public.support_rate_limit_counters is 'Durable PostgreSQL counters for Service Bot diagnostics, tickets and ticket messages.';
comment on table public.support_ticket_messages is 'Untrusted support text. Users are warned not to include PHI; the system does not claim automatic PHI detection.';
