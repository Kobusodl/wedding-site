import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequestPost } from '../functions/api/upload.js';
import { onRequestGet } from '../functions/media/[id].js';
import { fixture, mediaFixture } from './gallery-fixtures.js';

const origin = 'http://localhost';
function upload(env, bytes, name, type) {
  const form = new FormData();
  form.set('password', env.WEDDING_UPLOAD_PASSWORD);
  form.set('file', new File([bytes], name, { type }));
  return onRequestPost({ env, request: new Request(`${origin}/api/upload`, { method: 'POST', body: form }) });
}

function media(env, id, query = '', headers = {}) {
  return onRequestGet({ env, params: { id }, request: new Request(`${origin}/media/${id}${query}`, { headers }) });
}

test('disguised active content, mislabeled real media, and fabricated headers are rejected before storage', async () => {
  const { env, sql, objects } = fixture();
  const html = '<html><script>document.title="unsafe"</script></html>';
  const photo = mediaFixture('photo.jpg');
  for (const [bytes, name, type] of [
    [html, 'file.jpg', 'text/html'],
    [html, 'file.jpg', 'image/jpeg'],
    [html, 'file.png', 'image/png'],
    [html, 'file.webp', 'image/webp'],
    ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'file.jpg', 'image/svg+xml'],
    ['<?xml version="1.0"?><document/>', 'file.heic', 'image/heic'],
    ['document.title = "unsafe"', 'file.mov', 'video/quicktime'],
    [photo, 'file.png', 'image/png'],
    [photo, 'file.jpg', 'image/png'],
    [photo, 'file.html', 'image/jpeg'],
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2]), 'file.jpg', 'image/jpeg'],
    [Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex'), 'file.mp4', 'video/mp4']
  ]) {
    assert.equal((await upload(env, bytes, name, type)).status, 400, `${name}: ${type}`);
  }
  assert.equal(objects.size, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM media').get().count, 0);
});

test('genuine supported files keep their bytes and get a canonical response type', async () => {
  const { env, sql } = fixture();
  for (const [filename, declared, expected] of [
    ['photo.jpg', 'image/jpeg', 'image/jpeg'],
    ['photo.png', '', 'image/png'],
    ['photo.webp', 'image/webp', 'image/webp'],
    ['photo.heic', 'image/heif', 'image/heic'],
    ['photo.heic', 'application/octet-stream', 'image/heic'],
    ['clip.mp4', 'video/mp4', 'video/mp4'],
    ['clip.mov', 'video/quicktime', 'video/quicktime']
  ]) {
    const bytes = mediaFixture(filename);
    const accepted = await upload(env, bytes, filename, declared);
    assert.equal(accepted.status, 200, filename);
    const { item } = await accepted.json();
    assert.equal(sql.prepare('SELECT mime_type FROM media WHERE id = ?').get(item.id).mime_type, expected);

    const inline = await media(env, item.id);
    assert.equal(inline.status, 200);
    assert.equal(inline.headers.get('Content-Type'), expected);
    assert.equal(inline.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(inline.headers.get('Content-Security-Policy'), /^sandbox;/);
    assert.match(inline.headers.get('Content-Disposition'), /^inline;/);
    assert.deepEqual(Buffer.from(await inline.arrayBuffer()), bytes);

    const download = await media(env, item.id, '?download=1');
    assert.equal(download.headers.get('Content-Disposition'), `attachment; filename="${filename}"`);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  }
});

test('unsafe legacy bytes never leave the media route, and a real photo with bad MIME is served as JPEG', async () => {
  const { env, sql, objects } = fixture();
  const insert = sql.prepare("INSERT INTO media (id, r2_key, original_filename, media_type, mime_type) VALUES (?, ?, ?, 'image', ?)");
  const malicious = '<script>document.title="unsafe"</script>';
  insert.run('unsafe', 'unsafe', 'disguised.jpg', 'image/jpeg');
  objects.set('unsafe', Buffer.from(malicious));
  for (const [query, headers] of [['', {}], ['?download=1', {}], ['', { Range: 'bytes=10-20' }]]) {
    const blocked = await media(env, 'unsafe', query, headers);
    assert.equal(blocked.status, 415);
    assert.match(blocked.headers.get('Content-Type'), /^application\/json/);
    assert.equal(blocked.headers.get('Cache-Control'), 'no-store');
    assert.equal(blocked.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(blocked.headers.get('Content-Security-Policy'), /^sandbox;/);
    assert.ok(!(await blocked.text()).includes(malicious));
  }
  insert.run('legacy', 'legacy', 'photo.html', 'text/html');
  const jpeg = mediaFixture('photo.jpg');
  objects.set('legacy', jpeg);
  const valid = await media(env, 'legacy', '?download=1');
  assert.equal(valid.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(valid.headers.get('Content-Disposition'), 'attachment; filename="photo.html.jpg"');
  assert.deepEqual(Buffer.from(await valid.arrayBuffer()), jpeg);
});

test('video seeks return the correct byte ranges after validating the prefix', async () => {
  const { env } = fixture();
  const bytes = mediaFixture('clip.mp4');
  const accepted = await upload(env, bytes, 'clip.mp4', 'video/mp4');
  assert.equal(accepted.status, 200);
  const { item } = await accepted.json();
  for (const [header, start, end] of [
    ['bytes=0-2', 0, 2], ['bytes=5000-5099', 5000, 5099], ['bytes=-64', bytes.length - 64, bytes.length - 1]
  ]) {
    const part = await media(env, item.id, '', { Range: header });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('Accept-Ranges'), 'bytes');
    assert.equal(part.headers.get('Content-Range'), `bytes ${start}-${end}/${bytes.length}`);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(start, end + 1));
  }
  const invalid = await media(env, item.id, '', { Range: `bytes=${bytes.length}-` });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('Content-Range'), `bytes */${bytes.length}`);
  const stale = await media(env, item.id, '', { Range: 'bytes=0-2', 'If-Range': '"stale"' });
  assert.equal(stale.status, 200);
  assert.deepEqual(Buffer.from(await stale.arrayBuffer()), bytes);
});
