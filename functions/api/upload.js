import {
  badRequest,
  cleanText,
  envNumber,
  getMediaStorageStatus,
  hashIp,
  json,
  requireBindings,
  safeFileName,
  uploadPasswordMatches
} from '../_shared.js';
import { validateUploadFormat } from '../_media-format.js';

const MB = 1024 * 1024;
const MAX_BATCH_PHOTOS = 200;
const MAX_BATCH_VIDEOS = 2;
const RATE_LIMIT_MESSAGE = 'Te veel lêers vir hierdie verbinding binne een uur. Probeer asseblief later weer, of kies minder lêers.';
const UPLOADS_CLOSED_MESSAGE = 'Oplaai is tans gesluit. Die gallery is steeds beskikbaar om foto’s en video’s te bekyk en af te laai.';
const STORAGE_FULL_MESSAGE = 'Ons gallery het die veilige oplaailimiet bereik. Jy kan steeds foto’s en video’s bekyk en aflaai.';

export async function onRequestPost({ request, env }) {
  try {
    requireBindings(env, ['DB', 'MEDIA_BUCKET']);
    const form = await request.formData();
    const password = form.get('password');
    if (!uploadPasswordMatches(password, env)) return badRequest('Die upload-wagwoord is verkeerd.', 401);

    const storage = await getMediaStorageStatus(env);
    if (!storage.uploadsEnabled) return badRequest(UPLOADS_CLOSED_MESSAGE, 403);
    if (storage.storageFull) return badRequest(STORAGE_FULL_MESSAGE, 409);

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'local';
    const ipHash = await hashIp(ip);
    const hourlyLimit = envNumber(env, 'MAX_UPLOADS_PER_HOUR_PER_IP', 240);
    async function exceedsRateLimit(incoming) {
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM upload_events WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')"
      ).bind(ipHash).first();
      return (recent?.count || 0) + incoming > hourlyLimit;
    }

    if (String(form.get('preflight') || '') === 'true') {
      let batchManifest;
      try {
        batchManifest = JSON.parse(String(form.get('batchManifest') || '[]'));
      } catch {
        return badRequest('Die oplaai-batch se besonderhede is ongeldig.');
      }
      if (!Array.isArray(batchManifest) || !batchManifest.length || batchManifest.length > MAX_BATCH_PHOTOS + MAX_BATCH_VIDEOS) {
        return badRequest('Geen geldige oplaai-batch is ontvang nie.');
      }

      const photoCount = batchManifest.filter((item) => item?.mediaType === 'image').length;
      const videoCount = batchManifest.filter((item) => item?.mediaType === 'video').length;
      const batchItems = photoCount + videoCount;
      const maxPhotoBytes = envNumber(env, 'MAX_PHOTO_MB', 10) * MB;
      const maxVideoBytes = envNumber(env, 'MAX_VIDEO_MB', 50) * MB;
      let batchBytes = 0;

      if (photoCount > MAX_BATCH_PHOTOS) {
        return badRequest(`Laai asseblief maksimum ${MAX_BATCH_PHOTOS} foto’s op een slag op.`);
      }
      if (videoCount > MAX_BATCH_VIDEOS) {
        return badRequest(`Laai asseblief maksimum ${MAX_BATCH_VIDEOS} video’s op een slag op.`);
      }
      if (batchItems !== batchManifest.length) {
        return badRequest('Die oplaai-batch bevat ’n ongeldige lêertipe.');
      }
      for (const item of batchManifest) {
        const size = Number(item.size);
        if (!Number.isFinite(size) || size <= 0) return badRequest('Die oplaai-batch bevat ’n ongeldige lêergrootte.');
        if (item.mediaType === 'image' && size > maxPhotoBytes) {
          return badRequest(`${String(item.name || 'Foto')} is groter as ${envNumber(env, 'MAX_PHOTO_MB', 10)} MB.`);
        }
        if (item.mediaType === 'video' && size > maxVideoBytes) {
          return badRequest(`${String(item.name || 'Video')} is groter as ${envNumber(env, 'MAX_VIDEO_MB', 50)} MB.`);
        }
        batchBytes += size;
      }
      if (storage.mediaItems + batchItems > storage.mediaItemCap) {
        return badRequest('Die maksimum aantal media-items is bereik. Jy kan steeds die gallery bekyk en items aflaai.', 409);
      }
      if (storage.usedBytes + batchBytes > storage.storageCapBytes) {
        return badRequest(STORAGE_FULL_MESSAGE, 409);
      }
      if (await exceedsRateLimit(batchItems)) return badRequest(RATE_LIMIT_MESSAGE, 429);
      return json({ ok: true });
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') return badRequest('Geen lêer is ontvang nie.');
    if (file.size === 0) return badRequest('Die lêer is leeg.');

    const maxPhotoMb = envNumber(env, 'MAX_PHOTO_MB', 10);
    const maxVideoMb = envNumber(env, 'MAX_VIDEO_MB', 50);
    if (file.size > Math.max(maxPhotoMb, maxVideoMb) * MB) {
      return badRequest(`${file.name} is te groot.`);
    }
    const format = await validateUploadFormat(file);
    if (!format) return badRequest('Die lêerinhoud, lêertipe of uitbreiding stem nie ooreen met ’n ondersteunde foto of video nie.');
    const { type: mediaType, mime: mimeType } = format;
    const maxFileMb = mediaType === 'video' ? maxVideoMb : maxPhotoMb;
    if (file.size > maxFileMb * MB) return badRequest(`${file.name} is groter as ${maxFileMb} MB.`);

    if (storage.itemCapReached) {
      return badRequest('Die maksimum aantal media-items is bereik. Jy kan steeds die gallery bekyk en items aflaai.', 409);
    }
    if (storage.usedBytes + file.size > storage.storageCapBytes) {
      return badRequest(STORAGE_FULL_MESSAGE, 409);
    }

    if (await exceedsRateLimit(1)) return badRequest(RATE_LIMIT_MESSAGE, 429);

    const id = crypto.randomUUID();
    const datePath = new Date().toISOString().slice(0, 10);
    const originalName = safeFileName(file.name || `${id}.${mediaType === 'video' ? 'mp4' : 'jpg'}`);
    const key = `wedding/uploads/${mediaType}s/${datePath}/${id}-${originalName}`;
    const uploaderName = cleanText(form.get('uploaderName'), 160);
    const uploaderMessage = cleanText(form.get('uploaderMessage'), 300);

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

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO media (id, r2_key, original_filename, media_type, mime_type, file_size, uploader_name, uploader_message, approved, hidden, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, datetime('now'))
      `).bind(id, key, originalName, mediaType, mimeType, file.size, uploaderName, uploaderMessage),
      env.DB.prepare(
        "INSERT INTO upload_events (id, ip_hash, media_id, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(crypto.randomUUID(), ipHash, id)
    ]);

    return json({
      ok: true,
      item: {
        id,
        media_type: mediaType,
        original_filename: originalName,
        url: `/media/${id}`,
        downloadUrl: `/media/${id}?download=1`
      }
    });
  } catch (error) {
    return badRequest(error.message || 'Upload kon nie voltooi word nie.', 500);
  }
}
