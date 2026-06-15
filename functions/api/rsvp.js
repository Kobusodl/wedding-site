import { badRequest, cleanText, isValidEmail, json, normaliseEmail, requireBindings } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  try {
    requireBindings(env, ['DB']);
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Ongeldige RSVP data.');

    const fullName = cleanText(body.fullName, 160);
    const email = normaliseEmail(body.email);
    const attending = cleanText(body.attending, 8) === 'yes' ? 'yes' : cleanText(body.attending, 8) === 'no' ? 'no' : '';
    const songRequest = cleanText(body.songRequest, 180);
    const message = cleanText(body.message, 800);

    if (!fullName) return badRequest('Naam & Van is nodig.');
    if (!email || !isValidEmail(email)) return badRequest('Gebruik asseblief ’n geldige e-posadres.');
    if (!attending) return badRequest('Kies asseblief of jy die troue gaan bywoon.');

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO rsvps (id, full_name, email, attending, song_request, message, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(email) DO UPDATE SET
        full_name=excluded.full_name,
        attending=excluded.attending,
        song_request=excluded.song_request,
        message=excluded.message,
        updated_at=datetime('now')
    `).bind(id, fullName, email, attending, songRequest, message).run();

    return json({ ok: true });
  } catch (error) {
    return badRequest(error.message || 'RSVP kon nie gestoor word nie.', 500);
  }
}
