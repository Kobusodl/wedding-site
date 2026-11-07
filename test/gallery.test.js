import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { onRequestGet } from '../functions/api/gallery.js';
import { onRequestPost } from '../functions/api/upload.js';
import { hashIp } from '../functions/_shared.js';
import { fixture, seedGallery, mediaFixture } from './gallery-fixtures.js';

const uploadSource = readFileSync(new URL('../public/assets/js/upload.js', import.meta.url), 'utf8');
const mb = 1024 * 1024;
const ip = '192.0.2.10';
const jpeg = mediaFixture('photo.jpg');
const photo = (name) => new File([jpeg], name, { type: 'image/jpeg' });
const manifest = (n) => Array.from({ length: n }, () => ({ mediaType: 'image', size: jpeg.length }));
const base = 'http://localhost';

function uploadRequest(body) {
  return new Request(`${base}/api/upload`, {
    method: 'POST', body, headers: { 'CF-Connecting-IP': ip }
  });
}

function preflight(env, entries, password = env.WEDDING_UPLOAD_PASSWORD) {
  const body = new FormData();
  body.set('password', password);
  body.set('preflight', 'true');
  body.set('batchManifest', JSON.stringify(entries));
  return onRequestPost({ request: uploadRequest(body), env });
}

function single(env, file) {
  const body = new FormData();
  body.set('password', env.WEDDING_UPLOAD_PASSWORD);
  body.set('file', file);
  return onRequestPost({ request: uploadRequest(body), env });
}

function gallery(env, params) {
  return onRequestGet({ request: new Request(`${base}/api/gallery?${params}`), env });
}

test('keyset pagination keeps ordering, exclusions and original URLs across equal and null timestamps', async () => {
  const { env, sql } = fixture();
  seedGallery(sql);
  sql.exec("UPDATE media SET hidden = 1 WHERE id = '053'; UPDATE media SET approved = 0 WHERE id = '052'");
  const first = await (await gallery(env, 'page=1')).json();
  assert.equal(first.items.length, 24);
  assert.equal(first.items[0].id, '055');
  assert.equal(first.items[0].url, '/media/055?v=2');
  assert.equal(first.items[0].downloadUrl, '/media/055?download=1&v=2');
  assert.ok(first.items.every((item) => !item.thumbnailUrl));
  assert.equal(first.uploadState.available, true);
  // A new photo ahead of the cursor must not shift the older pages.
  sql.exec("INSERT INTO media (id, r2_key, media_type, uploaded_at) VALUES ('new','new','image','2026-11-08 00:00:00')");
  const ids = first.items.map(({ id }) => id);
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await (await gallery(env, new URLSearchParams({ page: '1', cursor }))).json();
    assert.ok(page.items.length <= 24);
    ids.push(...page.items.map(({ id }) => id));
    cursor = page.nextCursor;
  }
  const expected = sql.prepare("SELECT id FROM media WHERE hidden = 0 AND approved = 1 AND id != 'new' ORDER BY uploaded_at DESC, id DESC").all();
  assert.deepEqual(ids, expected.map(({ id }) => id));
  assert.equal((await gallery(env, 'page=1&cursor=invalid')).status, 400);
  assert.equal((await (await gallery(env, '')).json()).items.length, 54);
});

test('preflight accepts 200 photos and 2 videos, and rejects bad counts, types, sizes and password', async () => {
  const { env, objects } = fixture();
  const videos = Array.from({ length: 2 }, () => ({ mediaType: 'video', size: mb }));
  for (const n of [1, 30, 31, 100, 200]) {
    assert.equal((await preflight(env, manifest(n))).status, 200);
  }
  assert.equal((await preflight(env, [...manifest(200), ...videos])).status, 200);
  assert.equal((await preflight(env, manifest(201))).status, 400);
  assert.equal((await preflight(env, [...videos, videos[0]])).status, 400);
  assert.equal((await preflight(env, [{ mediaType: 'other', size: 7 }])).status, 400);
  assert.equal((await preflight(env, [{ mediaType: 'image', size: 11 * mb }])).status, 400);
  assert.equal((await preflight(env, manifest(1), 'wrong')).status, 401);
  assert.equal((await single(env, new File(['text'], 'invalid.txt', { type: 'text/plain' }))).status, 400);
  assert.equal((await single(env, new File([new Uint8Array(10 * mb + 1)], 'large.jpg', { type: 'image/jpeg' }))).status, 400);
  assert.equal(objects.size, 0);
});

