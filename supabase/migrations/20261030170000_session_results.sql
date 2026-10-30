-- HoopVote · Migration 04 · Resultate und Teilnahme pro Abstimmung
-- Nur additiv: zwei neue Lese-Funktionen. Ändert KEINE Datenzeilen und keine bestehenden Funktionen.
-- Läuft als eine Transaktion: Schlägt ein Schritt fehl, wird alles zurückgerollt.

begin;

-- 1) Teilnahme pro Session (stimmberechtigt / abgestimmt) für alle Sessions des eigenen Teams.
--    Gibt nur Zahlen zurück, keine Namen. Für offene Sessions zeigt open_session_progress das bereits heute.
create or replace function public.session_participation()
returns table(session_id uuid, eligible_count bigint, submitted_count bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_approved_member(v_team) then raise exception 'Keine Freigabe'; end if;
  return query
  select s.id,
    (select count(*) from public.session_players sp where sp.session_id=s.id and sp.present and sp.can_vote),
    (select count(*) from public.ballot_receipts br where br.session_id=s.id)
  from public.sessions s
  where s.team_id=v_team;
end$$;

-- 2) Resultate einer einzelnen Session pro Kategorie und Spieler.
--    Gleiche Sichtbarkeit wie leaderboard/category_leaderboard: nur abgeschlossene oder abgelaufene
--    Sessions; offene Sessions liefern keine Zeilen (keine Zwischenstände), abgebrochene ebenso.
create or replace function public.session_results(p_session_id uuid)
returns table(category_id uuid, category_name text, profile_id uuid, display_name text, avatar_path text, points bigint, first_places bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id();
begin
  if not public.is_approved_member(v_team) then raise exception 'Keine Freigabe'; end if;
  if not exists(select 1 from public.sessions where id=p_session_id and team_id=v_team) then raise exception 'Session nicht gefunden'; end if;
  return query
  select c.id,c.name,p.id,p.display_name,p.avatar_path,sum(v.points)::bigint,count(*) filter(where v.rank=1)::bigint
  from public.anonymous_votes v
  join public.sessions s on s.id=v.session_id
  join public.categories c on c.id=v.category_id
  join public.profiles p on p.id=v.candidate_profile_id
  where s.id=p_session_id and s.team_id=v_team
    and (s.status='closed' or (s.status='open' and s.ends_at<=now()))
  group by c.id,c.name,c.sort_order,p.id,p.display_name,p.avatar_path
  order by c.sort_order,sum(v.points) desc,p.display_name;
end$$;

revoke all on function public.session_participation() from public, anon;
revoke all on function public.session_results(uuid) from public, anon;
grant execute on function public.session_participation() to authenticated;
grant execute on function public.session_results(uuid) to authenticated;

commit;
