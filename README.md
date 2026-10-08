# e-नगरपरिषद (e-Nagarparishad)

A ward outreach portal for a corporator's office (नगरसेवक कार्यालय), **Marathi first**, built for residents
in small towns and rural areas. It digitises the office's two paper survey forms, adds a **Marathi voice
bot** that collects the same information one question at a time, sends daily birthday / anniversary wishes
and electricity / water notices, lists government schemes, and takes birth / death certificate requests.

**Stack:** React (Vite) · Tailwind CSS v4 · Node.js + Express 5 · PostgreSQL. Same structure and hosting as
WardWatch: web app on GitHub Pages, API on Render, database on Neon.

| Requirement | Where it lives |
| --- | --- |
| 1. Voter / ward member data collection (Aadhaar, PAN, name, contact, address, DOB...) | **Staff → कुटुंबे** form mirroring both paper forms ([docs/FORMS.md](docs/FORMS.md)); the **voice bot** (staff and public); **Excel / CSV upload** of data already collected offline |
| 2. Data management & daily reminders (birthday, anniversary wishes) | Families list with search / area filter / Excel export; **Dashboard** shows today's birthdays and anniversaries; the **Messages** outbox prepares each wish every day |
| 3. Electricity & water notifications | **Staff → सूचना** to publish outages / supply timings (whole ward or one area); public **वीज-पाणी सूचना** page; **Messages → broadcast** sends a notice to every family |
| 4. Government schemes | Public **शासकीय योजना** list + detail (benefits, eligibility, documents, how to apply, official link, "read aloud"); **Staff → योजना** to add / edit. 8 starter schemes are included - review them first |
| 5. Birth & death certificates | Public request form + tracking by request number and mobile; **Staff → दाखला अर्ज** to update status. See [Certificates](#birth--death-certificates) for what this does *not* do |

Who uses it:

| Who | What they can do |
| --- | --- |
| **Resident** (no login) | Register their own family through the voice bot, read notices and schemes, request a certificate and track it |
| **Volunteer / karyakarta** (`volunteer`) | Survey families with the bot or the form (works offline, syncs later), search and edit families, upload Excel data, send the day's wishes from WhatsApp |
| **Office admin** (`admin`) | Everything above, plus notices, broadcasts, schemes, certificate status, Excel export, office details, message templates and user accounts |

## Quick start

Requires **Node 20+** and **PostgreSQL 14+**.

```bash
git clone https://github.com/kdkapsikar/e-nagarparishad.git && cd e-nagarparishad
npm install

createdb enagar && createdb enagar_test        # or use any Postgres you already have
cp server/.env.example server/.env              # defaults point at localhost

npm run migrate
npm run seed                                     # dev only: 2 logins, 3 families, 2 notices
npm run dev                                      # API :3002, web app :5174
```

Open <http://localhost:5174>. Demo logins (development only - the seed refuses to run in production):

| Role | Username | Password |
| --- | --- | --- |
| Office admin | `admin` | `admin12345` |
| Volunteer | `volunteer1` | `volunteer123` |

`npm test` runs the API integration tests (against `TEST_DATABASE_URL`, which it **truncates**) and the bot
conversation tests.

## सेवा भाऊ - the voice assistant

A friendly village elder - saffron फेटा with its शेमला, गंध on the forehead, a proper मिशी, white kurta and
उपरणं - floats at the bottom-right of every public page. He greets people with a "राम राम मंडळी!" bubble
and a wave, does नमस्कार while waiting, holds the chat panel up when it is open, and **moves his mouth while
the voice is speaking**. He talks in everyday rural Marathi ("घरातले कर्ते कोण?", "शेतीवाडी आहे का?",
"लय भारी!"). He is drawn as an inline SVG and animated with CSS ([client/src/bot/Mascot.jsx](client/src/bot/Mascot.jsx)),
so there are no images to load and motion stops for people who turn on "reduce motion".

What he can do from his menu (tap a chip, type, or say it - "लाईट कधी येणार?", "शेतीसाठी काही योजना आहे का?"):

| Menu | In the chat |
| --- | --- |
| 📝 कुटुंब नोंदणी | The full family registration (below) |
| 💡 लाईट-पाणी सूचना | Reads out the latest power / water notices, with a link to all of them |
| 🏛️ सरकारी योजना | Searches schemes by what you say (copes with Marathi endings: "शेतीसाठी" → शेती), or by category / "new" |
| 📜 जन्म-मृत्यू दाखला | Link to apply, or asks the request number and mobile and tells you the status |
| 📞 कार्यालयाचा संपर्क | Office address and a tap-to-call link |

Registration asks the paper-form questions one at a time, starting with **consent**. Follow-ups only
appear when they apply (farm details only if the family has a farm, PAN / voter ID only for adults, gender
is inferred from "पत्नी", "मुलगा"...). It shows a typing indicator and short acknowledgements ("बरं.",
"हो, लिहून घेतलं."), offers **Skip** and **Back**, and ends with a summary you can correct before saving.
An unfinished registration survives a reload (kept on the device).

- **Voice out:** each turn is read aloud (🔊 toggle, 🔈 replay) with the phone's Marathi text-to-speech
  voice, falling back to a Hindi voice with a hint to install Marathi in *Settings → Google Text-to-speech*.
- **Voice in:** 🎤 uses the browser's speech recognition in `mr-IN`. Menu requests, yes/no and choices are
  acted on at once ("ती माझी बायको आहे" → पत्नी); names and addresses are put in the box so the person can
  check them first. Spoken digits ("नऊ आठ सात..."), Marathi numerals and dates such as "१५ जून १९७५" work.
- `/register` opens straight into registration (a link to share on WhatsApp); the home page button opens
  the floating सेवा भाऊ into registration. Residents' entries arrive **unverified** for staff to check.
- **Staff → बॉटद्वारे माहिती** is the same bot for volunteers, without the menu. Without network the family
  is saved on the phone and sent later with **Sync**.

Voice uses the browser's built-in Web Speech API - free, no server. Speech recognition works in Chrome /
Edge (Android and desktop); in Firefox and on many iPhones the mic button is hidden and tapping / typing
still work. Recognition audio is processed by the browser vendor's speech service.
Code: [client/src/bot/](client/src/bot/).

## Uploading offline data

**Staff → जुनी माहिती अपलोड**: download the Excel template, copy the paper forms into it (one row per person,
the same **कुटुंब क्र.** for everyone in a family, family details once on the family's first row), then
**Check file**. The check lists every problem by row and column; **Save** then imports the valid families
and skips ones already in the system (same head of family + mobile). Existing spreadsheets work if their
headings use the template's names in Marathi or English; `.xlsx` and `.csv` (with Marathi text) are both
accepted. The Excel **export** uses the same columns, so an export can be corrected and re-uploaded.

Accepted values: dates as `15/06/1975`, `15-6-75` or real Excel dates; होय/नाही or yes/no; gender पुरुष /
स्त्री / इतर (or M/F); categories खुला, इमाव/OBC, अजा/SC, अज/ST, विजा/भज, विमाप्र, SEBC, आदुघ/EWS. Full
12-digit Aadhaar numbers are accepted and cut to the last 4 digits on the way in.

## Daily wishes and notices

Every day after `REMINDER_HOUR` (07:00 India time by default) - and on every dashboard / messages load, so
it still happens when the free host has been asleep - the server writes one birthday or anniversary wish
per person to the **Messages** outbox, using the templates in **Settings** (`{name}`, `{sender}`). Each
person gets one wish per day however often this runs. A person without their own mobile is wished on the
family's WhatsApp / mobile number. 29 February birthdays are wished on 28 February in other years.

Notices are published on the public site, and **Messages → broadcast** queues one message per family (to
its WhatsApp number, else mobile) for the whole ward or one area.

**How messages are sent - `MESSAGE_CHANNEL=manual` (default):** the volunteer taps **WhatsApp** (or SMS) on
each message; WhatsApp opens with the text filled in, they press send, and the message moves to *Sent*.
No API account, template approval or cost, and messages come from a number residents already know.
Automatic sending is a small addition in [server/src/services/messaging.js](server/src/services/messaging.js),
but needs paperwork first: WhatsApp Business (Cloud) API needs a verified business, pre-approved templates
and opted-in recipients; bulk SMS in India needs DLT registration of the sender and every template.

## Birth / death certificates

The portal collects the request (name, date, place, parents, applicant and mobile), gives a request number
such as `JN-26-4F7K2Q`, lists the documents to bring, and lets the applicant track status by number +
mobile. Staff move it through *received → documents needed → sent to registrar → ready → delivered* (or
rejected, with a reason) and can WhatsApp the applicant the new status.

It **does not issue certificates**. Births and deaths are registered and certificates issued by the
municipal Registrar through the Government of India's Civil Registration System (CRS). Integrating with
CRS / the Nagar Parishad's system needs authorisation from the registrar and the state; until then the
office forwards each request and records the registrar's registration number here.

## Privacy and data protection

This system holds personal data of residents, so read [docs/PRIVACY.md](docs/PRIVACY.md) before going live.
In short: consent is captured for every family; **only the last 4 digits of Aadhaar** are ever stored;
PAN is encrypted at rest (AES-256-GCM, `DATA_ENCRYPTION_KEY`) and shown masked except in the admin-only
Excel export; caste/category are optional and the bot says so; residents' self-registrations stay out of
broadcasts until checked; the scans of the paper forms are kept out of git.

## Deploying (GitHub Pages + Render + Neon - all free tiers)

```
Browser ── https://kdkapsikar.github.io/e-nagarparishad/   (GitHub Pages: the React app)
   └────── https://e-nagarparishad-api.onrender.com/api/... (Render: Express API)
                     └── Neon Postgres
```

1. **Database.** Create a Neon project and copy the **direct** connection string (host without `-pooler`),
   ending in `?sslmode=require`.
2. **Schema + first admin** from your machine:
   ```bash
   export DATABASE_URL='postgres://...neon...?sslmode=require'
   npm run migrate
   npm run user:create -w server -- office admin "कार्यालय प्रमुख"     # prints a generated password
   ```
3. **API on Render.** New → Blueprint → this repo ([render.yaml](render.yaml)). Fill in `DATABASE_URL`,
   `DATA_ENCRYPTION_KEY` (generate with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and **keep a copy** - PANs
   cannot be decrypted without it) and `CORS_ORIGINS=https://kdkapsikar.github.io`.
4. **Web app on GitHub Pages.** Repo Settings → Pages → Source: *GitHub Actions*. Settings → Secrets and
   variables → Actions → **Variables** → `API_URL` = your Render URL. Push to `main` (or run the *Deploy web
   app* workflow).
5. Sign in, open **Settings** and fill in the office name, ward, address, phone and the name to sign
   messages with; review the starter **schemes**; create volunteer accounts.

**Single server instead:** `npm run build && npm start` serves the built web app and the API from one
origin (set `NODE_ENV=production`, `DATABASE_URL`, `DATA_ENCRYPTION_KEY`; no CORS or `API_URL` needed).

## Configuration (server/.env)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | – | Postgres connection string (required) |
| `DATA_ENCRYPTION_KEY` | dev-only key | 64 hex chars; encrypts PAN. Required in production |
| `API_PORT` / `PORT` | 3002 | API port (`API_PORT` wins; Render sets `PORT`) |
| `CORS_ORIGINS` | – | Web-app origins allowed to call the API (GitHub Pages setup) |
| `TZ_NAME` | `Asia/Kolkata` | Time zone for "today" and the reminder hour |
| `REMINDER_HOUR` | 7 | Hour after which the day's wishes are prepared |
| `MESSAGE_CHANNEL` | `manual` | `manual` (WhatsApp links) or `log` (print, for development) |
| `SESSION_TTL_HOURS` | 12 | Login session length |
| `TRUST_PROXY` | 0 | Proxy hops in front of the API (1 on Render) |

## Project layout

```
server/  Express API          db/migrations/*.sql  src/routes  src/services (households, importer, messaging)
client/  React app            src/bot (voice bot)  src/pages/public  src/pages/staff  src/i18n/strings.js
docs/    FORMS.md (paper form → fields), PRIVACY.md
```

## Known limitations / next steps

- The Marathi text (UI and bot questions) was written by an AI assistant - have a native speaker review
  [client/src/i18n/strings.js](client/src/i18n/strings.js) and the starter schemes before launch.
- Messages are sent by hand from WhatsApp (see above); automatic WhatsApp / SMS needs the approvals noted.
- No OCR of paper-form photos yet - offline data comes in through the Excel template.
- Certificate requests are tracked here but issued through CRS (no integration yet).
- The offline queue for volunteers lives in the phone's browser storage - sync before clearing it.
