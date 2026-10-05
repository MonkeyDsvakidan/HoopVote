window.addEventListener('DOMContentLoaded', async () => {
  const p = await HoopVote.guard();
  HoopVote.wireSignOut();
  const { sb, $, esc, avatarHtml } = HoopVote;
  const { data: seasons } = await sb
    .from('seasons')
    .select('id,name,status,starts_at,ends_at')
    .eq('team_id', p.team_id)
    .order('created_at', { ascending: false });
  $('#seasonSelect').innerHTML = (seasons || [])
    .map(
      s =>
        `<option value="${s.id}" ${s.status === 'active' ? 'selected' : ''}>${esc(s.name)}${s.status === 'active' ? ' · aktiv' : ''}</option>`,
    )
    .join('');
  let scope = 'month',
    ratingPhase = 'start';
  async function load() {
    const seasonId = $('#seasonSelect').value;
    if (!seasonId) {
      // Noch keine Saison: Ladeplatzhalter entfernen
      ['#leaderboard', '#categories', '#skillRatings'].forEach(id => ($(id).innerHTML = ''));
      $('#heroLeader').innerHTML = '<span class="muted">Noch keine Resultate.</span>';
      return;
    }
    const monthStart =
      scope === 'month'
        ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
        : null;
    const range = { p_season_id: seasonId, p_month_start: monthStart };
    const [{ data: rows, error }, { data: cats }, { data: summary }, { data: skillRows }, { data: open }] =
      await Promise.all([
        sb.rpc('leaderboard', range),
        sb.rpc('category_leaderboard', range),
        sb.rpc('stats_summary', range),
        sb.rpc('skill_rating_summary', { p_season_id: seasonId, p_phase: ratingPhase }),
        sb.rpc('open_session_progress'),
      ]);
    if (error) throw error;
    const sum = summary?.[0] || {};
    $('#statSessions').textContent = sum.session_count || 0;
    $('#statParticipation').textContent =
      sum.avg_participation == null ? '–' : `${Math.round(sum.avg_participation)}%`;
    $('#statPlayers').textContent = rows?.length || 0;
    $('#statPoints').textContent = sum.total_points || 0;
    $('#leaderLabel').textContent = scope === 'month' ? 'Monats-Leader' : 'Saison-Leader';
    if (rows?.length) {
      const x = rows[0],
        av = avatarHtml(x.display_name, x.avatar_path, 'avatar-img-42');
      $('#heroLeader').innerHTML =
        `${av}<div><strong>${esc(x.display_name)}</strong><div class="muted small">${x.first_places || 0}× Platz 1</div></div><div class="score">${x.points} P</div>`;
    } else $('#heroLeader').innerHTML = '<span class="muted">Noch keine Resultate.</span>';
    $('#leaderboard').innerHTML =
      (rows || [])
        .map(
          (x, i) =>
            `<div class="leader"><div class="pos${i < 3 ? ` top-${i + 1}` : ''}">#${i + 1}</div>${avatarHtml(x.display_name, x.avatar_path, 'avatar-img-38')}<div><strong>${esc(x.display_name)}</strong><div class="muted small">${x.first_places || 0}× Platz 1</div></div><div class="score">${x.points} P</div></div>`,
        )
        .join('') || '<p class="muted">Noch keine abgeschlossenen Sessions.</p>';
    const best = {};
    (cats || []).forEach(x => {
      if (!best[x.category_id]) best[x.category_id] = x;
    });
    $('#categories').innerHTML =
      Object.values(best)
        .map(
          x =>
            `<div class="leader"><div><strong>${esc(x.category_name)}</strong><div class="muted small">${esc(x.display_name)}</div></div><div class="score">${x.points} P</div></div>`,
        )
        .join('') || '<p class="muted">Noch keine Kategorien-Auswertung.</p>';
    const labels = [
      ['shooting', 'Werfen'],
      ['layups', 'Korbleger'],
      ['ballhandling', 'Ballhandling'],
      ['passing', 'Passen'],
      ['defense', 'Defense'],
      ['rebounding', 'Rebounding'],
      ['conditioning', 'Kondition'],
      ['basketball_iq', 'Basketball-IQ'],
      ['teamplay', 'Teamplay'],
    ];
    $('#skillRatings').innerHTML =
      (skillRows || [])
        .map(x => {
          const enough = Number(x.rating_count) >= 3;
          const skills = enough
            ? labels
                .map(([k, l]) => `<div class="skill-chip"><span>${l}</span><b>${x[k] ?? '–'}</b></div>`)
                .join('')
            : `<div class="notice mt-8">Noch nicht sichtbar – mindestens 3 Bewertungen erforderlich (${x.rating_count}/3).</div>`;
          return `<div class="player-rating-card"><div class="player-head compact">${avatarHtml(x.display_name, x.avatar_path, 'avatar-img-38')}<div><strong>${esc(x.display_name)}</strong><div class="muted small">${x.rating_count} Bewertungen</div></div></div><div class="skill-chips">${skills}</div></div>`;
        })
        .join('') || '<p class="muted">Noch keine Ratings vorhanden.</p>';
    if (open?.length) {
      $('#openNotice').style.display = 'block';
      $('#openNotice').textContent =
        `Offene Session: ${open[0].submitted_count}/${open[0].eligible_count} abgestimmt. Keine Zwischenstände sichtbar.`;
    } else $('#openNotice').style.display = 'none';
  }
  // Aktiven Tab markieren, den anderen zurücksetzen, neu laden.
  function switchTab(on, off) {
    $(on).classList.add('active');
    $(off).classList.remove('active');
    load();
  }
  $('#monthTab').onclick = () => {
    scope = 'month';
    switchTab('#monthTab', '#seasonTab');
  };
  $('#seasonTab').onclick = () => {
    scope = 'season';
    switchTab('#seasonTab', '#monthTab');
  };
  $('#startRatingTab').onclick = () => {
    ratingPhase = 'start';
    switchTab('#startRatingTab', '#finalRatingTab');
  };
  $('#finalRatingTab').onclick = () => {
    ratingPhase = 'final';
    switchTab('#finalRatingTab', '#startRatingTab');
  };
  $('#seasonSelect').onchange = load;
  load();
});
