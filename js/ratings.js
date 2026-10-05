window.addEventListener('DOMContentLoaded', async () => {
  const p = await HoopVote.guard({ skipRatings: true });
  HoopVote.wireSignOut();
  const { sb, $, esc, initials, avatarUrl } = HoopVote;
  const skills = [
    ['shooting', 'Werfen', 'Distanzwurf, Midrange und Wurfkonstanz'],
    ['layups', 'Korbleger', 'Finishing am Korb und Abschluss unter Druck'],
    ['ballhandling', 'Ballhandling', 'Dribbling und Ballkontrolle'],
    ['passing', 'Passen', 'Passqualität, Übersicht und Entscheidungen'],
    ['defense', 'Defense', 'On-Ball- und Team-Defense'],
    ['rebounding', 'Rebounding', 'Offensiv- und Defensiv-Rebounds'],
    ['conditioning', 'Kondition', 'Ausdauer und Leistungsfähigkeit'],
    ['basketball_iq', 'Basketball-IQ', 'Positionierung und Spielverständnis'],
    ['teamplay', 'Teamplay', 'Kommunikation, Zusammenspiel und Uneigennützigkeit'],
  ];
  let status = null,
    targets = [];
  async function load() {
    const { data: s, error } = await sb.rpc('current_rating_status');
    if (error) throw error;
    status = s?.[0] || null;
    if (!status || Number(status.missing_count) === 0) {
      $('#ratingCard').style.display = 'none';
      $('#doneCard').style.display = 'block';
      $('#progressText').textContent = '100%';
      $('#progressBar').style.width = '100%';
      $('#phaseText').textContent =
        status?.phase === 'final' ? 'Abschlussratings beendet' : 'Alle aktuellen Ratings erledigt';
      return;
    }
    const { data: t, error: te } = await sb.rpc('pending_rating_targets');
    if (te) throw te;
    targets = t || [];
    const done = Number(status.total_targets) - Number(status.missing_count),
      pct = status.total_targets ? Math.round((done / Number(status.total_targets)) * 100) : 100;
    $('#progressText').textContent = `${done}/${status.total_targets}`;
    $('#progressBar').style.width = `${pct}%`;
    $('#phaseText').textContent =
      status.phase === 'final'
        ? `${esc(status.season_name)} · Abschlussratings`
        : `${esc(status.season_name)} · Startratings`;
    $('#title').textContent =
      status.phase === 'final' ? 'Abschlussratings der Saison' : 'Startratings der Saison';
    drawTarget();
  }
  function drawTarget() {
    const x = targets[0];
    if (!x) {
      load();
      return;
    }
    $('#ratingCard').style.display = 'block';
    $('#targetName').textContent = x.display_name;
    if (x.avatar_path) {
      $('#targetAvatar').src = avatarUrl(x.avatar_path);
      $('#targetAvatar').style.display = 'block';
    } else {
      $('#targetAvatar').style.display = 'none';
    }
    $('#ratingGrid').innerHTML = skills
      .map(
        ([key, label, help]) =>
          `<div class="skill-rating"><div><strong>${label}</strong><div class="muted small">${help}</div></div><div class="rating-input"><input type="range" min="1" max="10" value="5" name="${key}" id="${key}"><b data-value="${key}">5</b></div></div>`,
      )
      .join('');
    skills.forEach(([key]) => {
      $(`#${key}`).oninput = e =>
        (document.querySelector(`[data-value="${key}"]`).textContent = e.target.value);
    });
  }
  $('#ratingForm').onsubmit = async e => {
    e.preventDefault();
    const x = targets[0];
    if (!x) return;
    const btn = e.submitter;
    btn.disabled = true;
    $('#ratingMsg').textContent = 'Bewertung wird gespeichert…';
    const args = { p_target_profile_id: x.profile_id };
    skills.forEach(([key]) => (args[`p_${key}`] = Number($(`#${key}`).value)));
    const { error } = await sb.rpc('submit_skill_rating', args);
    if (error) {
      btn.disabled = false;
      $('#ratingMsg').textContent = error.message;
      return;
    }
    targets.shift();
    $('#ratingMsg').textContent = 'Gespeichert. Diese Bewertung ist jetzt abgeschlossen.';
    setTimeout(load, 350);
  };
  await load();
});
