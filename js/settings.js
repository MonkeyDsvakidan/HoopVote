window.addEventListener('DOMContentLoaded', async () => {
  const p = await HoopVote.guard({ allowPending: true });
  HoopVote.wireSignOut();
  const { sb, $, avatarUrl, uploadAvatar, sessionUser } = HoopVote;
  const user = await sessionUser();
  $('#currentName').textContent = p.display_name || '–';
  $('#currentEmail').textContent = user?.email || '–';
  $('#displayName').value = p.display_name || '';
  if (p.avatar_path) $('#avatarPreview').src = avatarUrl(p.avatar_path);
  else $('#avatarPreview').style.display = 'none';
  $('#profileForm').onsubmit = async e => {
    e.preventDefault();
    const msg = $('#profileMsg');
    msg.style.display = 'block';
    msg.textContent = 'Profil wird gespeichert…';
    try {
      let path = null;
      const file = $('#avatarFile').files[0];
      if (file) path = await uploadAvatar(file, user.id);
      const { error } = await sb.rpc('update_my_profile', {
        p_display_name: $('#displayName').value.trim(),
        p_avatar_path: path,
      });
      if (error) throw error;
      msg.textContent = 'Profil gespeichert.';
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      msg.textContent = err.message;
    }
  };
  $('#passwordForm').onsubmit = async e => {
    e.preventDefault();
    const msg = $('#passwordMsg'),
      a = $('#newPassword').value,
      b = $('#newPassword2').value;
    msg.style.display = 'block';
    if (a !== b) {
      msg.textContent = 'Die Passwörter stimmen nicht überein.';
      return;
    }
    if (a.length < 8) {
      msg.textContent = 'Das Passwort muss mindestens 8 Zeichen lang sein.';
      return;
    }
    msg.textContent = 'Passwort wird geändert…';
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) {
      msg.textContent = error.message;
      return;
    }
    $('#passwordForm').reset();
    msg.textContent = 'Passwort erfolgreich geändert.';
  };
});
