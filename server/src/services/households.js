import { query, withTransaction } from '../db/pool.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { HttpError } from '../lib/httpError.js';

const HOUSEHOLD_FIELDS = [
  'head_name', 'mobile', 'whatsapp', 'address', 'area', 'caste', 'category', 'farm_details', 'disability',
  'has_internet', 'has_water_filter', 'has_anganwadi', 'gharkul_benefit', 'other_issues',
];

const toDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ?? null);

/** What staff screens see: PAN masked, Aadhaar only ever its last 4 digits. */
export function serializeMember(row) {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    relation: row.relation,
    dob: toDate(row.dob),
    anniversary: toDate(row.anniversary),
    gender: row.gender,
    education: row.education,
    occupation: row.occupation,
    mobile: row.mobile,
    aadhaar_last4: row.aadhaar_last4,
    pan_masked: row.pan_last4 ? `XXXXXX${row.pan_last4}` : null,
    voter_id: row.voter_id,
  };
}

async function insertMembers(client, householdId, members, firstPosition = 1) {
  for (const [index, m] of members.entries()) {
    await client.query(
      `INSERT INTO members (household_id, position, name, relation, dob, anniversary, gender, education, occupation,
                            mobile, aadhaar_last4, pan_enc, pan_last4, voter_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [householdId, firstPosition + index, m.name, m.relation, m.dob, m.anniversary, m.gender, m.education, m.occupation,
        m.mobile, m.aadhaar, encrypt(m.pan), m.pan ? m.pan.slice(-4) : null, m.voter_id],
    );
  }
}

/**
 * Insert one validated household (see householdSchema) with its members. Pass `client` to take part in
 * an outer transaction (the importer does); otherwise one is opened here.
 */
export async function createHousehold(data, { source, verified = true, userId = null, batchId = null, client } = {}) {
  const run = async (c) => {
    const { rows } = await c.query(
      `INSERT INTO households (${HOUSEHOLD_FIELDS.join(', ')}, consent, consent_at, source, verified, created_by, import_batch_id)
       VALUES (${HOUSEHOLD_FIELDS.map((_, i) => `$${i + 1}`).join(', ')}, true, now(),
               $${HOUSEHOLD_FIELDS.length + 1}, $${HOUSEHOLD_FIELDS.length + 2}, $${HOUSEHOLD_FIELDS.length + 3}, $${HOUSEHOLD_FIELDS.length + 4})
       RETURNING id`,
      [...HOUSEHOLD_FIELDS.map((f) => data[f]), source, verified, userId, batchId],
    );
    await insertMembers(c, rows[0].id, data.members);
    return rows[0].id;
  };
  return client ? run(client) : withTransaction(run);
}

/**
 * Replace a household's details. Members carrying an `id` are updated in place (so message history stays
 * linked); members without one are added; members missing from the list are removed. A blank PAN keeps
 * the stored one unless `pan_clear` is set, because the edit form only ever sees the masked value.
 */
export async function updateHousehold(id, data) {
  return withTransaction(async (c) => {
    const found = await c.query('SELECT id FROM households WHERE id = $1 FOR UPDATE', [id]);
    if (!found.rows[0]) throw new HttpError(404, 'not_found', 'Family not found');
    await c.query(
      `UPDATE households SET ${HOUSEHOLD_FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = now()
        WHERE id = $1`,
      [id, ...HOUSEHOLD_FIELDS.map((f) => data[f])],
    );

    const existing = await c.query('SELECT id FROM members WHERE household_id = $1', [id]);
    const existingIds = new Set(existing.rows.map((r) => r.id));
    const keptIds = data.members.filter((m) => m.id && existingIds.has(m.id)).map((m) => m.id);
    await c.query('DELETE FROM members WHERE household_id = $1 AND NOT (id = ANY($2::int[]))', [id, keptIds]);

    for (const [index, m] of data.members.entries()) {
      if (m.id && existingIds.has(m.id)) {
        const panSql = m.pan ? ', pan_enc = $13, pan_last4 = $14' : m.pan_clear ? ', pan_enc = NULL, pan_last4 = NULL' : '';
        const params = [m.id, index + 1, m.name, m.relation, m.dob, m.anniversary, m.gender, m.education, m.occupation,
          m.mobile, m.aadhaar, m.voter_id];
        if (m.pan) params.push(encrypt(m.pan), m.pan.slice(-4));
        await c.query(
          `UPDATE members SET position = $2, name = $3, relation = $4, dob = $5, anniversary = $6, gender = $7,
                  education = $8, occupation = $9, mobile = $10, aadhaar_last4 = $11, voter_id = $12${panSql}
            WHERE id = $1`,
          params,
        );
      } else {
        await insertMembers(c, id, [m], index + 1);
      }
    }
  });
}

export async function getHousehold(id) {
  const { rows } = await query(
    `SELECT h.*, u.name AS created_by_name
       FROM households h LEFT JOIN users u ON u.id = h.created_by
      WHERE h.id = $1`,
    [id],
  );
  const h = rows[0];
  if (!h) throw new HttpError(404, 'not_found', 'Family not found');
  const members = await query('SELECT * FROM members WHERE household_id = $1 ORDER BY position, id', [id]);
  return {
    id: h.id,
    ...Object.fromEntries(HOUSEHOLD_FIELDS.map((f) => [f, h[f]])),
    source: h.source,
    verified: h.verified,
    consent_at: h.consent_at,
    created_by_name: h.created_by_name,
    created_at: h.created_at,
    updated_at: h.updated_at,
    members: members.rows.map(serializeMember),
  };
}

const PAGE_SIZE = 25;

export async function listHouseholds({ q, area, verified, page = 1 }) {
  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(lower(h.head_name) LIKE ${p} OR h.mobile LIKE ${p} OR h.whatsapp LIKE ${p} OR lower(h.address) LIKE ${p}
      OR EXISTS (SELECT 1 FROM members m WHERE m.household_id = h.id
                 AND (lower(m.name) LIKE ${p} OR m.mobile LIKE ${p} OR lower(m.voter_id) LIKE ${p})))`);
  }
  if (area) {
    params.push(area);
    where.push(`h.area = $${params.length}`);
  }
  if (verified === 'false') where.push('NOT h.verified');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await query(`SELECT count(*)::int AS n FROM households h ${whereSql}`, params);
  params.push(PAGE_SIZE, (Math.max(1, page) - 1) * PAGE_SIZE);
  const { rows } = await query(
    `SELECT h.id, h.head_name, h.mobile, h.whatsapp, h.area, h.address, h.source, h.verified, h.created_at,
            (SELECT count(*)::int FROM members m WHERE m.household_id = h.id) AS member_count
       FROM households h ${whereSql}
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { households: rows, total: total.rows[0].n, page, pageSize: PAGE_SIZE };
}

export async function listAreas() {
  const { rows } = await query(
    `SELECT area, count(*)::int AS households FROM households WHERE area IS NOT NULL GROUP BY area ORDER BY area`,
  );
  return rows;
}

/** Full data export for the office (admin only) - the one place PAN is decrypted. */
export async function exportRows() {
  const { rows } = await query(
    `SELECT h.id AS household_id, h.head_name, h.mobile AS h_mobile, h.whatsapp, h.address, h.area, h.caste, h.category,
            h.farm_details, h.disability, h.has_internet, h.has_water_filter, h.has_anganwadi, h.gharkul_benefit,
            h.other_issues, m.name, m.relation, m.dob, m.anniversary, m.gender, m.education, m.occupation,
            m.mobile, m.aadhaar_last4, m.pan_enc, m.voter_id
       FROM households h LEFT JOIN members m ON m.household_id = h.id
      ORDER BY h.id, m.position, m.id`,
  );
  return rows.map(({ pan_enc: panEnc, ...r }) => ({ ...r, pan: decrypt(panEnc), dob: toDate(r.dob), anniversary: toDate(r.anniversary) }));
}

/** A household with the same head name and mobile already exists (used to skip duplicate imports). */
export async function findDuplicate(c, { head_name: headName, mobile }) {
  if (!mobile) return null;
  const { rows } = await c.query(
    'SELECT id FROM households WHERE lower(head_name) = lower($1) AND (mobile = $2 OR whatsapp = $2) LIMIT 1',
    [headName, mobile],
  );
  return rows[0]?.id ?? null;
}