test('only paged, eligible photos receive a fixed thumbnail URL when a custom host is configured', async () => {
  const { env, sql } = fixture({ GALLERY_THUMBNAIL_HOST: 'photos.example.com' });
  seedGallery(sql);
  sql.exec("UPDATE media SET original_filename = 'legacy.HEIC', mime_type = 'application/octet-stream' WHERE id = '053'");
  sql.exec("UPDATE media SET mime_type = 'image/heif' WHERE id = '052'");
  const first = await (await gallery(env, 'page=1')).json();
  assert.equal(first.items[0].thumbnailUrl,
    'https://photos.example.com/cdn-cgi/image/width=400,fit=scale-down,format=webp,quality=78/media/055');
  assert.equal(first.items[0].url, '/media/055?v=2');
  assert.equal(first.items[0].downloadUrl, '/media/055?download=1&v=2');
  assert.ok(first.items.slice(1, 4).every((item) => !item.thumbnailUrl));
  const next = await (await gallery(env, new URLSearchParams({ page: '1', cursor: first.nextCursor }))).json();
  assert.match(next.items[0].thumbnailUrl, /\/media\/031$/);
  assert.ok((await (await gallery(env, '')).json()).items.every((item) => !item.thumbnailUrl));

  for (const value of ['', 'wedding-site-mqt.pages.dev', 'photo.workers.dev', 'https://example.com', 'example.com/path']) {
    env.GALLERY_THUMBNAIL_HOST = value;
    const result = await (await gallery(env, 'page=1')).json();
    assert.ok(result.items.every((item) => !item.thumbnailUrl));
  }
});

test('batch and individual writes honor storage, item, closed and rolling hourly limits', async () => {
  const { env, sql, objects } = fixture({ MAX_TOTAL_STORAGE_MB: '1', MAX_TOTAL_MEDIA_ITEMS: '2' });
  sql.exec(`INSERT INTO media (id, r2_key, media_type, file_size) VALUES ('existing','existing','image',${mb - jpeg.length})`);
  assert.equal((await preflight(env, manifest(2))).status, 409);
  assert.equal((await single(env, photo('fits.jpg'))).status, 200);
  assert.equal((await single(env, photo('full.jpg'))).status, 409);
  assert.equal(objects.size, 1);
  env.MAX_TOTAL_STORAGE_MB = '10';
  assert.equal((await preflight(env, manifest(1))).status, 409);
  assert.equal((await single(env, photo('item-cap.jpg'))).status, 409);
  env.MAX_TOTAL_MEDIA_ITEMS = '5000';
  env.UPLOADS_ENABLED = 'false';
  assert.equal((await preflight(env, manifest(1))).status, 403);
  env.UPLOADS_ENABLED = 'true';
  const ipHash = await hashIp(ip);
  const event = sql.prepare("INSERT INTO upload_events (id, ip_hash, created_at) VALUES (?, ?, datetime('now', ?))");
  event.run('expired', ipHash, '-61 minutes');
  for (let i = 0; i < 39; i += 1) event.run(`recent-${i}`, ipHash, '-5 minutes');
  assert.equal((await preflight(env, manifest(200))).status, 200);
  assert.equal((await preflight(env, [...manifest(200), { mediaType: 'video', size: 7 }])).status, 429);
  env.MAX_UPLOADS_PER_HOUR_PER_IP = '40';
  assert.equal((await single(env, photo('rate-limited.jpg'))).status, 429);
  assert.equal(objects.size, 1);
});

