# Privacy and data protection notes

This portal stores personal data of residents - names, dates of birth, phone numbers, addresses, caste /
category, voter ID, PAN and partial Aadhaar - collected by a political representative's office. That brings
legal duties. These notes describe what the software does; they are not legal advice, and the office
should confirm its obligations with a lawyer before going live.

## What the software does

- **Consent first.** The bot's first question asks for consent and stops if the answer is no; the staff
  form and the Excel upload both require a consent tick. `consent_at` records when it was given.
- **Aadhaar: last 4 digits only.** Under the Aadhaar Act, 2016 (and UIDAI regulations) only authorised
  entities may collect and store Aadhaar numbers, and those that do must keep them in an "Aadhaar Data
  Vault". This system is not such an entity, so it never stores the full number - a 12-digit number typed,
  spoken or uploaded is cut to its last 4 digits before it reaches the database (tests check this).
- **PAN encrypted at rest** with AES-256-GCM. Screens show `XXXXXX234F`; only the admin's Excel export
  decrypts it. Keep `DATA_ENCRYPTION_KEY` secret and backed up.
- **Caste and category are optional**; the bot says the person may skip them.
- **Self-registrations are unverified** until staff check them, and receive no broadcasts until then.
- **Access control:** volunteers can collect and edit families; export, deletion, notices, schemes, user
  accounts and certificate status are admin-only. Passwords are bcrypt-hashed; sessions are opaque tokens
  stored only as hashes and are revoked when a user is deactivated.
- **No full data in URLs**, no third-party analytics; the only external resources are Google Fonts and the
  browser's own speech service (when the microphone is used).
- **Paper-form scans are git-ignored.**

## What the office needs to do

- **Digital Personal Data Protection Act, 2023 (DPDP).** The office is the *data fiduciary*: give a clear
  notice of what is collected and why, use the data only for that purpose, let people see / correct /
  erase their data, keep it secure, and report breaches. The consent text in the bot and form
  (`bot.q.consent`, `form.consent` in `client/src/i18n/strings.js`) should match the office's actual notice.
- **Use limits.** Data gathered for ward services should not be repurposed (e.g. for election canvassing)
  without consent for that purpose. During an election period, check the Model Code of Conduct and the
  Election Commission's rules on messaging and on the use of voter data.
- **Messaging rules.** WhatsApp Business API requires opted-in recipients and approved templates; bulk SMS
  requires TRAI DLT registration. The default manual mode (staff send from their own WhatsApp) avoids bulk
  sending but residents must still be able to opt out - remove or edit their number when asked.
- **Retention.** Decide how long records are kept and delete families who ask (admin → family → delete).
- **Accounts.** Give each volunteer their own login, deactivate it when they leave, and use strong
  passwords. Keep database backups encrypted.
