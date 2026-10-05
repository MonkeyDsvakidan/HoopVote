-- =====================================================================
-- HoopVote · Datenbankschema
-- =====================================================================
--
-- ⚠️  NUR FÜR EINE LEERE, NEUE SUPABASE-DATENBANK.
-- ⚠️  NIE AUF DER PRODUKTIV-DATENBANK AUSFÜHREN.
--
-- Diese Datei beschreibt den Stand der Live-Datenbank (Projekt «HoopVote»)
-- vom 5. Oktober 2026, inklusive Migrationen
-- supabase/migrations/20261005120000_avatar_security.sql,
-- supabase/migrations/20261005130000_fix_rotate_invite_remove_mb.sql und
-- supabase/migrations/20261005140000_join_team_name_rules.sql.
-- Änderungen an der Live-Datenbank nur als neue Migration in
-- supabase/migrations/ – und diese Datei danach nachführen.
--
-- Hinweise zu Supabase-Standards:
-- * pgcrypto ist in Supabase bereits im Schema «extensions» installiert.
-- * Supabase gibt anon/authenticated/service_role automatisch Rechte auf neue
--   Tabellen und Funktionen. Schutz kommt deshalb über RLS (nur Lese-Policies)
--   und über die revoke-Anweisungen weiter unten.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Typen
-- ---------------------------------------------------------------------
create type public.profile_role as enum ('admin','player');
create type public.profile_status as enum ('pending','approved','rejected');
create type public.season_status as enum ('draft','active','closed');
create type public.session_status as enum ('open','closed','cancelled');

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_token text not null unique default encode(extensions.gen_random_bytes(18),'hex'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  display_name text not null,
  avatar_path text not null,
  role public.profile_role not null default 'player',
  status public.profile_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint profiles_display_name_check check (char_length(trim(display_name)) between 2 and 10)
);
-- Benutzername pro Team eindeutig (Gross-/Kleinschreibung egal)
create unique index profiles_team_display_name_ci_unique on public.profiles(team_id, lower(display_name));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  unique(team_id,name)
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  status public.season_status not null default 'draft',
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now(),
  rating_stage text not null default 'start',
  unique(team_id,name),
  constraint seasons_rating_stage_check check (rating_stage in ('start','final','complete'))
);
create unique index one_active_season_per_team on public.seasons(team_id) where status='active';

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete restrict,
  title text not null,
  status public.session_status not null default 'open',
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  closed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > started_at)
);
create unique index one_open_session_per_team on public.sessions(team_id) where status='open';

create table public.session_players (
  session_id uuid not null references public.sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  present boolean not null default true,
  can_vote boolean not null default true,
  can_receive_votes boolean not null default true,
  primary key(session_id,profile_id)
);

-- Wer hat abgestimmt (ohne Inhalt der Stimme)
create table public.ballot_receipts (
  session_id uuid not null references public.sessions(id) on delete cascade,
  voter_profile_id uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key(session_id,voter_profile_id)
);

-- Stimmen ohne Voter-ID
create table public.anonymous_votes (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  candidate_profile_id uuid not null references public.profiles(id) on delete restrict,
  rank smallint not null check (rank between 1 and 3),
  points smallint not null check (points between 1 and 3)
);
create index anonymous_votes_session_idx on public.anonymous_votes(session_id);
create index anonymous_votes_candidate_idx on public.anonymous_votes(candidate_profile_id);

-- Saisonale Skill-Ratings (1–10), anonym ausgewertet
create table public.skill_ratings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  phase text not null check (phase in ('start','final')),
  rater_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  shooting smallint not null check (shooting between 1 and 10),
  layups smallint not null check (layups between 1 and 10),
  ballhandling smallint not null check (ballhandling between 1 and 10),
  passing smallint not null check (passing between 1 and 10),
  defense smallint not null check (defense between 1 and 10),
  rebounding smallint not null check (rebounding between 1 and 10),
  conditioning smallint not null check (conditioning between 1 and 10),
  basketball_iq smallint not null check (basketball_iq between 1 and 10),
  teamplay smallint not null check (teamplay between 1 and 10),
  created_at timestamptz not null default now(),
  constraint skill_ratings_not_self check (rater_profile_id <> target_profile_id),
  constraint skill_ratings_once unique (season_id, phase, rater_profile_id, target_profile_id)
);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.seasons enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.ballot_receipts enable row level security;
alter table public.anonymous_votes enable row level security;
alter table public.skill_ratings enable row level security;

-- ---------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------
create or replace function public.my_profile_id()
returns uuid language sql stable security definer set search_path=public as $$
  select id from public.profiles where user_id=auth.uid() limit 1
