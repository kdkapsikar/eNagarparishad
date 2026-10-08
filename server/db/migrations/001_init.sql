-- e-नगरपरिषद schema. Field names follow the two paper forms (see docs/FORMS.md):
--   household  = "कुटुंब प्रमुख" sheet (head, contact, address, caste/category, survey questions)
--   members    = "कुटुंबातील व्यक्तींची माहिती" table (one row per person)

-- Staff: the representative's office ("admin") and field volunteers / karyakartas ("volunteer").
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'volunteer')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_batches (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL,
  rows_total  INTEGER NOT NULL,
  households  INTEGER NOT NULL,
  members     INTEGER NOT NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE households (
  id              SERIAL PRIMARY KEY,
  head_name       TEXT NOT NULL,
  mobile          TEXT,
  whatsapp        TEXT,
  address         TEXT,
  area            TEXT,                       -- वस्ती / गल्ली, used to target notices
  caste           TEXT,
  category        TEXT,                       -- प्रवर्ग (open, obc, sc, st, ...)
  farm_details    TEXT,
  disability      TEXT,
  has_internet    BOOLEAN,
  has_water_filter BOOLEAN,
  has_anganwadi   BOOLEAN,
  gharkul_benefit BOOLEAN,
  other_issues    TEXT,
  consent         BOOLEAN NOT NULL DEFAULT false,
  consent_at      TIMESTAMPTZ,
  source          TEXT NOT NULL CHECK (source IN ('form', 'bot', 'self', 'import')),
  verified        BOOLEAN NOT NULL DEFAULT true, -- false for citizen self-registrations until staff check them
  import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX households_area_idx ON households (area);
CREATE INDEX households_mobile_idx ON households (mobile);

CREATE TABLE members (
  id            SERIAL PRIMARY KEY,
  household_id  INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,  -- अनु. क्र. on the paper sheet
  name          TEXT NOT NULL,
  relation      TEXT,
  dob           DATE,
  anniversary   DATE,
  gender        TEXT CHECK (gender IN ('male', 'female', 'other')),
  education     TEXT,
  occupation    TEXT,
  mobile        TEXT,
  -- Only the last 4 digits of Aadhaar are ever stored (see docs/PRIVACY.md).
  aadhaar_last4 TEXT CHECK (aadhaar_last4 ~ '^[0-9]{4}$'),
  -- PAN is stored AES-256-GCM encrypted; pan_last4 lets staff recognise it without decrypting.
  pan_enc       TEXT,
  pan_last4     TEXT,
  voter_id      TEXT,                        -- EPIC number (मतदान कार्ड क्र.)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX members_household_idx ON members (household_id);

-- Electricity / water / general notices shown on the public site and sent to residents.
CREATE TABLE notices (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('electricity', 'water', 'general')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  area       TEXT,                           -- NULL = whole ward
  starts_at  TIMESTAMPTZ,
  ends_at    TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE schemes (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  level        TEXT NOT NULL CHECK (level IN ('central', 'state', 'local')),
  category     TEXT NOT NULL,
  summary      TEXT NOT NULL,
  benefits     TEXT,
  eligibility  TEXT,
  documents    TEXT,
  how_to_apply TEXT,
  link         TEXT,
  is_new       BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Birth / death certificate requests. The portal collects and tracks the request; the certificate itself
-- is issued by the registrar (Civil Registration System). See docs/CERTIFICATES.md.
CREATE TABLE certificate_requests (
  id              TEXT PRIMARY KEY,          -- e.g. JN-26-4F7K2Q (birth) / MR-26-... (death)
  kind            TEXT NOT NULL CHECK (kind IN ('birth', 'death')),
  person_name     TEXT NOT NULL,
  event_date      DATE NOT NULL,
  event_place     TEXT NOT NULL,
  gender          TEXT CHECK (gender IN ('male', 'female', 'other')),
  father_name     TEXT,
  mother_name     TEXT,
  address         TEXT NOT NULL,
  applicant_name  TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  relation        TEXT,
  copies          INTEGER NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 10),
  status          TEXT NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted', 'documents_needed', 'forwarded', 'ready', 'delivered', 'rejected')),
  registration_no TEXT,                      -- registrar's number once issued
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX certificate_requests_phone_idx ON certificate_requests (applicant_phone);

CREATE TABLE certificate_updates (
  id         SERIAL PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES certificate_requests(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  remark     TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every message prepared for a resident (birthday wish, notice, custom). With the default "manual"
-- channel staff send it from their own WhatsApp via a wa.me link and mark it sent; an API channel
-- (WhatsApp Cloud API / SMS) can deliver it automatically - see services/messaging.js.
CREATE TABLE messages (
  id           SERIAL PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('birthday', 'anniversary', 'notice', 'custom')),
  member_id    INTEGER REFERENCES members(id) ON DELETE SET NULL,
  household_id INTEGER REFERENCES households(id) ON DELETE SET NULL,
  notice_id    INTEGER REFERENCES notices(id) ON DELETE SET NULL,
  recipient    TEXT NOT NULL,                -- name shown in the outbox
  phone        TEXT NOT NULL,
  body         TEXT NOT NULL,
  for_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error        TEXT,
  sent_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One birthday / anniversary wish per person per day, however often the daily job runs.
CREATE UNIQUE INDEX messages_daily_unique ON messages (kind, member_id, for_date)
  WHERE kind IN ('birthday', 'anniversary');
CREATE INDEX messages_status_idx ON messages (status, for_date);

-- Editable office details and message templates (key/value).
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('office_name', 'नगरसेवक कार्यालय'),
  ('ward_label', 'प्रभाग क्र. —, नगर परिषद'),
  ('office_address', ''),
  ('office_phone', ''),
  ('sender_name', 'आपला नगरसेवक'),
  ('template_birthday', '{name}, वाढदिवसाच्या हार्दिक शुभेच्छा! 🎂 आपणास उत्तम आरोग्य व दीर्घायुष्य लाभो. — {sender}'),
  ('template_anniversary', '{name}, लग्नाच्या वाढदिवसाच्या हार्दिक शुभेच्छा! 💐 आपले सहजीवन सुखाचे जावो. — {sender}'),
  ('template_notice', '📢 {title}\n{body}\n— {sender}');
