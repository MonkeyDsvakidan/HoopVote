-- HoopVote · Migration 01 · Avatar-Sicherheit
-- Ändert KEINE bestehenden Datenzeilen. Nur Funktionslogik und Upload-Limits.
-- Läuft als eine Transaktion: Schlägt ein Schritt fehl, wird alles zurückgerollt.

begin;

-- 1) Hilfsfunktion: Ein gültiger Bildpfad ist "<eigene-user-id>/<uuid>.<bildendung>"
create or replace function public.is_valid_avatar_path(p_path text)
returns boolean language sql stable set search_path=public as $$
  select auth.uid() is not null
     and coalesce(p_path,'') ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpe?g|png|webp|heic|heif|gif)$')
$$;
revoke all on function public.is_valid_avatar_path(text) from public, anon;
grant execute on function public.is_valid_avatar_path(text) to authenticated;

-- 2) join_team: identisch zur Live-Version + Pfadprüfung
create or replace function public.join_team(p_invite_token text, p_display_name text, p_avatar_path text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_team uuid; v_profile uuid;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt'; end if;
  if exists(select 1 from public.profiles where user_id=auth.uid()) then raise exception 'Profil existiert bereits'; end if;
  select id into v_team from public.teams where invite_token=trim(p_invite_token);
  if v_team is null then raise exception 'Einladungslink ungültig'; end if;
  if coalesce(trim(p_display_name),'')='' or coalesce(trim(p_avatar_path),'')='' then raise exception 'Name und Profilfoto sind Pflicht'; end if;
  if not public.is_valid_avatar_path(p_avatar_path) then raise exception 'Ungültiges Profilfoto'; end if;
  insert into public.profiles(user_id,team_id,display_name,avatar_path,role,status)
    values(auth.uid(),v_team,trim(p_display_name),p_avatar_path,'player','pending') returning id into v_profile;
  return v_profile;
end$function$;

-- 3) bootstrap_first_admin: identisch zur Live-Version + Pfadprüfung
create or replace function public.bootstrap_first_admin(p_team_name text, p_display_name text, p_avatar_path text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
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
end$function$;

-- 4) update_my_profile: identisch zur Live-Version + Pfadprüfung (nur wenn ein neues Foto gesetzt wird)
create or replace function public.update_my_profile(p_display_name text, p_avatar_path text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
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
end$function$;

-- 5) Upload-Limits für neue Profilbilder (bestehende Dateien bleiben unverändert)
--    10 MB, weil das grösste vorhandene Handyfoto bereits 7.5 MB hat.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif']
where id = 'avatars';

commit;
