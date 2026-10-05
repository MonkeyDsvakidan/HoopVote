window.addEventListener('DOMContentLoaded', async () => {
  const p = await HoopVote.guard({ admin: true });
  HoopVote.wireSignOut();
  const { sb, $, esc, initials } = HoopVote;
  async function invite() {
    const { data, error } = await sb.rpc('admin_get_invite');
    if (error) throw error;
    const token = data?.[0]?.invite_token || '';
    $('#inviteLink').value =
      `${location.origin}${location.pathname.replace('admin.html', 'index.html')}?invite=${token}`;
  }
  async function players() {
    const { data } = await sb
      .from('profiles')
      .select('id,display_name,avatar_path,status')
      .eq('team_id', p.team_id)
      .eq('status', 'approved')
      .order('display_name');
    $('#attendance').innerHTML = (data || [])
      .map(
        x =>
          `<div class="admin-row"><div class="avatar">${initials(x.display_name)}</div><div><strong>${esc(x.display_name)}</strong><div class="muted small">Aktiver Spieler</div></div><label class="check"><input type="checkbox" class="attendee" value="${x.id}"> Anwesend</label></div>`,
      )
      .join('');
  }
  async function pending() {
    const { data } = await sb
      .from('profiles')
      .select('id,display_name,avatar_path,created_at')
      .eq('team_id', p.team_id)
      .eq('status', 'pending')
      .order('created_at');
    $('#pendingList').innerHTML =
      (data || [])
        .map(
          x =>
            `<div class="admin-row"><div class="avatar">${initials(x.display_name)}</div><div><strong>${esc(x.display_name)}</strong><div class="muted small">Registriert ${HoopVote.fmtDate(x.created_at)}</div></div><div class="actions" style="margin:0"><button class="btn primary approve" data-id="${x.id}">Freigeben</button><button class="btn secondary reject" data-id="${x.id}">Ablehnen</button></div></div>`,
        )
        .join('') || '<p class="muted">Keine offenen Registrierungen.</p>';
    document.querySelectorAll('.approve').forEach(b => (b.onclick = () => setProfile(b.dataset.id, true)));
    document.querySelectorAll('.reject').forEach(b => (b.onclick = () => setProfile(b.dataset.id, false)));
  }
  async function setProfile(id, ok) {
    const { error } = await sb.rpc('admin_set_profile_status', { p_profile_id: id, p_approve: ok });
    if (error) return alert(error.message);
    await Promise.all([pending(), players()]);
  }
  async function seasons() {
    const { data } = await sb
      .from('seasons')
      .select('*')
      .eq('team_id', p.team_id)
      .order('created_at', { ascending: false });
    const rows = [];
    for (const s of data || []) {
      let rating = '';
      if (s.status === 'active' && ['start', 'final'].includes(s.rating_stage)) {
        const { data: rp } = await sb.rpc('admin_rating_progress', { p_season_id: s.id });
        const r = rp?.[0];
        if (r) rating = ` · Ratings ${r.submitted_count}/${r.required_count}`;
      }
      const status =
        s.status === 'active'
          ? s.rating_stage === 'final'
            ? 'Abschlussratings offen'
            : 'Aktiv'
          : s.status === 'closed'
            ? 'Abgeschlossen'
            : 'Entwurf';
      const button =
        s.status === 'active'
          ? `<button class="btn secondary closeSeason" data-id="${s.id}" data-stage="${s.rating_stage}">${s.rating_stage === 'final' ? 'Saison definitiv abschliessen' : 'Abschlussratings starten'}</button>`
          : '';
      rows.push(
        `<div class="leader"><div><strong>${esc(s.name)}</strong><div class="muted small">${status}${rating}</div></div><div class="actions" style="margin:0">${button}</div></div>`,
      );
    }
    $('#seasonList').innerHTML = rows.join('') || '<p class="muted">Noch keine Saison angelegt.</p>';
    document.querySelectorAll('.closeSeason').forEach(
      b =>
        (b.onclick = async () => {
          const final = b.dataset.stage === 'final';
          if (
            !confirm(
              final
                ? 'Saison endgültig abschliessen? Alle Abschlussratings müssen fertig sein.'
                : 'Abschlussratings starten? Danach müssen alle Spieler erneut alle Mitspieler bewerten.',
            )
          )
            return;
          const { error } = await sb.rpc('admin_close_season', { p_season_id: b.dataset.id });
          if (error) return alert(error.message);
          if (!final) {
            alert(
              'Abschlussratings sind jetzt geöffnet. Du wirst ebenfalls zuerst deine Ratings abschliessen müssen.',
            );
            location.href = 'ratings.html';
            return;
          }
          seasons();
        }),
    );
  }
  async function sessions() {
    await sb.rpc('open_session_progress');
    const { data } = await sb
      .from('sessions')
      .select('id,title,status,started_at,ends_at,closed_at')
      .eq('team_id', p.team_id)
      .order('started_at', { ascending: false })
      .limit(20);
    $('#sessionList').innerHTML =
      (data || [])
        .map(
          s =>
            `<div class="leader"><div><strong>${esc(s.title)}</strong><div class="muted small">${s.status} · Start ${HoopVote.fmtDate(s.started_at)} · Ende ${HoopVote.fmtDate(s.ends_at)}</div></div><div class="actions" style="margin:0">${s.status === 'open' ? `<button class="btn danger cancelSession" data-id="${s.id}">Abbrechen</button>` : ''}</div></div>`,
        )
        .join('') || '<p class="muted">Noch keine Sessions.</p>';
    document.querySelectorAll('.cancelSession').forEach(
      b =>
        (b.onclick = async () => {
          if (!confirm('Session abbrechen? Eingegangene Stimmen werden nicht gewertet.')) return;
          const { error } = await sb.rpc('admin_cancel_session', { p_session_id: b.dataset.id });
          if (error) alert(error.message);
          else sessions();
        }),
    );
  }
  $('#copyInvite').onclick = () => navigator.clipboard.writeText($('#inviteLink').value);
  $('#rotateInvite').onclick = async () => {
    if (!confirm('Der bisherige Einladungslink wird ungültig. Fortfahren?')) return;
    const { error } = await sb.rpc('admin_rotate_invite');
    if (error) alert(error.message);
    else invite();
  };
  $('#createSeason').onclick = async () => {
    const name = $('#seasonName').value.trim();
    if (!name) return;
    const { error } = await sb.rpc('admin_create_season', { p_name: name });
    if (error) alert(error.message);
    else {
      $('#seasonName').value = '';
      seasons();
    }
  };
  $('#openSession').onclick = async () => {
    const title = $('#sessionTitle').value.trim(),
      ids = [...document.querySelectorAll('.attendee:checked')].map(x => x.value);
    if (!title || ids.length < 4) return alert('Bitte Titel und mindestens vier anwesende Spieler wählen.');
    const { error } = await sb.rpc('admin_create_session', { p_title: title, p_attendees: ids });
    if (error) alert(error.message);
    else {
      alert('Abstimmung eröffnet. Die 48 Stunden laufen ab jetzt.');
      $('#sessionTitle').value = '';
      document.querySelectorAll('.attendee').forEach(x => (x.checked = false));
      sessions();
    }
  };
  await Promise.all([invite(), players(), pending(), seasons(), sessions()]);
});
