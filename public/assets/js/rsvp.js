function showStatus(message, type = 'info') {
  const status = document.getElementById('rsvp-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status show ${type}`;
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const rsvpForm = document.getElementById('rsvp-form');
if (rsvpForm) {
  rsvpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = rsvpForm.querySelector('button[type="submit"]');
    const formData = new FormData(rsvpForm);
    const payload = {
      fullName: String(formData.get('fullName') || '').trim(),
      email: normaliseEmail(formData.get('email')),
      attending: String(formData.get('attending') || '').trim(),
      songRequest: String(formData.get('songRequest') || '').trim(),
      message: String(formData.get('message') || '').trim()
    };

    if (!payload.fullName || !payload.email || !payload.attending) {
      showStatus('Vul asseblief jou naam, e-posadres en bywoon-keuse in.', 'error');
      return;
    }

    submitBtn.disabled = true;
    showStatus('Besig om jou RSVP te stoor...', 'info');

    try {
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'RSVP kon nie gestoor word nie.');
      showStatus('Dankie! Jou RSVP is gestoor. Ons waardeer dit baie.', 'success');
      rsvpForm.reset();
    } catch (error) {
      showStatus(error.message || 'Jammer, iets het fout gegaan. Probeer asseblief weer.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}
