const adminState = {
  password: sessionStorage.getItem('adminPassword') || '',
  report: null
};

function adminStatus(message, type = 'info') {
  const status = document.getElementById('admin-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status show ${type}`;
}

function getPassword() {
  const input = document.getElementById('admin-password');
  return String(input?.value || adminState.password || '').trim();
}

async function adminFetch(url, options = {}) {
  const password = getPassword();
  const headers = new Headers(options.headers || {});
  headers.set('X-Admin-Password', password);
  const response = await fetch(url, { ...options, headers });
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const result = isJson ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) throw new Error(result.error || 'Aksie kon nie voltooi word nie.');
  return result;
}

function showAdminApp() {
  document.getElementById('admin-login-card')?.style.setProperty('display', 'none');
  document.getElementById('admin-app')?.style.setProperty('display', 'grid');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('af-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function renderStats(report) {
  const stats = report.stats || {};
  document.getElementById('stat-total').textContent = stats.totalRsvps ?? 0;
  document.getElementById('stat-yes').textContent = stats.attending ?? 0;
  document.getElementById('stat-no').textContent = stats.notAttending ?? 0;
  document.getElementById('stat-media').textContent = stats.mediaItems ?? 0;
}

function formatStorage(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function renderStorage(storage = {}) {
  document.getElementById('storage-upload-status').textContent = storage.uploadsEnabled ? 'Aktief' : 'Gesluit';
  document.getElementById('storage-media-items').textContent = `${storage.mediaItems ?? 0} / ${storage.mediaItemCap ?? 5000}`;
  document.getElementById('storage-used').textContent = formatStorage(storage.usedBytes);
  document.getElementById('storage-cap').textContent = `${storage.storageCapMb ?? 9000} MB`;
  document.getElementById('storage-remaining').textContent = formatStorage(storage.remainingBytes);
}

function renderRsvps(rsvps) {
  const tbody = document.getElementById('rsvp-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const rsvp of rsvps) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(rsvp.full_name)}</td>
      <td>${escapeHtml(rsvp.email)}</td>
      <td>${rsvp.attending === 'yes' ? 'Ja' : 'Nee'}</td>
      <td>${escapeHtml(rsvp.song_request || '')}</td>
      <td>${escapeHtml(rsvp.message || '')}</td>
      <td>${formatDate(rsvp.created_at)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderComparison(comparison) {
  const notYet = document.getElementById('not-rsvped-list');
  const unknown = document.getElementById('unknown-rsvp-list');
  if (notYet) {
    notYet.innerHTML = '';
    const items = comparison?.notRsvped || [];
    notYet.innerHTML = items.length
      ? items.map((email) => `<li>${escapeHtml(email)}</li>`).join('')
      : '<li>Geen — alles op die lys het RSVP.</li>';
  }
  if (unknown) {
    unknown.innerHTML = '';
    const items = comparison?.unknownRsvps || [];
    unknown.innerHTML = items.length
      ? items.map((r) => `<li>${escapeHtml(r.email)} — ${escapeHtml(r.full_name)}</li>`).join('')
      : '<li>Geen onbekende RSVP’s nie.</li>';
  }
}

function renderMedia(media) {
  const wrap = document.getElementById('admin-media-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!media.length) {
    wrap.innerHTML = '<p class="small-note">Daar is nog geen media opgelaai nie.</p>';
    return;
  }
  for (const item of media) {
    const row = document.createElement('div');
    row.className = 'admin-media-row';
    const preview = item.media_type === 'video'
      ? `<video src="${item.url}" muted></video>`
      : `<img src="${item.url}" alt="Media">`;
    row.innerHTML = `
      ${preview}
      <div>
        <strong>${escapeHtml(item.original_filename || item.id)}</strong><br>
        <span class="small-note">${escapeHtml(item.media_type)} • ${Math.round((item.file_size || 0) / 1024)} KB • ${item.hidden ? 'Versteek' : 'Sigbaar'}</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
        <button class="btn btn-soft" data-media-action="${item.hidden ? 'unhide' : 'hide'}" data-id="${item.id}">${item.hidden ? 'Wys' : 'Versteek'}</button>
        <button class="btn btn-primary" data-media-action="delete" data-id="${item.id}">Verwyder</button>
      </div>
    `;
    wrap.appendChild(row);
  }
}

async function loadAdminReport() {
  adminStatus('Laai admin data...', 'info');
  const report = await adminFetch('/api/admin-report');
  adminState.report = report;
  showAdminApp();
  renderStats(report);
  renderStorage(report.storage || {});
  renderRsvps(report.rsvps || []);
  renderComparison(report.comparison || {});
  renderMedia(report.media || []);
  adminStatus('Admin data is gelaai.', 'success');
}

const loginForm = document.getElementById('admin-login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = getPassword();
    if (!password) {
      adminStatus('Vul asseblief die admin-wagwoord in.', 'error');
      return;
    }
    sessionStorage.setItem('adminPassword', password);
    adminState.password = password;
    try {
      await loadAdminReport();
    } catch (error) {
      adminStatus(error.message || 'Admin kon nie oopmaak nie.', 'error');
    }
  });
}

const expectedForm = document.getElementById('expected-form');
if (expectedForm) {
  expectedForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailsText = document.getElementById('expected-emails')?.value || '';
    try {
      const result = await adminFetch('/api/admin-expected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailsText })
      });
      adminStatus(`${result.count || 0} verwagte e-posadresse is gestoor.`, 'success');
      await loadAdminReport();
    } catch (error) {
      adminStatus(error.message || 'E-poslys kon nie gestoor word nie.', 'error');
    }
  });
}

const exportBtn = document.getElementById('export-rsvps');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    const password = encodeURIComponent(getPassword());
    window.open(`/api/export-rsvps?password=${password}`, '_blank', 'noopener');
  });
}

const refreshBtn = document.getElementById('refresh-admin');
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    try { await loadAdminReport(); } catch (error) { adminStatus(error.message, 'error'); }
  });
}

const mediaList = document.getElementById('admin-media-list');
if (mediaList) {
  mediaList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-media-action]');
    if (!button) return;
    const action = button.dataset.mediaAction;
    const id = button.dataset.id;
    if (action === 'delete' && !confirm('Is jy seker jy wil hierdie item permanent verwyder?')) return;
    try {
      await adminFetch('/api/admin-media-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action })
      });
      await loadAdminReport();
    } catch (error) {
      adminStatus(error.message || 'Media aksie kon nie voltooi word nie.', 'error');
    }
  });
}

if (adminState.password) {
  const input = document.getElementById('admin-password');
  if (input) input.value = adminState.password;
}
