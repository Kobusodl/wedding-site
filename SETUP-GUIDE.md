# Setup Guide — Kobus & Anika Wedding Site

Hierdie gids is bedoel vir ’n Cloudflare Pages deployment met D1 en R2.

## 1. Installeer dependencies

```bash
npm install
```

## 2. Teken in by Cloudflare Wrangler

```bash
npx wrangler login
```

## 3. Skep D1 databasis

```bash
npm run d1:create
```

Wrangler sal ’n `database_id` teruggee. Kopieer daardie ID na `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "kobus_anika_wedding"
database_id = "JOU_D1_DATABASE_ID_HIER"
```

## 4. Skep R2 bucket

```bash
npm run r2:create
```

Die bucket naam in hierdie projek is:

```text
kobus-anika-wedding-media
```

## 5. Run D1 schema

Vir remote/production:

```bash
npm run d1:schema:remote
```

Vir local development:

```bash
npm run d1:schema:local
```

## 6. Stel passwords en limiete

Die default waardes is in `wrangler.toml`:

```toml
[vars]
WEDDING_UPLOAD_PASSWORD = "AKT"
ADMIN_PASSWORD = "change-this-password"
MAX_PHOTO_MB = "15"
MAX_VIDEO_MB = "50"
MAX_TOTAL_STORAGE_MB = "9000"
MAX_TOTAL_MEDIA_ITEMS = "1500"
MAX_UPLOADS_PER_HOUR_PER_IP = "240"
```

Vir production is dit beter om die admin password in Cloudflare Dashboard as ’n environment variable/secret te stel.

Die gallery aanvaar tot 200 foto's en 2 video's per keuse. Die limiet van 240 lêers per uur geld per IP-adres, ook wanneer gaste dieselfde Wi-Fi gebruik. As die Pages-projek die limiet in die Dashboard stel, moet daardie waarde ook 240 wees. Geen nuwe bindings of databasismigrasie is nodig nie.

## 7. Local development

```bash
npm run dev
```

Maak dan die local URL oop wat Wrangler wys.

Gallery-toetse sonder toegang tot produksiedata (Node.js 22+):

```bash
node --test test/gallery.test.js test/media-security.test.js
node test/serve-gallery.js
```

Die tweede opdrag bedien 'n plaaslike gallery by `http://127.0.0.1:8821/gallery/` met toetsdata en vertraagde antwoorde.

Die gallery se foto- en video-skakels gebruik `v=2` om ou blaaierkasinskrywings te omseil. Ná publikasie moet enige bestaande edge-kas vir die ou media-URL's skoongemaak word as die projek dit gebruik. Die nuwe kode kan nie reeds gestoorde kopieë van ou direkte skakels uit besoekers se blaaiers verwyder nie.

Om die WebP-pad plaaslik na te boots, gebruik Python met Pillow:

```bash
python test/make-gallery-images.py node_modules/.gallery-thumbnail-fixtures
node test/serve-gallery.js node_modules/.gallery-thumbnail-fixtures
```

Dit toets plaaslike WebP-antwoorde en nagebootste 429- en 503-foute. Dit gebruik nie Cloudflare of produksiedata nie.

### Opsioneel: kleiner gallery-foto's

Die gallery gebruik oorspronklike foto's totdat jy die opsionele thumbnail-gasheer instel. Geen produksiedata hoef te verander nie.

1. Koppel 'n [Cloudflare-geproxyde eie gasheernaam](https://developers.cloudflare.com/pages/configuration/custom-domains/) aan dieselfde Pages-projek. Bevestig dat die bestaande `/media/<id>`-roete daar werk.
2. Aktiveer [Images Transformations](https://developers.cloudflare.com/images/optimization/transformations/overview/) vir daardie Cloudflare-sone. Hou die bronbeperking op toegelate oorspronge; moenie die R2-bucket openbaar maak nie.
3. Stel die Pages-omgewingsveranderlike `GALLERY_THUMBNAIL_HOST` op net die gasheernaam, byvoorbeeld `photos.example.com` (sonder `https://`, pad of poort). As jy `wrangler.toml` as die konfigurasiebron gebruik, voeg dit by die toepaslike `[vars]`. Voeg eers dié instelling by nadat die transformasie-URL 'n WebP teruggee. Die bestaande `pages.dev`-skakel kan dan dieselfde thumbnail-gasheer gebruik.
4. Bevestig in 'n toetsontplooiing dat gallery-teëls WebP gebruik, voorskoue en aflaaie steeds `/media/` gebruik, en herhaalde thumbnail-versoeke die kas gebruik.

Daar is een 400px WebP-variant (kwaliteit 78), sonder opsny of vergroting. Bestaande en nuwe JPEG-, PNG- en WebP-foto's word op aanvraag verwerk. Daar is geen backfill, nuwe binding, aparte Worker of ekstra R2-voorwerpe nie. As die transformasie misluk, probeer die teël die oorspronklike foto een keer.

Die [Images Free-limiet](https://developers.cloudflare.com/images/pricing/#images-free) is 5 000 unieke transformasies per kalendermaand vir die rekening. Ongeveer 220 foto's beteken hoogstens ongeveer 220 unieke gallery-transformasies vir die vaste variant as almal in daardie maand bekyk word; ander gebruik op die rekening tel ook. Moenie 'n betaalde plan aktiveer sonder goedkeuring nie.

Cloudflare kas die afgeleide foto's volgens die bron se kasbeleid. Wanneer 'n foto versteek of verwyder word, [purge die oorspronklike bron-URL op die thumbnail-gasheer](https://developers.cloudflare.com/images/reference/troubleshooting/#caching-and-purging) om ook die afgeleide weergawe van die edge-kas te verwyder. Dit kan nie kopieë uit besoekers se blaaierkas terugroep nie.

## 8. Deploy na Cloudflare Pages

```bash
npm run deploy
```

Jy kan ook die GitHub repo aan Cloudflare Pages koppel sodat elke `git push` outomaties deploy.

## 9. Belangrike Cloudflare bindings

Die backend verwag hierdie bindings:

```text
DB            Cloudflare D1 database binding
MEDIA_BUCKET  Cloudflare R2 bucket binding
```

As die RSVP, admin of uploads nie werk nie, is die eerste ding om te toets of hierdie bindings reg gekoppel is.

## 10. QR code vir die Gallery

Gebruik hierdie blad as die QR link:

```text
https://jou-site.pages.dev/gallery/
```

Op die troudag kan julle die password `AKT` op die tafels of op ’n bordjie sit. Gaste het die password net nodig om op te laai, nie om die gallery te sien nie.

## 11. Admin dashboard

```text
/admin/
```

Wat jy daar kan doen:

- RSVP’s sien
- RSVP’s as CSV aflaai vir Excel
- Expected email list plak en vergelyk
- Media sien
- Media versteek of verwyder

## 12. Expected email list

In Admin kan jy e-posadresse plak soos:

```text
persoon1@email.com
persoon2@email.com
persoon3@email.com
```

Die dashboard wys dan:

- Het RSVP
- Het nog nie RSVP nie
- Onbekende RSVP’s

Let wel: dit vergelyk op e-posadres. As iemand met ’n ander e-posadres RSVP, sal dit onder “Onbekende RSVP’s” wys.
