window.addEventListener('DOMContentLoaded', async () => {
  const p = await HoopVote.guard();
  HoopVote.wireSignOut();
  const { sb, $, esc, initials, avatarUrl } = HoopVote;
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
    if (!seasonId) return;
    const monthStart =
      scope === 'month'
        ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
        : null;
    const { data: rows, error } = await sb.rpc('leaderboard', {
      p_season_id: seasonId,
      p_month_start: monthStart,
    });
    if (error) throw error;
    const { data: cats } = await sb.rpc('category_leaderboard', {
      p_season_id: seasonId,
      p_month_start: monthStart,
    });
    const { data: summary } = await sb.rpc('stats_summary', {
      p_season_id: seasonId,
      p_month_start: monthStart,
    });
    const sum = summary?.[0] || {};
    $('#statSessions').textContent = sum.session_count || 0;
    $('#statParticipation').textContent =
      sum.avg_participation == null ? '–' : `${Math.round(sum.avg_participation)}%`;
    $('#statPlayers').textContent = rows?.length || 0;
    $('#statPoints').textContent = sum.total_points || 0;
    $('#leaderLabel').textContent = scope === 'month' ? 'Monats-Leader' : 'Saison-Leader';
    if (rows?.length) {
      const x = rows[0],
        av = x.avatar_path
          ? `<img src="${esc(avatarUrl(x.avatar_path))}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:50%">`
          : `<div class="avatar">${initials(x.display_name)}</div>`;
      $('#heroLeader').innerHTML =
        `${av}<div><strong>${esc(x.display_name)}</strong><div class="muted small">${x.first_places || 0}× Platz 1</div></div><div class="score">${x.points} P</div>`;
    } else $('#heroLeader').innerHTML = '<span class="muted">Noch keine Resultate.</span>';
    $('#leaderboard').innerHTML =
      (rows || [])
        .map(
          (x, i) =>
            `<div class="leader"><div class="pos">#${i + 1}</div><div class="avatar">${initials(x.display_name)}</div><div><strong>${esc(x.display_name)}</strong><div class="muted small">${x.first_places || 0}× Platz 1</div></div><div class="score">${x.points} P</div></div>`,
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
    const { data: skillRows } = await sb.rpc('skill_rating_summary', {
      p_season_id: seasonId,
      p_phase: ratingPhase,
    });
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
            : `<div class="notice" style="margin-top:8px">Noch nicht sichtbar – mindestens 3 Bewertungen erforderlich (${x.rating_count}/3).</div>`;
          return `<div class="player-rating-card"><div class="player-head compact"><div class="avatar">${initials(x.display_name)}</div><div><strong>${esc(x.display_name)}</strong><div class="muted small">${x.rating_count} Bewertungen</div></div></div><div class="skill-chips">${skills}</div></div>`;
        })
        .join('') || '<p class="muted">Noch keine Ratings vorhanden.</p>';
    const { data: open } = await sb.rpc('open_session_progress');
    if (open?.length) {
      $('#openNotice').style.display = 'block';
      $('#openNotice').textContent =
        `Offene Session: ${open[0].submitted_count}/${open[0].eligible_count} abgestimmt. Keine Zwischenstände sichtbar.`;
    } else $('#openNotice').style.display = 'none';
  }
  $('#monthTab').onclick = () => {
    scope = 'month';
    $('#monthTab').classList.add('active');
    $('#seasonTab').classList.remove('active');
    load();
  };
  $('#seasonTab').onclick = () => {
    scope = 'season';
    $('#seasonTab').classList.add('active');
    $('#monthTab').classList.remove('active');
    load();
  };
  $('#startRatingTab').onclick = () => {
    ratingPhase = 'start';
    $('#startRatingTab').classList.add('active');
    $('#finalRatingTab').classList.remove('active');
    load();
  };
  $('#finalRatingTab').onclick = () => {
    ratingPhase = 'final';
    $('#finalRatingTab').classList.add('active');
    $('#startRatingTab').classList.remove('active');
    load();
  };
  $('#seasonSelect').onchange = load;
  load();
});
