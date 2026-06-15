import { badRequest, classifyUpload, cleanText, hashIp, json, requireBindings, safeFileName, uploadPasswordMatches } from '../_shared.js';

const MB = 1024 * 1024;

function envNumber(env, key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function onRequestPost({ request, env }) {
  try {
    requireBindings(env, ['DB', 'MEDIA_BUCKET']);
    const form = await request.formData();
    const password = form.get('password');
    if (!uploadPasswordMatches(password, env)) return badRequest('Die upload-password is verkeerd.', 401);

    const file = form.get('file');
    if (!file || typeof file === 'string') return badRequest('Geen lêer is ontvang nie.');

    const mediaType = classifyUpload(file);
    if (mediaType === 'other') return badRequest('Gebruik asseblief net jpg, jpeg, png, webp, heic, mp4 of mov.');

    const maxPhotoMb = envNumber(env, 'MAX_PHOTO_MB', 15);
    const maxVideoMb = envNumber(env, 'MAX_VIDEO_MB', 50);
    const maxFileMb = mediaType === 'video' ? maxVideoMb : maxPhotoMb;
    if (file.size > maxFileMb * MB) return badRequest(`${file.name} is groter as ${maxFileMb} MB.`);

    const totalLimitMb = envNumber(env, 'MAX_TOTAL_STORAGE_MB', 9000);
    const itemLimit = envNumber(env, 'MAX_TOTAL_MEDIA_ITEMS', 1500);
    const total = await env.DB.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(file_size), 0) AS bytes FROM media').first();
    if ((total?.count || 0) >= itemLimit) return badRequest('Die maksimum aantal media-items is bereik. Kontak asseblief vir Kobus of Anika.');
    if (((total?.bytes || 0) + file.size) > totalLimitMb * MB) return badRequest('Die gallery se stoorlimiet is amper bereik. Kontak asseblief vir Kobus of Anika.');

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'local';
    const ipHash = await hashIp(ip);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM upload_events WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')").bind(ipHash).first();
    if ((recent?.count || 0) >= envNumber(env, 'MAX_UPLOADS_PER_HOUR_PER_IP', 80)) {
      return badRequest('Te veel uploads in ’n kort tyd. Probeer asseblief later weer.');
    }

    const id = crypto.randomUUID();
    const datePath = new Date().toISOString().slice(0, 10);
    const originalName = safeFileName(file.name || `${id}.${mediaType === 'video' ? 'mp4' : 'jpg'}`);
    const key = `wedding/uploads/${mediaType}s/${datePath}/${id}-${originalName}`;
    const uploaderName = cleanText(form.get('uploaderName'), 160);
    const uploaderMessage = cleanText(form.get('uploaderMessage'), 300);
    const mimeType = file.type || (mediaType === 'video' ? 'application/octet-stream' : 'image/jpeg');

    await env.MEDIA_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: mimeType,
        contentDisposition: `inline; filename="${originalName.replaceAll('"', '')}"`
      },
      customMetadata: {
        originalName,
        uploaderName,
        mediaType
      }
    });

    await env.DB.prepare(`
      INSERT INTO media (id, r2_key, original_filename, media_type, mime_type, file_size, uploader_name, uploader_message, approved, hidden, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, datetime('now'))
    `).bind(id, key, originalName, mediaType, mimeType, file.size, uploaderName, uploaderMessage).run();

    await env.DB.prepare('INSERT INTO upload_events (id, ip_hash, media_id, created_at) VALUES (?, ?, ?, datetime(\'now\'))')
      .bind(crypto.randomUUID(), ipHash, id).run();

    return json({ ok: true, item: { id, media_type: mediaType, original_filename: originalName, url: `/media/${id}`, downloadUrl: `/media/${id}?download=1` } });
  } catch (error) {
    return badRequest(error.message || 'Upload kon nie voltooi word nie.', 500);
  }
}
