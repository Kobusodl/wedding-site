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
MAX_UPLOADS_PER_HOUR_PER_IP = "80"
```

Vir production is dit beter om die admin password in Cloudflare Dashboard as ’n environment variable/secret te stel.

## 7. Local development

```bash
npm run dev
```

Maak dan die local URL oop wat Wrangler wys.

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
