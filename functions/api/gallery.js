import { badRequest, getMediaStorageStatus, json, mediaUrl, requireBindings } from '../_shared.js';

const UPLOADS_CLOSED_MESSAGE = 'Oplaai is tans gesluit. Die gallery is steeds beskikbaar om foto’s en video’s te bekyk en af te laai.';
const STORAGE_FULL_MESSAGE = 'Ons gallery het die veilige oplaailimiet bereik. Jy kan steeds foto’s en video’s bekyk en aflaai.';

export async function onRequestGet({ env }) {
  try {
    requireBindings(env, ['DB']);
    const { results } = await env.DB.prepare(`
      SELECT id, original_filename, media_type, mime_type, file_size, uploader_name, uploaded_at
      FROM media
      WHERE hidden = 0 AND approved = 1
      ORDER BY uploaded_at DESC
    `).all();

    const items = (results || []).map((item) => ({
      ...item,
      url: mediaUrl(item.id),
      downloadUrl: mediaUrl(item.id, true)
    }));
    const storage = await getMediaStorageStatus(env);
    const uploadAvailable = storage.uploadsEnabled && !storage.storageFull && !storage.itemCapReached;
    const uploadMessage = !storage.uploadsEnabled
      ? UPLOADS_CLOSED_MESSAGE
      : storage.storageFull
        ? STORAGE_FULL_MESSAGE
        : storage.itemCapReached
          ? 'Die maksimum aantal media-items is bereik. Jy kan steeds die gallery bekyk en items aflaai.'
          : '';

    return json({ items, uploadState: { available: uploadAvailable, message: uploadMessage } });
  } catch (error) {
    return badRequest(error.message || 'Gallery kon nie gelaai word nie.', 500);
  }
}
