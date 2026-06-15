import { badRequest, requireBindings, safeFileName } from '../_shared.js';

export async function onRequestGet({ request, env, params }) {
  try {
    requireBindings(env, ['DB', 'MEDIA_BUCKET']);
    const id = params.id;
    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';

    const row = await env.DB.prepare(`
      SELECT id, r2_key, original_filename, mime_type, hidden, approved
      FROM media
      WHERE id = ?
    `).bind(id).first();

    if (!row || row.hidden || !row.approved) return badRequest('Media is nie beskikbaar nie.', 404);
    const object = await env.MEDIA_BUCKET.get(row.r2_key);
    if (!object) return badRequest('Lêer kon nie gevind word nie.', 404);

    const filename = safeFileName(row.original_filename || row.id);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', row.mime_type || headers.get('Content-Type') || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename.replaceAll('"', '')}"`);
    headers.set('ETag', object.httpEtag);
    return new Response(object.body, { headers });
  } catch (error) {
    return badRequest(error.message || 'Media kon nie gelaai word nie.', 500);
  }
}
