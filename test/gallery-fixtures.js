import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');

export function mediaFixture(name) {
  return readFileSync(new URL(`./media/${name}`, import.meta.url));
}

export function r2Read(bytes, { range, onlyIf } = {}) {
  const data = Buffer.from(bytes);
  const etag = createHash('sha256').update(data).digest('hex');
  const meta = { size: data.byteLength, etag, httpEtag: `"${etag}"` };
  if (onlyIf?.etagMatches && onlyIf.etagMatches !== etag) return meta;
  const body = range ? data.subarray(range.offset, range.offset + range.length) : data;
  return { ...meta, body, arrayBuffer: async () => Uint8Array.from(body).buffer };
}

export function fixture(vars = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(schema);
  const objects = new Map();
  const env = {
    WEDDING_UPLOAD_PASSWORD: 'fixture-password',
    MAX_UPLOADS_PER_HOUR_PER_IP: '240',
    ...vars,
    DB: {
      prepare(query) {
        const stmt = sql.prepare(query);
        function bind(...args) {
          return {
            all: async () => ({ results: stmt.all(...args) }),
            first: async () => stmt.get(...args) ?? null,
            run: () => stmt.run(...args)
          };
        }
        return { ...bind(), bind };
      },
      async batch(statements) {
        sql.exec('BEGIN');
        try {
          for (const statement of statements) statement.run();
          sql.exec('COMMIT');
        } catch (error) {
          sql.exec('ROLLBACK');
          throw error;
        }
      }
    },
    MEDIA_BUCKET: {
      async get(key, options) {
        const bytes = objects.get(key);
        return bytes ? r2Read(bytes, options) : null;
      },
      async put(key, stream) {
        objects.set(key, await new Response(stream).arrayBuffer());
      }
    }
  };
  return { env, sql, objects };
}

export function seedGallery(sql, count = 55) {
  const insert = sql.prepare(`
    INSERT INTO media (id, r2_key, original_filename, media_type, mime_type, file_size, uploaded_at)
    VALUES (?, ?, ?, ?, ?, 2000000, ?)
  `);
  for (let i = 1; i <= count; i += 1) {
    const id = String(i).padStart(3, '0');
    const video = i === count - 1;
    insert.run(id, id, `fixture-${id}.${video ? 'mp4' : 'jpg'}`,
      video ? 'video' : 'image', video ? 'video/mp4' : 'image/jpeg',
      i <= 8 ? null : '2026-11-07 12:00:00');
  }
}
