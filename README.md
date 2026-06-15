# Kobus & Anika Wedding Site

Afrikaanse trouwebwerf — Version 2 met geïntegreerde Gallery — met:

- Kreatiewe desktop hero-image en mobile video hero
- Countdown na 5 November 2026 om 16:00
- Maklike RSVP vorm
- Admin dashboard met RSVP oorsig en Excel/CSV export
- E-posvergelyking om te sien wie nog nie RSVP het nie
- Gallery blad vir kyk, aflaai en foto/video uploads
- Gallery met kies / kies alles / laai gekose items af
- Cloudflare Pages Functions backend
- Cloudflare D1 databasis
- Cloudflare R2 media stoorplek

## Belangrike lêers om later te vervang

Vervang hierdie lêers met julle eie foto’s/video:

```text
public/assets/images/desktop-hero.jpg
public/assets/images/hero-fallback.jpg
public/assets/images/couple-1.jpg
public/assets/images/couple-2.jpg
public/assets/images/gallery-placeholder.jpg
public/assets/videos/mobile-hero.mp4
```

Hou dieselfde lêernaam, dan hoef jy nie kode te verander nie.

## Webwerf bladsye

```text
/          Tuisblad
/rsvp/     RSVP vorm
/gallery/  Gallery, uploads en downloads in een plek
/admin/    Admin dashboard
```

## Admin

Default admin password in `wrangler.toml`:

```text
change-this-password
```

Verander dit later in Cloudflare se environment variables/secrets.

## Upload password

Default upload password:

```text
AKT
```

Die upload password is nie hoofletter-sensitief nie.

## RSVP velde

- Naam & Van
- E-posadres
- Troue bywoon: Ja / Nee
- Liedjie-versoek
- Kort boodskap, opsioneel

## Contribution section

Die bankbesonderhede is placeholders in `public/index.html`. Soek vir:

```text
Rekeninghouer: Voeg naam hier in
Bank: Voeg bank hier in
Rekeningnommer: Voeg rekeningnommer hier in
```

Vervang dit met die regte besonderhede of los dit versteek.
