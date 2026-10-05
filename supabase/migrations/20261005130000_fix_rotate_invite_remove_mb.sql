-- HoopVote · Migration 02 · Einladungslink reparieren, MusicBattle-Reste entfernen
-- Ändert KEINE Datenzeilen. Nur Funktionen.
-- Läuft als eine Transaktion: Schlägt ein Schritt fehl, wird alles zurückgerollt.

begin;

-- 1) admin_rotate_invite: identisch zur Live-Version, aber gen_random_bytes mit Schema
--    (pgcrypto liegt in «extensions», die Funktion sucht wegen search_path=public nur in «public»).
--    «create or replace» behält die bestehenden Rechte.
create or replace function public.admin_rotate_invite()
returns text language plpgsql security definer set search_path=public as $$
declare v_team uuid:=public.my_team_id(); v_token text;
begin
  if not public.is_admin(v_team) then raise exception 'Keine Admin-Rechte'; end if;
  v_token:=encode(extensions.gen_random_bytes(18),'hex');
  update public.teams set invite_token=v_token where id=v_team;
  return v_token;
end$$;

-- 2) Zwei versehentlich angelegte MusicBattle-Hilfsfunktionen entfernen.
--    Von HoopVote nirgends verwendet. Ohne «cascade»: Hinge doch etwas davon ab,
--    bricht die Migration ab und nichts wird geändert.
drop function if exists public.mb_is_room_member(uuid);
drop function if exists public.mb_is_room_player(uuid, integer);

commit;
