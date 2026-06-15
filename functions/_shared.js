export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init.headers || {})
    }
  });
}

export function badRequest(message, status = 400) {
  return json({ error: message }, { status });
}

export function requireBindings(env, bindings = []) {
  for (const binding of bindings) {
    if (!env[binding]) throw new Error(`Missing Cloudflare binding: ${binding}`);
  }
}

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function adminPasswordFromRequest(request) {
  const url = new URL(request.url);
  return request.headers.get('X-Admin-Password') || url.searchParams.get('password') || '';
}

export function requireAdmin(request, env) {
  const expected = String(env.ADMIN_PASSWORD || 'change-this-password');
  const provided = String(adminPasswordFromRequest(request));
  if (!provided || provided !== expected) {
    return badRequest('Ongeldige admin password.', 401);
  }
  return null;
}

export function uploadPasswordMatches(value, env) {
  const expected = String(env.WEDDING_UPLOAD_PASSWORD || 'AKT').trim().toLowerCase();
  const provided = String(value || '').trim().toLowerCase();
  return Boolean(provided && provided === expected);
}

export function getFileExtension(filename = '') {
  const clean = String(filename).toLowerCase().split('?')[0].split('#')[0];
  const part = clean.includes('.') ? clean.split('.').pop() : '';
  return part.replace(/[^a-z0-9]/g, '').slice(0, 8);
}

export function safeFileName(filename = 'media') {
  const trimmed = String(filename || 'media').trim() || 'media';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
}

export function classifyUpload(file) {
  const mime = String(file.type || '').toLowerCase();
  const ext = getFileExtension(file.name);
  const imageExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
  const videoExt = ['mp4', 'mov'];
  if (mime.startsWith('image/') || imageExt.includes(ext)) return 'image';
  if (mime.startsWith('video/') || videoExt.includes(ext)) return 'video';
  return 'other';
}

export function mediaUrl(id, download = false) {
  return `/media/${encodeURIComponent(id)}${download ? '?download=1' : ''}`;
}

export async function hashIp(ip) {
  const input = new TextEncoder().encode(String(ip || 'unknown'));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function parseEmailColumn(text) {
  const emails = [];
  const seen = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    const firstCell = line.split(/[;,\t]/)[0];
    const email = normaliseEmail(firstCell);
    if (!email || !isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}