$$;

create or replace function public.my_team_id()
returns uuid language sql stable security definer set search_path=public as $$
  select team_id from public.profiles where user_id=auth.uid() limit 1
$$;

create or replace function public.is_admin(p_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where user_id=auth.uid() and team_id=p_team_id and role='admin' and status='approved')
$$;

create or replace function public.is_approved_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where user_id=auth.uid() and team_id=p_team_id and status='approved')
$$;

-- Gültiger Profilbild-Pfad: "<eigene-user-id>/<uuid>.<bildendung>"
create or replace function public.is_valid_avatar_path(p_path text)
returns boolean language sql stable set search_path=public as $$
  select auth.uid() is not null
     and coalesce(p_path,'') ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpe?g|png|webp|heic|heif|gif)$')
$$;

-- ---------------------------------------------------------------------
-- Policies (nur Lesen; Schreiben ausschliesslich über RPCs)
-- ---------------------------------------------------------------------
create policy teams_select on public.teams for select to authenticated using (id=public.my_team_id() and public.is_approved_member(id));
create policy profiles_select on public.profiles for select to authenticated using (
  id=public.my_profile_id() or (team_id=public.my_team_id() and (status='approved' or public.is_admin(team_id)))
);
create policy categories_select on public.categories for select to authenticated using (team_id=public.my_team_id() and public.is_approved_member(team_id));
create policy seasons_select on public.seasons for select to authenticated using (team_id=public.my_team_id() and public.is_approved_member(team_id));
create policy sessions_select on public.sessions for select to authenticated using (team_id=public.my_team_id() and public.is_approved_member(team_id));
create policy session_players_select on public.session_players for select to authenticated using (
  profile_id=public.my_profile_id() or public.is_admin((select s.team_id from public.sessions s where s.id=session_id))
);
create policy ballot_receipts_deny_direct on public.ballot_receipts for all to authenticated using (false) with check (false);
create policy anonymous_votes_deny_direct on public.anonymous_votes for all to authenticated using (false) with check (false);
create policy skill_ratings_deny_direct on public.skill_ratings for all to authenticated using (false) with check (false);

-- ---------------------------------------------------------------------
-- Profil, Registrierung, Team
-- ---------------------------------------------------------------------
create or replace function public.my_state()
returns table(profile_id uuid, team_id uuid, display_name text, avatar_path text, role public.profile_role, status public.profile_status)
language sql stable security definer set search_path=public as $$
  select p.id,p.team_id,p.display_name,p.avatar_path,p.role,p.status from public.profiles p where p.user_id=auth.uid() limit 1
$$;

