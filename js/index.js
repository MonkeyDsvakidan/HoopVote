window.addEventListener('DOMContentLoaded', async () => {
  if (!HoopVote.configured) return HoopVote.showConfigError?.();
  const { $, $$, sb, sessionUser, profile, uploadAvatar } = HoopVote;
  const params = new URLSearchParams(location.search),
    invite = params.get('invite');
  if (invite) localStorage.setItem('hoopvote_invite', invite);
  const savedInvite = invite || localStorage.getItem('hoopvote_invite') || '';
  const redirectUrl = `${location.origin}${location.pathname}${savedInvite ? `?invite=${encodeURIComponent(savedInvite)}` : ''}`;
  const savedPendingEmail = localStorage.getItem('hoopvote_pending_email') || '';
  if ($('#resendEmail')) $('#resendEmail').value = savedPendingEmail;
  const user = await sessionUser();
  if (user) {
    let p = null;
    try {
      p = await profile();
    } catch (e) {}
    if (p?.status === 'approved') {
      location.href = p.role === 'admin' ? 'admin.html' : 'vote.html';
      return;
    }
    if (p) {
      $('#authCard').style.display = 'none';
      $('#pending').style.display = 'block';
      HoopVote.wireSignOut();
      return;
    }
    $('#authCard').style.display = 'none';
    if (params.get('setup') === '1') {
      $('#bootstrap').style.display = 'block';
    } else {
      $('#onboarding').style.display = 'block';
      $('#inviteToken').value = savedInvite;
    }
  }
  $$('[data-mode]').forEach(
    b =>
      (b.onclick = () => {
        $$('[data-mode]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        $('#loginForm').style.display = b.dataset.mode === 'login' ? '' : 'none';
        $('#signupForm').style.display = b.dataset.mode === 'signup' ? '' : 'none';
      }),
  );
  $('#backToLogin')?.addEventListener('click', () => {
    $('#verifyEmail').style.display = 'none';
    $('#authCard').style.display = 'block';
    $$('[data-mode]').forEach(x => x.classList.remove('active'));
    $('[data-mode="login"]').classList.add('active');
    $('#loginForm').style.display = '';
    $('#signupForm').style.display = 'none';
  });
  $('#resendConfirmation')?.addEventListener('click', async () => {
    const email = $('#resendEmail').value.trim();
    $('#verifyMsg').textContent = '';
    if (!email) return ($('#verifyMsg').textContent = 'Bitte gib deine E-Mail-Adresse ein.');
    const { error } = await sb.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectUrl },
    });
    if (error) return ($('#verifyMsg').textContent = error.message);
    localStorage.setItem('hoopvote_pending_email', email);
    $('#verifyMsg').textContent = 'Neue Bestätigungs-Mail gesendet. Bitte verwende den neuesten Link.';
  });
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    $('#authMsg').textContent = '';
    const { error } = await sb.auth.signInWithPassword({
      email: $('#loginEmail').value,
      password: $('#loginPassword').value,
    });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('email not confirmed')) {
        $('#authCard').style.display = 'none';
        $('#verifyEmail').style.display = 'block';
        $('#resendEmail').value = $('#loginEmail').value;
        localStorage.setItem('hoopvote_pending_email', $('#loginEmail').value);
        $('#verifyMsg').textContent =
          'Deine E-Mail ist noch nicht bestätigt. Du kannst dir hier eine neue Bestätigungs-Mail senden.';
        return;
      }
      $('#authMsg').textContent = error.message;
      return;
    }
    localStorage.removeItem('hoopvote_pending_email');
    location.reload();
  };
  $('#signupForm').onsubmit = async e => {
    e.preventDefault();
    $('#authMsg').textContent = '';
    const email = $('#signupEmail').value.trim();
    const { data, error } = await sb.auth.signUp({
      email,
      password: $('#signupPassword').value,
      options: { emailRedirectTo: redirectUrl },
    });
    if (error) return ($('#authMsg').textContent = error.message);
    localStorage.setItem('hoopvote_pending_email', email);
    if (data.session) {
      localStorage.removeItem('hoopvote_pending_email');
      location.reload();
    } else {
      $('#authCard').style.display = 'none';
      $('#verifyEmail').style.display = 'block';
      $('#resendEmail').value = email;
    }
  };
  $('#joinForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const u = await sessionUser();
    try {
      $('#joinMsg').style.display = 'block';
      $('#joinMsg').textContent = 'Profil wird erstellt…';
      const path = await uploadAvatar($('#avatar').files[0], u.id);
      const { error } = await sb.rpc('join_team', {
        p_invite_token: $('#inviteToken').value.trim(),
        p_display_name: $('#displayName').value.trim(),
        p_avatar_path: path,
      });
      if (error) throw error;
      localStorage.removeItem('hoopvote_invite');
      localStorage.removeItem('hoopvote_pending_email');
      location.href = 'index.html?pending=1';
    } catch (err) {
      $('#joinMsg').textContent = err.message;
    }
  });
  $('#bootstrapForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const u = await sessionUser();
    try {
      $('#bootstrapMsg').style.display = 'block';
      $('#bootstrapMsg').textContent = 'Team wird erstellt…';
      const path = await uploadAvatar($('#adminAvatar').files[0], u.id);
      const { error } = await sb.rpc('bootstrap_first_admin', {
        p_team_name: $('#teamName').value.trim(),
        p_display_name: $('#adminName').value.trim(),
        p_avatar_path: path,
      });
      if (error) throw error;
      location.href = 'admin.html';
    } catch (err) {
      $('#bootstrapMsg').textContent = err.message;
    }
  });
});
