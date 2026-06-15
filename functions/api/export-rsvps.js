import { badRequest, csvEscape, requireAdmin, requireBindings } from '../_shared.js';

export async function onRequestGet({ request, env }) {
  try {
    requireBindings(env, ['DB']);
    const adminError = requireAdmin(request, env);
    if (adminError) return adminError;

    const { results } = await env.DB.prepare('SELECT full_name, email, attending, song_request, message, created_at FROM rsvps ORDER BY created_at DESC').all();
    const header = ['Naam & Van', 'E-posadres', 'Bywoon', 'Liedjie-versoek', 'Kort boodskap', 'Ingedien'];
    const rows = (results || []).map((r) => [
      r.full_name,
      r.email,
      r.attending === 'yes' ? 'Ja' : 'Nee',
      r.song_request || '',
      r.message || '',
      r.created_at || ''
    ]);
    const csv = '\ufeff' + [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="kobus-anika-rsvps.csv"',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return badRequest(error.message || 'CSV kon nie afgelaai word nie.', 500);
  }
}