function uploadClient(fetch, password) {
  const events = {};
  const status = {};
  const submit = {};
  const input = { addEventListener: (_, handler) => { events.change = handler; } };
  const progress = { entries: [], prepend(el) { this.entries.unshift(el); }, replaceChildren() { this.entries = []; } };
  const form = {
    querySelector: () => submit,
    addEventListener: (_, handler) => { events.submit = handler; },
    reset() { input.files = []; }
  };
  const window = { galleryUploadsAvailable: true, refreshes: 0, afterSuccessfulUpload() { window.refreshes += 1; } };
  runInNewContext(uploadSource, {
    document: {
      createElement: () => ({}),
      getElementById: (id) => ({
        'upload-form': form, 'upload-progress': progress, 'media-files': input, 'upload-status': status
      })[id]
    },
    FormData: function (formElement) {
      const data = new FormData();
      if (formElement) data.set('password', password);
      return data;
    },
    window, fetch
  });
  return {
    select(files) { input.files = files; events.change(); },
    submit: () => events.submit({ preventDefault() {} }),
    status, progress, window
  };
}

for (const count of [1, 30, 31, 100, 200]) {
  test(`uploads ${count} simulated photos with one file request at a time`, async () => {
    const { env, objects } = fixture();
    let inFlight = 0;
    let peak = 0;
    const client = uploadClient(async (_, { body }) => {
      peak = Math.max(peak, ++inFlight);
      try {
        return await onRequestPost({ request: uploadRequest(body), env });
      } finally {
        inFlight -= 1;
      }
    }, env.WEDDING_UPLOAD_PASSWORD);
    client.select(Array.from({ length: count }, (_, i) => photo(`photo-${i}.jpg`)));
    await client.submit();
    assert.equal(peak, 1);
    assert.equal(objects.size, count);
    assert.match(client.status.textContent, new RegExp(`${count} van ${count} foto’s opgelaai`));
    assert.equal(client.window.refreshes, 1);
  });
}

test('retry skips successes and ambiguous responses, but retries rejected and untouched files', async () => {
  const { env, objects } = fixture();
  const requests = [];
  const client = uploadClient(async (_, { body }) => {
    const file = body.get('file');
    if (file) {
      requests.push(file.name);
      if (file.name === 'reject.jpg' && requests.filter((name) => name === file.name).length === 1) {
        return Response.json({ error: 'Fixture rejection' }, { status: 400 });
      }
    }
    const response = await onRequestPost({ request: uploadRequest(body), env });
    if (file?.name === 'lost.jpg') throw new Error('Connection dropped after save');
    return response;
  }, env.WEDDING_UPLOAD_PASSWORD);
  client.select(['ok.jpg', 'reject.jpg', 'lost.jpg', 'pending.jpg'].map(photo));
  await client.submit();
  assert.match(client.status.textContent, /1 van 4.*1 misluk.*1 onbevestig.*1 nog nie/);
  assert.equal(client.progress.entries.length, 2);
  await client.submit();
  assert.deepEqual(requests, ['ok.jpg', 'reject.jpg', 'lost.jpg', 'reject.jpg', 'pending.jpg']);
  assert.equal(objects.size, 4);
  assert.match(client.status.textContent, /3 van 4.*1 onbevestig/);
  await client.submit();
  assert.equal(requests.length, 5);
});

test('client rejects invalid and oversized selections before any network request', async () => {
  const client = uploadClient(() => assert.fail('unexpected request'), 'fixture-password');
  for (const [files, message] of [
    [[new File(['text'], 'bad.txt', { type: 'text/plain' })], /Gebruik asseblief/],
    [[{ name: 'large.jpg', type: 'image/jpeg', size: 11 * mb }], /groter as 10 MB/],
    [Array(201).fill(photo('photo.jpg')), /maksimum 200/],
    [Array(3).fill(new File(['video'], 'v.mp4', { type: 'video/mp4' })), /maksimum 2/]
  ]) {
    client.select(files);
    await client.submit();
    assert.match(client.status.textContent, message);
  }
});
