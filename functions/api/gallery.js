import { badRequest, json, mediaUrl, requireBindings } from '../_shared.js';

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
    return json({ items });
  } catch (error) {
    return badRequest(error.message || 'Gallery kon nie gelaai word nie.', 500);
  }
}
