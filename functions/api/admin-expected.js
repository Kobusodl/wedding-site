import { badRequest, json, parseEmailColumn, requireAdmin, requireBindings } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  try {
    requireBindings(env, ['DB']);
    const adminError = requireAdmin(request, env);
    if (adminError) return adminError;
    const body = await request.json().catch(() => null);
    const emails = parseEmailColumn(body?.emailsText || '');
    if (emails.length > 1000) return badRequest('Die lys is te lank. Maksimum 1000 e-posadresse.');

    await env.DB.prepare('DELETE FROM expected_emails').run();
    if (emails.length) {
      const statements = emails.map((email) => env.DB.prepare('INSERT OR IGNORE INTO expected_emails (id, email, created_at) VALUES (?, ?, datetime(\'now\'))').bind(crypto.randomUUID(), email));
      await env.DB.batch(statements);
    }
    return json({ ok: true, count: emails.length });
  } catch (error) {
    return badRequest(error.message || 'E-poslys kon nie gestoor word nie.', 500);
  }
}
