-- Generated speech (Bhashini text-to-speech), kept so each sentence is synthesised once. The bot's fixed
-- lines then play instantly and cost no API calls; only new text (names, new notices) reaches Bhashini.
CREATE TABLE tts_cache (
  key        TEXT PRIMARY KEY,           -- sha256 of provider|language|voice|text
  lang       TEXT NOT NULL,
  text       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  audio      BYTEA NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
