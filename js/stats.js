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
  const fmtDay = v => new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium' }).format(new Date(v));
  // Trainings der gewählten Saison, deren Resultate schon sichtbar sind (abgeschlossen oder abgelaufen)
  async function loadSessions() {
    const seasonId = $('#seasonSelect').value;
    const { data } = seasonId
      ? await sb
          .from('sessions')
          .select('id,title,status,started_at,ends_at')
          .eq('team_id', p.team_id)
          .eq('season_id', seasonId)
          .order('started_at', { ascending: false })
      : { data: [] };
    const visible = (data || []).filter(
      s => s.status === 'closed' || (s.status === 'open' && new Date(s.ends_at) <= new Date()),
    );
    $('#sessionSelect').innerHTML =
      visible
        .map(s => `<option value="${s.id}">${esc(s.title)} · ${fmtDay(s.started_at)}</option>`)
        .join('') || '<option value="">Noch keine abgeschlossenen Trainings</option>';
  }
  // Resultate eines Trainings in dieselbe Form bringen wie leaderboard / category_leaderboard / stats_summary
  async function sessionData(sessionId) {
    if (!sessionId)
      return {
        rows: [],
        cats: [],
        summary: [{ session_count: 0, avg_participation: null, total_points: 0 }],
      };
    const [{ data: res, error }, { data: part }] = await Promise.all([
      sb.rpc('session_results', { p_session_id: sessionId }),
      sb.rpc('session_participation'),
    ]);
    if (error) return { error };
    const byPlayer = {};
    (res || []).forEach(x => {
      const r = (byPlayer[x.profile_id] ||= { ...x, points: 0, first_places: 0 });
      r.points += Number(x.points);
      r.first_places += Number(x.first_places);
    });
    const rows = Object.values(byPlayer).sort(
      (a, b) =>
        b.points - a.points ||
        b.first_places - a.first_places ||
        a.display_name.localeCompare(b.display_name),
    );
    const c = (part || []).find(x => x.session_id === sessionId);
    const total = rows.reduce((n, x) => n + x.points, 0);
    return {
      rows,
      cats: res || [],
      summary: [
        {
          session_count: rows.length ? 1 : 0,
          avg_participation:
            c && Number(c.eligible_count) ? (c.submitted_count / c.eligible_count) * 100 : null,
          total_points: total,
        },
      ],
    };
  }
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
    const results =
      scope === 'session'
        ? sessionData($('#sessionSelect').value)
        : Promise.all([
            sb.rpc('leaderboard', range),
            sb.rpc('category_leaderboard', range),
            sb.rpc('stats_summary', range),
          ]).then(([l, c, s]) => ({ error: l.error, rows: l.data, cats: c.data, summary: s.data }));
    const [{ rows, cats, summary, error }, { data: skillRows }, { data: open }] = await Promise.all([
      results,
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
    $('#leaderLabel').textContent =
      scope === 'month' ? 'Monats-Leader' : scope === 'session' ? 'Training-Leader' : 'Saison-Leader';
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
  // Aktiven Tab markieren, die anderen zurücksetzen, neu laden.
  function switchTab(on, ...off) {
    $(on).classList.add('active');
    off.forEach(o => $(o).classList.remove('active'));
    load();
  }
  function setScope(s) {
    scope = s;
    $('#sessionField').style.display = s === 'session' ? 'block' : 'none';
    const tabs = { month: '#monthTab', season: '#seasonTab', session: '#sessionTab' };
    switchTab(tabs[s], ...Object.values(tabs).filter(t => t !== tabs[s]));
  }
  $('#monthTab').onclick = () => setScope('month');
  $('#seasonTab').onclick = () => setScope('season');
  $('#sessionTab').onclick = () => setScope('session');
  $('#startRatingTab').onclick = () => {
    ratingPhase = 'start';
    switchTab('#startRatingTab', '#finalRatingTab');
  };
  $('#finalRatingTab').onclick = () => {
    ratingPhase = 'final';
    switchTab('#finalRatingTab', '#startRatingTab');
  };
  $('#seasonSelect').onchange = async () => {
    await loadSessions();
    load();
  };
  $('#sessionSelect').onchange = load;
  await loadSessions();
  load();
});
