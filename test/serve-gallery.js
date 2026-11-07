// Run with Node 22: node test/serve-gallery.js
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { onRequestGet } from '../functions/api/gallery.js';
import { onRequestGet as getMedia } from '../functions/media/[id].js';
import { fixture, seedGallery, mediaFixture, r2Read } from './gallery-fixtures.js';

const imageDir = process.argv[2];
const { env, sql } = fixture(imageDir ? { GALLERY_THUMBNAIL_HOST: 'photos.example.com' } : {});
seedGallery(sql, imageDir ? 54 : 55);
const image = await readFile(new URL('../public/assets/images/gallery-placeholder.jpg', import.meta.url));
const readVariants = (ext) => Promise.all([0, 1, 2].map((i) => readFile(join(imageDir, `${i}.${ext}`))));
const originals = imageDir ? await readVariants('jpg') : [image];
const thumbnails = imageDir ? await readVariants('webp') : [];
const videoId = imageDir ? '053' : '054';
const video = mediaFixture('clip.mp4');
const unsafe = Buffer.from('<!doctype html><title>Unsafe fixture</title><script>fetch("/executed");document.title="SCRIPT EXECUTED"</script>');
sql.exec("INSERT INTO media (id, r2_key, original_filename, media_type, mime_type, uploaded_at) VALUES ('unsafe','unsafe','disguised.jpg','image','text/html',NULL)");
env.MEDIA_BUCKET.get = async (key, options) => {
  if (key === 'unsafe') return r2Read(unsafe, options);
  if (key === videoId) return r2Read(video, options);
  if (!imageDir && key === '051') return null;
  const bytes = originals[Number(key) % originals.length];
  return r2Read(bytes, options);
};
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const origin = 'http://127.0.0.1:8821';

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    console.log(req.method, url.pathname, url.search);
    if (url.pathname === '/api/gallery') {
      await delay(1100);
      const response = await onRequestGet({ request: new Request(url), env });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end((await response.text()).replaceAll('https://photos.example.com/cdn-cgi/image/', '/cdn-cgi/image/'));
      return;
    }
    const variant = url.pathname.match(/^\/cdn-cgi\/image\/width=400,fit=scale-down,format=webp,quality=78\/media\/(\d+)$/);
    if (variant && imageDir) {
      await delay(250);
      const id = variant[1];
      if (id === '052' || id === '051') {
        res.writeHead(id === '052' ? 429 : 503, { 'Cache-Control': 'no-store' }).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' });
      res.end(thumbnails[Number(id) % thumbnails.length]);
      return;
    }
    if (/^\/media\/(?:\d+|unsafe)$/.test(url.pathname)) {
      await delay(900);
      const response = await getMedia({ request: new Request(url, { headers: req.headers }), env, params: { id: url.pathname.split('/').pop() } });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    // The browser fixture is intentionally read-only and serves public assets only.
    if (req.method !== 'GET' || !/^\/(?:gallery\/|assets\/[\w/.-]+)$/.test(url.pathname) ||
        url.pathname.split('/').includes('..')) {
      res.writeHead(404).end();
      return;
    }
    const path = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const body = await readFile(new URL(`../public${path}`, import.meta.url));
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(8821, '127.0.0.1', () => console.log(`Gallery fixture: ${origin}/gallery/`));
