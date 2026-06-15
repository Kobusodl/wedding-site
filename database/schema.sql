-- Kobus & Anika wedding website database schema
-- Run this on the Cloudflare D1 database before using RSVP/admin/uploads.

CREATE TABLE IF NOT EXISTS rsvps (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  attending TEXT NOT NULL CHECK (attending IN ('yes', 'no')),
  song_request TEXT,
  message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rsvps_email ON rsvps(email);
CREATE INDEX IF NOT EXISTS idx_rsvps_attending ON rsvps(attending);

CREATE TABLE IF NOT EXISTS expected_emails (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expected_emails_email ON expected_emails(email);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  original_filename TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploader_name TEXT,
  uploader_message TEXT,
  approved INTEGER NOT NULL DEFAULT 1,
  hidden INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_visible ON media(hidden, approved, uploaded_at);

CREATE TABLE IF NOT EXISTS upload_events (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  media_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_upload_events_ip_time ON upload_events(ip_hash, created_at);
