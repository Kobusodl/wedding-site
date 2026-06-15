import { badRequest, json, requireAdmin, requireBindings } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  try {
    requireBindings(env, ['DB', 'MEDIA_BUCKET']);
    const adminError = requireAdmin(request, env);
    if (adminError) return adminError;

    const body = await request.json().catch(() => null);
    const id = String(body?.id || '').trim();
    const action = String(body?.action || '').trim();
    if (!id) return badRequest('Media ID is nodig.');
    if (!['hide', 'unhide', 'delete'].includes(action)) return badRequest('Ongeldige media aksie.');

    const row = await env.DB.prepare('SELECT id, r2_key FROM media WHERE id = ?').bind(id).first();
    if (!row) return badRequest('Media kon nie gevind word nie.', 404);

    if (action === 'delete') {
      await env.MEDIA_BUCKET.delete(row.r2_key);
      await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    await env.DB.prepare('UPDATE media SET hidden = ? WHERE id = ?').bind(action === 'hide' ? 1 : 0, id).run();
    return json({ ok: true });
  } catch (error) {
    return badRequest(error.message || 'Media aksie kon nie voltooi word nie.', 500);
  }
}
