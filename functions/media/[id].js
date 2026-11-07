import { json, requireBindings, safeFileName } from '../_shared.js';
import { detectMediaFormat, MEDIA_HEADER_BYTES } from '../_media-format.js';

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "sandbox; script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};

function mediaError(message, status, headers = {}) {
  return json({ error: message }, { status, headers: { ...securityHeaders, ...headers } });
}

function readRange(request, size, etag) {
  const ifRange = request.headers.get('If-Range');
  if (ifRange && ifRange !== etag) return null;
  const range = /^bytes=(\d*)-(\d*)$/i.exec(request.headers.get('Range') || '');
  if (!range || (!range[1] && !range[2])) return null;
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return false;
  return { offset: start, length: end - start + 1 };
}

export async function onRequestGet({ request, env, params }) {
  try {
    requireBindings(env, ['DB', 'MEDIA_BUCKET']);
    const id = params.id;
    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';

    const row = await env.DB.prepare(`
      SELECT id, r2_key, original_filename, hidden, approved
      FROM media
      WHERE id = ?
    `).bind(id).first();

    if (!row || row.hidden || !row.approved) return mediaError('Media is nie beskikbaar nie.', 404);

    // Always inspect the start of the stored object, even for nonzero video ranges.
    const prefix = await env.MEDIA_BUCKET.get(row.r2_key, { range: { offset: 0, length: MEDIA_HEADER_BYTES } });
    if (!prefix) return mediaError('Lêer kon nie gevind word nie.', 404);
    const header = await prefix.arrayBuffer();
    const format = detectMediaFormat(header, prefix.size);
    if (!format) return mediaError('Hierdie lêer is nie ’n ondersteunde foto of video nie.', 415);

    const range = readRange(request, prefix.size, prefix.httpEtag);
    if (range === false) {
      return mediaError('Ongeldige lêerbereik.', 416, { 'Content-Range': `bytes */${prefix.size}` });
    }
    const offset = range?.offset ?? 0;
    const length = range?.length ?? prefix.size;
    let body;
    if (offset + length <= header.byteLength) {
      body = new Uint8Array(header, offset, length);
    } else {
      const object = await env.MEDIA_BUCKET.get(row.r2_key, {
        ...(range ? { range } : {}),
        onlyIf: { etagMatches: prefix.etag }
      });
      if (!object?.body) return mediaError('Lêer is nie beskikbaar nie. Probeer weer.', 404);
      body = object.body;
    }

    const storedName = safeFileName(row.original_filename || row.id);
    const extension = storedName.split('.').at(-1).toLowerCase();
    const filename = storedName.includes('.') && format.extensions.includes(extension)
      ? storedName : `${storedName}.${format.extensions[0]}`;
    const headers = new Headers({
      ...securityHeaders,
      'Content-Type': format.mime,
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'ETag': prefix.httpEtag
    });
    if (range) headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${prefix.size}`);
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch (error) {
    return mediaError(error.message || 'Media kon nie gelaai word nie.', 500);
  }
}
