-- HoopVote · Migration 03 · Registrierung: gleiche Namensregeln wie update_my_profile
-- Ändert KEINE Datenzeilen und keine bestehenden Namen. Nur die Funktion join_team.
-- Die Tabelle erzwingt die Regeln bereits (profiles_display_name_check,
-- profiles_team_display_name_ci_unique). Neu gibt join_team dafür verständliche
-- deutsche Fehlermeldungen statt technischer Datenbankfehler.
-- Läuft als eine Transaktion: Schlägt ein Schritt fehl, wird alles zurückgerollt.

begin;

-- join_team: identisch zur Live-Version + Namensprüfung (Länge, eindeutig im Team).
-- «create or replace» behält die bestehenden Rechte.
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

commit;
