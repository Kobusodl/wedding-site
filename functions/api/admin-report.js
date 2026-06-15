import { badRequest, getMediaStorageStatus, json, mediaUrl, requireAdmin, requireBindings } from '../_shared.js';

export async function onRequestGet({ request, env }) {
  try {
    requireBindings(env, ['DB']);
    const adminError = requireAdmin(request, env);
    if (adminError) return adminError;

    const rsvpsResult = await env.DB.prepare('SELECT id, full_name, email, attending, song_request, message, created_at, updated_at FROM rsvps ORDER BY created_at DESC').all();
    const expectedResult = await env.DB.prepare('SELECT email FROM expected_emails ORDER BY email').all();
    const mediaResult = await env.DB.prepare('SELECT id, original_filename, media_type, mime_type, file_size, hidden, uploaded_at FROM media ORDER BY uploaded_at DESC').all();

    const rsvps = rsvpsResult.results || [];
    const expected = (expectedResult.results || []).map((row) => row.email);
    const media = (mediaResult.results || []).map((item) => ({
      ...item,
      url: mediaUrl(item.id),
      downloadUrl: mediaUrl(item.id, true)
    }));

    const rsvpEmailMap = new Map(rsvps.map((r) => [String(r.email || '').toLowerCase(), r]));
    const expectedSet = new Set(expected);
    const notRsvped = expected.filter((email) => !rsvpEmailMap.has(email));
    const unknownRsvps = rsvps.filter((rsvp) => expected.length && !expectedSet.has(String(rsvp.email || '').toLowerCase()))
      .map((r) => ({ email: r.email, full_name: r.full_name }));

    const stats = {
      totalRsvps: rsvps.length,
      attending: rsvps.filter((r) => r.attending === 'yes').length,
      notAttending: rsvps.filter((r) => r.attending === 'no').length,
      mediaItems: media.length,
      expectedEmails: expected.length,
      notRsvped: notRsvped.length
    };

    const storage = await getMediaStorageStatus(env);

    return json({ rsvps, expected, media, stats, storage, comparison: { notRsvped, unknownRsvps } });
  } catch (error) {
    return badRequest(error.message || 'Admin verslag kon nie gelaai word nie.', 500);
  }
}