create or replace function public.bootstrap_first_admin(p_team_name text, p_display_name text, p_avatar_path text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_team uuid; v_profile uuid;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt'; end if;
  if exists(select 1 from public.teams) then raise exception 'Ersteinrichtung bereits abgeschlossen'; end if;
  if exists(select 1 from public.profiles where user_id=auth.uid()) then raise exception 'Profil existiert bereits'; end if;
  if coalesce(trim(p_team_name),'')='' or coalesce(trim(p_display_name),'')='' or coalesce(trim(p_avatar_path),'')='' then raise exception 'Pflichtfelder fehlen'; end if;
  if not public.is_valid_avatar_path(p_avatar_path) then raise exception 'Ungültiges Profilfoto'; end if;
  insert into public.teams(name) values(trim(p_team_name)) returning id into v_team;
  insert into public.profiles(user_id,team_id,display_name,avatar_path,role,status)
    values(auth.uid(),v_team,trim(p_display_name),p_avatar_path,'admin','approved') returning id into v_profile;
  insert into public.categories(team_id,name,sort_order) values
    (v_team,'MVP',1),(v_team,'Bester Assist',2),(v_team,'Bester Scorer',3),(v_team,'Beste Defense',4);
  return v_profile;
end$$;

create or replace function public.join_team(p_invite_token text, p_display_name text, p_avatar_path text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_team uuid; v_profile uuid; v_name text:=trim(p_display_name);
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt'; end if;
  if exists(select 1 from public.profiles where user_id=auth.uid()) then raise exception 'Profil existiert bereits'; end if;
  select id into v_team from public.teams where invite_token=trim(p_invite_token);
  if v_team is null then raise exception 'Einladungslink ungültig'; end if;
  if coalesce(v_name,'')='' or coalesce(trim(p_avatar_path),'')='' then raise exception 'Name und Profilfoto sind Pflicht'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 10 then raise exception 'Benutzername muss 2 bis 10 Zeichen lang sein'; end if;
  if exists(select 1 from public.profiles p where p.team_id=v_team and lower(p.display_name)=lower(v_name)) then raise exception 'Benutzername bereits vergeben'; end if;
  if not public.is_valid_avatar_path(p_avatar_path) then raise exception 'Ungültiges Profilfoto'; end if;
  insert into public.profiles(user_id,team_id,display_name,avatar_path,role,status)
    values(auth.uid(),v_team,v_name,p_avatar_path,'player','pending') returning id into v_profile;
  return v_profile;
end$$;

create or replace function public.update_my_profile(p_display_name text, p_avatar_path text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_profile uuid:=public.my_profile_id(); v_name text:=trim(p_display_name);
begin
  if auth.uid() is null or v_profile is null then raise exception 'Nicht eingeloggt'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 10 then raise exception 'Benutzername muss 2 bis 10 Zeichen lang sein'; end if;
  if exists(select 1 from public.profiles p where p.team_id=public.my_team_id() and lower(p.display_name)=lower(v_name) and p.id<>v_profile) then raise exception 'Benutzername bereits vergeben'; end if;
  if coalesce(trim(p_avatar_path),'')<>'' and not public.is_valid_avatar_path(p_avatar_path) then raise exception 'Ungültiges Profilfoto'; end if;
  update public.profiles
  set display_name=v_name,
      avatar_path=case when coalesce(trim(p_avatar_path),'')='' then avatar_path else p_avatar_path end
  where id=v_profile;
end$$;

-- ---------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------
create or replace function public.admin_get_invite()
returns table(invite_token text) language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  return query select t.invite_token from public.teams t where t.id=v_team;
end$$;

-- gen_random_bytes mit Schema, weil pgcrypto in «extensions» liegt (Migration 02)
create or replace function public.admin_rotate_invite()
returns text language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id(); v_token text;
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  v_token:=encode(extensions.gen_random_bytes(18),'hex');
  update public.teams set invite_token=v_token where id=v_team;
  return v_token;
end$$;

create or replace function public.admin_set_profile_status(p_profile_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  update public.profiles set status=case when p_approve then 'approved'::public.profile_status else 'rejected'::public.profile_status end
  where id=p_profile_id and team_id=v_team and role='player';
  if not found then raise exception 'Spieler nicht gefunden'; end if;
end$$;

create or replace function public.admin_create_season(p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id(); v_id uuid;
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Saisonname fehlt'; end if;
  if exists(select 1 from public.seasons where team_id=v_team and status='active') then raise exception 'Aktive Saison zuerst manuell abschliessen'; end if;
  insert into public.seasons(team_id,name,status,starts_at) values(v_team,trim(p_name),'active',current_date) returning id into v_id;
  return v_id;
end$$;

-- Saisonabschluss in zwei Schritten: Startratings → Abschlussratings → archiviert
create or replace function public.admin_close_season(p_season_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_team uuid:=public.my_team_id();
  v_stage text;
  v_required bigint;
  v_done bigint;
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  if exists(select 1 from public.sessions where season_id=p_season_id and status='open') then raise exception 'Offene Session zuerst abschliessen oder abbrechen'; end if;
  select rating_stage into v_stage from public.seasons where id=p_season_id and team_id=v_team and status='active';
  if v_stage is null then raise exception 'Aktive Saison nicht gefunden'; end if;
  select count(*)::bigint into v_required from public.profiles a join public.profiles b on b.team_id=a.team_id and b.status='approved' and b.id<>a.id where a.team_id=v_team and a.status='approved';
  select count(*)::bigint into v_done from public.skill_ratings where season_id=p_season_id and phase=v_stage;
  if v_stage='start' then
    if v_done < v_required then raise exception 'Startratings noch offen: % von % Bewertungen abgegeben',v_done,v_required; end if;
    update public.seasons set rating_stage='final' where id=p_season_id;
    return;
  end if;
  if v_stage='final' then
    if v_done < v_required then raise exception 'Abschlussratings noch offen: % von % Bewertungen abgegeben',v_done,v_required; end if;
    update public.seasons set status='closed',rating_stage='complete',ends_at=current_date where id=p_season_id;
    return;
  end if;
  raise exception 'Saison kann nicht abgeschlossen werden';
end$$;

create or replace function public.admin_create_session(p_title text, p_attendees uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id(); v_admin uuid:=public.my_profile_id(); v_season uuid; v_session uuid; v_count int;
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  if exists(select 1 from public.sessions where team_id=v_team and status='open' and ends_at>now()) then raise exception 'Es existiert bereits eine offene Session'; end if;
  update public.sessions set status='closed',closed_at=coalesce(closed_at,ends_at) where team_id=v_team and status='open' and ends_at<=now();
  select id into v_season from public.seasons where team_id=v_team and status='active' limit 1;
  if v_season is null then raise exception 'Zuerst eine aktive Saison erstellen'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'Session-Titel fehlt'; end if;
  select count(*) into v_count from public.profiles where id=any(p_attendees) and team_id=v_team and status='approved';
  if v_count<4 or v_count<>coalesce(array_length(p_attendees,1),0) then raise exception 'Ungültige Anwesenheitsliste'; end if;
  insert into public.sessions(team_id,season_id,title,status,started_at,ends_at,created_by)
    values(v_team,v_season,trim(p_title),'open',now(),now()+interval '48 hours',v_admin) returning id into v_session;
  insert into public.session_players(session_id,profile_id,present,can_vote,can_receive_votes)
    select v_session,p.id,true,true,true from public.profiles p where p.id=any(p_attendees) and p.team_id=v_team and p.status='approved';
  return v_session;
end$$;

create or replace function public.admin_cancel_session(p_session_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  update public.sessions set status='cancelled',closed_at=now() where id=p_session_id and team_id=v_team and status='open';
  if not found then raise exception 'Offene Session nicht gefunden'; end if;
end$$;

-- Wer hat in einer Session schon abgestimmt (nur für Admin, ohne Inhalt der Stimme)
create or replace function public.admin_vote_status(p_session_id uuid)
returns table(profile_id uuid, display_name text, avatar_path text, has_submitted boolean)
language plpgsql stable security definer set search_path=public as $$
declare
  v_team uuid:=public.my_team_id();
begin
  if not public.is_admin(v_team) then
    raise exception 'Keine Admin-Rechte';
  end if;

  if not exists(
    select 1
    from public.sessions s
    where s.id=p_session_id
      and s.team_id=v_team
  ) then
    raise exception 'Session nicht gefunden';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.avatar_path,
    exists(
      select 1
      from public.ballot_receipts br
      where br.session_id=p_session_id
        and br.voter_profile_id=p.id
    ) as has_submitted
  from public.session_players sp
  join public.profiles p on p.id=sp.profile_id
  where sp.session_id=p_session_id
    and sp.present
    and sp.can_vote
    and p.team_id=v_team
    and p.status='approved'
  order by has_submitted desc, p.display_name;
end
$$;

-- ---------------------------------------------------------------------
-- Abstimmung
-- ---------------------------------------------------------------------
create or replace function public.current_vote_session()
returns table(id uuid, title text, started_at timestamptz, ends_at timestamptz, eligible_count bigint, submitted_count bigint, has_submitted boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_profile uuid:=public.my_profile_id();
  v_team uuid:=public.my_team_id();
begin
  if v_profile is null then return; end if;

  update public.sessions s
  set status='closed',
      closed_at=coalesce(s.closed_at,s.ends_at)
  where s.team_id=v_team
    and s.status='open'
    and s.ends_at<=now();

  return query
  select s.id,s.title,s.started_at,s.ends_at,
    (select count(*) from public.session_players sp where sp.session_id=s.id and sp.present and sp.can_vote),
    (select count(*) from public.ballot_receipts br where br.session_id=s.id),
    exists(select 1 from public.ballot_receipts br where br.session_id=s.id and br.voter_profile_id=v_profile)
  from public.sessions s
  join public.session_players me on me.session_id=s.id and me.profile_id=v_profile
  where s.team_id=v_team
    and s.status='open'
    and s.ends_at>now()
    and me.present
    and me.can_vote
  order by s.started_at desc
  limit 1;
end
$$;

create or replace function public.open_session_progress()
returns table(session_id uuid, title text, eligible_count bigint, submitted_count bigint)
language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_approved_member(v_team) then raise exception 'Keine Freigabe'; end if;
  update public.sessions set status='closed',closed_at=coalesce(closed_at,ends_at) where team_id=v_team and status='open' and ends_at<=now();
  return query select s.id,s.title,
    (select count(*) from public.session_players sp where sp.session_id=s.id and sp.present and sp.can_vote),
    (select count(*) from public.ballot_receipts br where br.session_id=s.id)
  from public.sessions s where s.team_id=v_team and s.status='open' and s.ends_at>now() order by s.started_at desc limit 1;
end$$;

create or replace function public.eligible_candidates(p_session_id uuid)
returns table(profile_id uuid, display_name text, avatar_path text)
language plpgsql stable security definer set search_path=public as $$
declare v_me uuid:=public.my_profile_id(); v_team uuid:=public.my_team_id();
begin
  if not exists(select 1 from public.sessions s join public.session_players sp on sp.session_id=s.id and sp.profile_id=v_me where s.id=p_session_id and s.team_id=v_team and s.status='open' and s.ends_at>now() and sp.present and sp.can_vote) then
    raise exception 'Keine Stimmberechtigung';
  end if;
  return query select p.id,p.display_name,p.avatar_path from public.session_players sp join public.profiles p on p.id=sp.profile_id
  where sp.session_id=p_session_id and sp.present and sp.can_receive_votes and p.status='approved' and p.id<>v_me order by p.display_name;
end$$;

create or replace function public.cast_ballot(p_session_id uuid, p_ballot jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_me uuid:=public.my_profile_id(); v_team uuid:=public.my_team_id(); v_session public.sessions%rowtype;
  v_cat record; v_ids uuid[]; v_i int; v_candidate uuid; v_eligible int; v_submitted int; v_cat_count int; v_ballot_count int;
begin
  if v_me is null then raise exception 'Kein Profil'; end if;
  select * into v_session from public.sessions where id=p_session_id and team_id=v_team for update;
  if not found or v_session.status<>'open' or v_session.ends_at<=now() then raise exception 'Session ist geschlossen'; end if;
  if not exists(select 1 from public.session_players where session_id=p_session_id and profile_id=v_me and present and can_vote) then raise exception 'Keine Stimmberechtigung'; end if;
  if exists(select 1 from public.ballot_receipts where session_id=p_session_id and voter_profile_id=v_me) then raise exception 'Bereits abgestimmt'; end if;
  select count(*) into v_cat_count from public.categories where team_id=v_team and active;
  select count(*) into v_ballot_count from jsonb_object_keys(p_ballot);
  if v_cat_count<>v_ballot_count then raise exception 'Alle Kategorien müssen ausgefüllt werden'; end if;
  for v_cat in select id from public.categories where team_id=v_team and active loop
    if not (p_ballot ? v_cat.id::text) then raise exception 'Kategorie fehlt'; end if;
    select array_agg(value::uuid order by ord) into v_ids from jsonb_array_elements_text(p_ballot->(v_cat.id::text)) with ordinality a(value,ord);
    if coalesce(array_length(v_ids,1),0)<>3 then raise exception 'Jede Kategorie braucht genau drei Spieler'; end if;
    if (select count(distinct x) from unnest(v_ids) x)<>3 then raise exception 'Doppelte Auswahl ist nicht erlaubt'; end if;
    if v_me=any(v_ids) then raise exception 'Selbstwahl ist nicht erlaubt'; end if;
    for v_i in 1..3 loop
      v_candidate:=v_ids[v_i];
      if not exists(select 1 from public.session_players sp join public.profiles p on p.id=sp.profile_id where sp.session_id=p_session_id and sp.profile_id=v_candidate and sp.present and sp.can_receive_votes and p.status='approved' and p.team_id=v_team) then raise exception 'Ungültiger Kandidat'; end if;
      insert into public.anonymous_votes(session_id,category_id,candidate_profile_id,rank,points)
        values(p_session_id,v_cat.id,v_candidate,v_i,4-v_i);
    end loop;
  end loop;
  insert into public.ballot_receipts(session_id,voter_profile_id) values(p_session_id,v_me);
  select count(*) into v_eligible from public.session_players where session_id=p_session_id and present and can_vote;
  select count(*) into v_submitted from public.ballot_receipts where session_id=p_session_id;
  if v_submitted>=v_eligible and v_eligible>0 then update public.sessions set status='closed',closed_at=now() where id=p_session_id; end if;
end$$;

-- ---------------------------------------------------------------------
-- Statistiken
-- ---------------------------------------------------------------------
create or replace function public.leaderboard(p_season_id uuid, p_month_start date default null)
returns table(profile_id uuid, display_name text, avatar_path text, points bigint, first_places bigint)
language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_approved_member(v_team) then raise exception 'Keine Freigabe'; end if;
  if not exists(select 1 from public.seasons where id=p_season_id and team_id=v_team) then raise exception 'Saison nicht gefunden'; end if;
  return query
  select p.id,p.display_name,p.avatar_path,sum(v.points)::bigint,count(*) filter(where v.rank=1)::bigint
  from public.anonymous_votes v join public.sessions s on s.id=v.session_id join public.profiles p on p.id=v.candidate_profile_id
  where s.team_id=v_team and s.season_id=p_season_id and (s.status='closed' or (s.status='open' and s.ends_at<=now()))
    and (p_month_start is null or (s.started_at at time zone 'Europe/Zurich')::date>=p_month_start and (s.started_at at time zone 'Europe/Zurich')::date<(p_month_start+interval '1 month')::date)
  group by p.id,p.display_name,p.avatar_path order by sum(v.points) desc,count(*) filter(where v.rank=1) desc,p.display_name;
end$$;

create or replace function public.category_leaderboard(p_season_id uuid, p_month_start date default null)
returns table(category_id uuid, category_name text, profile_id uuid, display_name text, points bigint)
language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_approved_member(v_team) then raise exception 'Keine Freigabe'; end if;
  return query
  select c.id,c.name,p.id,p.display_name,sum(v.points)::bigint
  from public.anonymous_votes v join public.sessions s on s.id=v.session_id join public.categories c on c.id=v.category_id join public.profiles p on p.id=v.candidate_profile_id
  where s.team_id=v_team and s.season_id=p_season_id and (s.status='closed' or (s.status='open' and s.ends_at<=now()))
    and (p_month_start is null or (s.started_at at time zone 'Europe/Zurich')::date>=p_month_start and (s.started_at at time zone 'Europe/Zurich')::date<(p_month_start+interval '1 month')::date)
  group by c.id,c.name,p.id,p.display_name,c.sort_order order by c.sort_order,sum(v.points) desc,p.display_name;
end$$;

create or replace function public.stats_summary(p_season_id uuid, p_month_start date default null)
returns table(session_count bigint, avg_participation numeric, total_points bigint)
language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_approved_member(v_team) then raise exception 'Keine Freigabe'; end if;
  return query
  with ss as (
    select s.id from public.sessions s where s.team_id=v_team and s.season_id=p_season_id and (s.status='closed' or (s.status='open' and s.ends_at<=now()))
      and (p_month_start is null or (s.started_at at time zone 'Europe/Zurich')::date>=p_month_start and (s.started_at at time zone 'Europe/Zurich')::date<(p_month_start+interval '1 month')::date)
  ), per as (
    select ss.id,
      (select count(*) from public.session_players sp where sp.session_id=ss.id and sp.present and sp.can_vote) eligible,
      (select count(*) from public.ballot_receipts br where br.session_id=ss.id) submitted
    from ss
  )
  select count(*)::bigint,case when count(*)=0 then null else avg(case when eligible=0 then 0 else submitted::numeric/eligible*100 end) end,
    coalesce((select sum(v.points)::bigint from public.anonymous_votes v where v.session_id in(select id from ss)),0)::bigint from per;
end$$;

-- ---------------------------------------------------------------------
-- Skill-Ratings
-- ---------------------------------------------------------------------
create or replace function public.current_rating_status()
returns table(season_id uuid, season_name text, phase text, missing_count bigint, total_targets bigint)
language sql stable security definer set search_path=public as $$
  with me as (
    select p.id profile_id,p.team_id from public.profiles p
    where p.user_id=auth.uid() and p.status='approved' limit 1
  ), s as (
    select s.id,s.name,s.rating_stage from public.seasons s join me on me.team_id=s.team_id
    where s.status='active' limit 1
  ), targets as (
    select p.id from public.profiles p join me on me.team_id=p.team_id
    where p.status='approved' and p.id<>me.profile_id
  )
  select s.id,s.name,s.rating_stage,
    count(t.id) filter (where r.id is null)::bigint,
    count(t.id)::bigint
  from s cross join me left join targets t on true
  left join public.skill_ratings r on r.season_id=s.id and r.phase=s.rating_stage and r.rater_profile_id=me.profile_id and r.target_profile_id=t.id
  where s.rating_stage in ('start','final')
  group by s.id,s.name,s.rating_stage
$$;

create or replace function public.pending_rating_targets()
returns table(profile_id uuid, display_name text, avatar_path text)
language sql stable security definer set search_path=public as $$
  with me as (
    select p.id profile_id,p.team_id from public.profiles p
    where p.user_id=auth.uid() and p.status='approved' limit 1
  ), s as (
    select s.id,s.rating_stage from public.seasons s join me on me.team_id=s.team_id
    where s.status='active' and s.rating_stage in ('start','final') limit 1
  )
  select p.id,p.display_name,p.avatar_path
  from public.profiles p cross join me cross join s
  where p.team_id=me.team_id and p.status='approved' and p.id<>me.profile_id
    and not exists(select 1 from public.skill_ratings r where r.season_id=s.id and r.phase=s.rating_stage and r.rater_profile_id=me.profile_id and r.target_profile_id=p.id)
  order by p.display_name
$$;

create or replace function public.submit_skill_rating(
  p_target_profile_id uuid,
  p_shooting int, p_layups int, p_ballhandling int, p_passing int, p_defense int,
  p_rebounding int, p_conditioning int, p_basketball_iq int, p_teamplay int
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_me public.profiles%rowtype;
  v_season public.seasons%rowtype;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt'; end if;
  select * into v_me from public.profiles where user_id=auth.uid() and status='approved' limit 1;
  if v_me.id is null then raise exception 'Profil nicht freigegeben'; end if;
  select * into v_season from public.seasons where team_id=v_me.team_id and status='active' limit 1;
  if v_season.id is null or v_season.rating_stage not in ('start','final') then raise exception 'Keine Rating-Runde aktiv'; end if;
  if p_target_profile_id=v_me.id then raise exception 'Du kannst dich nicht selbst bewerten'; end if;
  if not exists(select 1 from public.profiles where id=p_target_profile_id and team_id=v_me.team_id and status='approved') then raise exception 'Spieler nicht verfügbar'; end if;
  if p_shooting not between 1 and 10 or p_layups not between 1 and 10 or p_ballhandling not between 1 and 10 or p_passing not between 1 and 10 or p_defense not between 1 and 10 or p_rebounding not between 1 and 10 or p_conditioning not between 1 and 10 or p_basketball_iq not between 1 and 10 or p_teamplay not between 1 and 10 then raise exception 'Alle Ratings müssen zwischen 1 und 10 liegen'; end if;
  insert into public.skill_ratings(season_id,team_id,phase,rater_profile_id,target_profile_id,shooting,layups,ballhandling,passing,defense,rebounding,conditioning,basketball_iq,teamplay)
  values(v_season.id,v_me.team_id,v_season.rating_stage,v_me.id,p_target_profile_id,p_shooting,p_layups,p_ballhandling,p_passing,p_defense,p_rebounding,p_conditioning,p_basketball_iq,p_teamplay);
exception when unique_violation then
  raise exception 'Diesen Spieler hast du bereits bewertet';
end$$;

-- Durchschnittswerte erst ab 3 Bewertungen sichtbar
create or replace function public.skill_rating_summary(p_season_id uuid, p_phase text)
returns table(profile_id uuid, display_name text, avatar_path text, rating_count bigint, shooting numeric, layups numeric, ballhandling numeric, passing numeric, defense numeric, rebounding numeric, conditioning numeric, basketball_iq numeric, teamplay numeric)
language sql stable security definer set search_path=public as $$
  with me as (
    select p.team_id
    from public.profiles p
    where p.user_id=auth.uid()
      and p.status='approved'
    limit 1
  ),
  valid_season as (
    select s.id
    from public.seasons s
    join me on me.team_id=s.team_id
    where s.id=p_season_id
      and p_phase in ('start','final')
  ),
  agg as (
    select
      p.id,
      p.display_name,
      p.avatar_path,
      count(r.id)::bigint as rating_count,
      avg(r.shooting) as shooting,
      avg(r.layups) as layups,
      avg(r.ballhandling) as ballhandling,
      avg(r.passing) as passing,
      avg(r.defense) as defense,
      avg(r.rebounding) as rebounding,
      avg(r.conditioning) as conditioning,
      avg(r.basketball_iq) as basketball_iq,
      avg(r.teamplay) as teamplay
    from public.profiles p
    join me on me.team_id=p.team_id
    join valid_season vs on true
    left join public.skill_ratings r
      on r.target_profile_id=p.id
     and r.season_id=vs.id
     and r.phase=p_phase
    where p.status='approved'
    group by p.id,p.display_name,p.avatar_path
  )
  select
    id,
    display_name,
    avatar_path,
    rating_count,
    case when rating_count>=3 then round(shooting,1) end,
    case when rating_count>=3 then round(layups,1) end,
    case when rating_count>=3 then round(ballhandling,1) end,
    case when rating_count>=3 then round(passing,1) end,
    case when rating_count>=3 then round(defense,1) end,
    case when rating_count>=3 then round(rebounding,1) end,
    case when rating_count>=3 then round(conditioning,1) end,
    case when rating_count>=3 then round(basketball_iq,1) end,
    case when rating_count>=3 then round(teamplay,1) end
  from agg
  order by display_name
$$;

create or replace function public.admin_rating_progress(p_season_id uuid)
returns table(phase text, submitted_count bigint, required_count bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id(); v_phase text;
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  select rating_stage into v_phase from public.seasons where id=p_season_id and team_id=v_team;
  if v_phase not in ('start','final') then return; end if;
  return query
  select v_phase,
    (select count(*)::bigint from public.skill_ratings r where r.season_id=p_season_id and r.phase=v_phase),
    (select count(*)::bigint from public.profiles a join public.profiles b on b.team_id=a.team_id and b.status='approved' and b.id<>a.id where a.team_id=v_team and a.status='approved');
end$$;

-- ---------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------
-- Geheime Tabellen: für Clients komplett gesperrt
revoke all on table public.ballot_receipts from anon, authenticated;
revoke all on table public.anonymous_votes from anon, authenticated;
revoke all on table public.skill_ratings from anon, authenticated;

-- Funktionen: nur für eingeloggte Benutzer
revoke all on function public.my_profile_id() from public, anon;
revoke all on function public.my_team_id() from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.is_approved_member(uuid) from public, anon;
revoke all on function public.is_valid_avatar_path(text) from public, anon;
revoke all on function public.my_state() from public, anon;
revoke all on function public.bootstrap_first_admin(text,text,text) from public, anon;
revoke all on function public.join_team(text,text,text) from public, anon;
revoke all on function public.update_my_profile(text,text) from public, anon;
revoke all on function public.admin_get_invite() from public, anon;
revoke all on function public.admin_rotate_invite() from public, anon;
revoke all on function public.admin_set_profile_status(uuid,boolean) from public, anon;
revoke all on function public.admin_create_season(text) from public, anon;
revoke all on function public.admin_close_season(uuid) from public, anon;
revoke all on function public.admin_create_session(text,uuid[]) from public, anon;
revoke all on function public.admin_cancel_session(uuid) from public, anon;
revoke all on function public.admin_vote_status(uuid) from public, anon;
revoke all on function public.current_vote_session() from public, anon;
revoke all on function public.open_session_progress() from public, anon;
revoke all on function public.eligible_candidates(uuid) from public, anon;
revoke all on function public.cast_ballot(uuid,jsonb) from public, anon;
revoke all on function public.leaderboard(uuid,date) from public, anon;
revoke all on function public.category_leaderboard(uuid,date) from public, anon;
revoke all on function public.stats_summary(uuid,date) from public, anon;
revoke all on function public.current_rating_status() from public, anon;
revoke all on function public.pending_rating_targets() from public, anon;
revoke all on function public.submit_skill_rating(uuid,int,int,int,int,int,int,int,int,int) from public, anon;
revoke all on function public.skill_rating_summary(uuid,text) from public, anon;
revoke all on function public.admin_rating_progress(uuid) from public, anon;

grant execute on function public.my_profile_id() to authenticated;
grant execute on function public.my_team_id() to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_approved_member(uuid) to authenticated;
grant execute on function public.is_valid_avatar_path(text) to authenticated;
grant execute on function public.my_state() to authenticated;
grant execute on function public.bootstrap_first_admin(text,text,text) to authenticated;
grant execute on function public.join_team(text,text,text) to authenticated;
grant execute on function public.update_my_profile(text,text) to authenticated;
grant execute on function public.admin_get_invite() to authenticated;
grant execute on function public.admin_rotate_invite() to authenticated;
grant execute on function public.admin_set_profile_status(uuid,boolean) to authenticated;
grant execute on function public.admin_create_season(text) to authenticated;
grant execute on function public.admin_close_season(uuid) to authenticated;
grant execute on function public.admin_create_session(text,uuid[]) to authenticated;
grant execute on function public.admin_cancel_session(uuid) to authenticated;
grant execute on function public.admin_vote_status(uuid) to authenticated;
grant execute on function public.current_vote_session() to authenticated;
grant execute on function public.open_session_progress() to authenticated;
grant execute on function public.eligible_candidates(uuid) to authenticated;
grant execute on function public.cast_ballot(uuid,jsonb) to authenticated;
grant execute on function public.leaderboard(uuid,date) to authenticated;
grant execute on function public.category_leaderboard(uuid,date) to authenticated;
grant execute on function public.stats_summary(uuid,date) to authenticated;
grant execute on function public.current_rating_status() to authenticated;
grant execute on function public.pending_rating_targets() to authenticated;
grant execute on function public.submit_skill_rating(uuid,int,int,int,int,int,int,int,int,int) to authenticated;
grant execute on function public.skill_rating_summary(uuid,text) to authenticated;
grant execute on function public.admin_rating_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Profilbilder (Storage)
-- ---------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',true,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif'])
on conflict(id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy avatars_insert on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatars_public_read on storage.objects for select to public using (bucket_id='avatars');
