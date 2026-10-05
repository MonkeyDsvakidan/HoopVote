window.addEventListener('DOMContentLoaded', async () => {
  const p = await HoopVote.guard();
  HoopVote.wireSignOut();
  const { sb, $, $$, esc, avatarHtml } = HoopVote;
  const { data: sessions, error } = await sb.rpc('current_vote_session');
  if (error) throw error;
  if (!sessions?.length) {
    $('#noSession').style.display = 'block';
    return;
  }
  const s = sessions[0];
  $('#session').style.display = 'block';
  $('#sessionTitle').textContent = s.title;
  $('#deadline').textContent = `Schliesst spätestens am ${HoopVote.fmtDate(s.ends_at)}`;
  $('#eligibleCount').textContent = s.eligible_count;
  $('#submittedCount').textContent = s.submitted_count;
  $('#progressPill').textContent = `${s.submitted_count}/${s.eligible_count} abgestimmt`;
  if (s.has_submitted) {
    $('#receiptNotice').textContent = 'Du hast für diese Session bereits abgestimmt.';
    $('#submitVote').disabled = true;
  }
  const [{ data: cats }, { data: candidates }] = await Promise.all([
    sb.from('categories').select('id,name').eq('team_id', p.team_id).eq('active', true).order('sort_order'),
    sb.rpc('eligible_candidates', { p_session_id: s.id }),
  ]);
  let active = 0;
  const selections = Object.fromEntries(cats.map(c => [c.id, []]));
  function drawTabs() {
    $('#categoryTabs').innerHTML = cats
      .map(
        (c, i) =>
          `<button class="tab ${i === active ? 'active' : ''}" data-i="${i}">${esc(c.name)} <span class="muted small">${selections[c.id].length}/3</span></button>`,
      )
      .join('');
    $$('[data-i]').forEach(
      b =>
        (b.onclick = () => {
          active = +b.dataset.i;
          drawTabs();
          drawRanking();
        }),
    );
  }
  function drawRanking() {
    const c = cats[active],
      sel = selections[c.id],
      pool = [
        ...sel.map(id => candidates.find(x => x.profile_id === id)).filter(Boolean),
        ...candidates.filter(x => !sel.includes(x.profile_id)),
      ];
    $('#ranking').innerHTML = pool
      .map(x => {
        const r = sel.indexOf(x.profile_id) + 1,
          a = r > 0;
        const av = avatarHtml(x.display_name, x.avatar_path, 'avatar-img-34');
        return `<div class="rank-row" data-player="${x.profile_id}"><div class="rank-badge">${a ? r : '–'}</div><div class="player">${av}<div><strong>${esc(x.display_name)}</strong><div class="muted small">${a ? [3, 2, 1][r - 1] + ' Punkte' : 'Antippen zum Rangieren'}</div></div></div><span class="muted">${a ? '✓' : '+'}</span></div>`;
      })
      .join('');
    $$('[data-player]').forEach(
      row =>
        (row.onclick = () => {
          const id = row.dataset.player,
            arr = selections[c.id],
            idx = arr.indexOf(id);
          if (idx >= 0) arr.splice(idx, 1);
          else if (arr.length < 3) arr.push(id);
          drawTabs();
          drawRanking();
          updateStatus();
        }),
    );
  }
  function updateStatus() {
    const done = cats.filter(c => selections[c.id].length === 3).length;
    $('#voteStatus').textContent = `${done}/${cats.length} Kategorien vollständig.`;
    $('#submitVote').disabled = s.has_submitted || done !== cats.length;
  }
  $('#resetVote').onclick = () => {
    cats.forEach(c => (selections[c.id] = []));
    drawTabs();
    drawRanking();
    updateStatus();
  };
  $('#submitVote').onclick = async () => {
    const ballot = {};
    cats.forEach(c => (ballot[c.id] = selections[c.id]));
    $('#submitVote').disabled = true;
    const { error } = await sb.rpc('cast_ballot', { p_session_id: s.id, p_ballot: ballot });
    if (error) {
      alert(error.message);
      updateStatus();
      return;
    }
    location.reload();
  };
  function tick() {
    const now = Date.now(),
      end = new Date(s.ends_at).getTime(),
      start = new Date(s.started_at).getTime(),
      left = Math.max(0, Math.floor((end - now) / 1000)),
      dur = Math.max(1, Math.floor((end - start) / 1000));
    const h = String(Math.floor(left / 3600)).padStart(2, '0'),
      m = String(Math.floor((left % 3600) / 60)).padStart(2, '0'),
      sec = String(left % 60).padStart(2, '0');
    $('#countdown').textContent = `${h}:${m}:${sec}`;
    $('#bar').style.width = `${Math.max(0, Math.min(100, (left / dur) * 100))}%`;
    if (left <= 0) location.reload();
  }
  drawTabs();
  drawRanking();
  updateStatus();
  tick();
  setInterval(tick, 1000);
});
