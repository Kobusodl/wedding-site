import { badRequest, getMediaStorageStatus, json, mediaUrl, requireBindings } from '../_shared.js';

const UPLOADS_CLOSED_MESSAGE = 'Oplaai is tans gesluit. Die gallery is steeds beskikbaar om foto’s en video’s te bekyk en af te laai.';
const STORAGE_FULL_MESSAGE = 'Ons gallery het die veilige oplaailimiet bereik. Jy kan steeds foto’s en video’s bekyk en aflaai.';
const PAGE_SIZE = 24;
const THUMBNAIL_VARIANT = 'width=400,fit=scale-down,format=webp,quality=78';

function thumbnailOrigin(env) {
  const host = String(env.GALLERY_THUMBNAIL_HOST || '').trim().toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
      /(?:^|\.)(?:pages|workers)\.dev$/.test(host)) return '';
  return `https://${host}`;
}

function canThumbnail(item) {
  return item.media_type === 'image' &&
    !/hei[cf]/i.test(item.mime_type || '') &&
    !/\.hei[cf]$/i.test(item.original_filename || '') &&
    (/^image\/(jpeg|png|webp)$/i.test(item.mime_type || '') ||
     /\.(jpe?g|png|webp)$/i.test(item.original_filename || ''));
}

export async function onRequestGet({ request, env }) {
  try {
    requireBindings(env, ['DB']);
    const params = new URL(request.url).searchParams;
    // Keep the original response for older gallery clients.
    const paged = params.get('page') === '1';
    const rawCursor = paged ? params.get('cursor') : null;
    let cursor;
    if (rawCursor !== null) {
      try {
        cursor = JSON.parse(rawCursor);
        if (rawCursor.length > 512 || !Array.isArray(cursor) || cursor.length !== 2 ||
            !(cursor[0] === null || typeof cursor[0] === 'string') ||
            typeof cursor[1] !== 'string' || !cursor[1]) throw new Error();
      } catch {
        return badRequest('Ongeldige gallery-bladsy.');
      }
    }
    const filters = cursor
      ? cursor[0] === null
        ? 'AND uploaded_at IS NULL AND id < ?'
        : 'AND ((uploaded_at, id) < (?, ?) OR uploaded_at IS NULL)'
      : '';
    const query = env.DB.prepare(`
      SELECT id, original_filename, media_type, mime_type, file_size, uploader_name, uploaded_at
      FROM media
      WHERE hidden = 0 AND approved = 1
      ${filters}
      ORDER BY uploaded_at DESC, id DESC
      ${paged ? 'LIMIT ?' : ''}
    `);
    const args = cursor ? (cursor[0] === null ? [cursor[1]] : cursor) : [];
    const { results = [] } = await (paged ? query.bind(...args, PAGE_SIZE + 1) : query).all();

    const page = paged ? results.slice(0, PAGE_SIZE) : results;
    const origin = paged ? thumbnailOrigin(env) : '';
    const items = page.map((item) => {
      const url = mediaUrl(item.id);
      return {
        ...item,
        // Bypass browser copies cached before media responses were hardened.
        url: `${url}?v=2`,
        downloadUrl: `${mediaUrl(item.id, true)}&v=2`,
        ...(origin && canThumbnail(item) ? {
          thumbnailUrl: `${origin}/cdn-cgi/image/${THUMBNAIL_VARIANT}${url}`
        } : {})
      };
    });
    const last = page.at(-1);
    const pagination = paged ? {
      nextCursor: results.length > PAGE_SIZE ? JSON.stringify([last.uploaded_at, last.id]) : null
    } : {};
    if (cursor) return json({ items, ...pagination });
    const storage = await getMediaStorageStatus(env);
    const uploadAvailable = storage.uploadsEnabled && !storage.storageFull && !storage.itemCapReached;
    const uploadMessage = !storage.uploadsEnabled
      ? UPLOADS_CLOSED_MESSAGE
      : storage.storageFull
        ? STORAGE_FULL_MESSAGE
        : storage.itemCapReached
          ? 'Die maksimum aantal media-items is bereik. Jy kan steeds die gallery bekyk en items aflaai.'
          : '';

    return json({ items, ...pagination, uploadState: { available: uploadAvailable, message: uploadMessage } });
  } catch (error) {
    return badRequest(error.message || 'Gallery kon nie gelaai word nie.', 500);
  }
}
