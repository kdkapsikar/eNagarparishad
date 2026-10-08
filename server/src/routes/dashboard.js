import { Router } from 'express';
import { query } from '../db/pool.js';
import { occasionsOn, prepareDailyMessages, todayInWard } from '../services/messaging.js';

const router = Router();

router.get('/', async (_req, res) => {
  const today = todayInWard();
  await prepareDailyMessages(today);
  const [totals, areas, survey, occasions, pendingMessages, certificates] = await Promise.all([
    query(`SELECT (SELECT count(*)::int FROM households) AS households,
                  (SELECT count(*)::int FROM members) AS members,
                  (SELECT count(*)::int FROM households WHERE NOT verified) AS unverified,
                  (SELECT count(*)::int FROM members WHERE gender = 'male') AS male,
                  (SELECT count(*)::int FROM members WHERE gender = 'female') AS female,
                  (SELECT count(*)::int FROM members WHERE voter_id IS NOT NULL) AS with_voter_id,
                  (SELECT count(*)::int FROM members WHERE dob <= CURRENT_DATE - interval '60 years') AS seniors`),
    query(`SELECT COALESCE(area, '') AS area, count(*)::int AS households FROM households GROUP BY area ORDER BY households DESC LIMIT 12`),
    query(`SELECT count(*) FILTER (WHERE has_internet = false)::int AS no_internet,
                  count(*) FILTER (WHERE has_water_filter = false)::int AS no_water_filter,
                  count(*) FILTER (WHERE has_anganwadi = false)::int AS no_anganwadi,
                  count(*) FILTER (WHERE gharkul_benefit = false)::int AS no_gharkul,
                  count(*) FILTER (WHERE disability IS NOT NULL AND disability !~* '^(नाही|no|none|-)$')::int AS with_disability,
                  count(*) FILTER (WHERE other_issues IS NOT NULL)::int AS with_issues
             FROM households`),
    occasionsOn(today),
    query(`SELECT count(*)::int AS n FROM messages WHERE status = 'pending'`),
    query(`SELECT count(*) FILTER (WHERE status NOT IN ('delivered', 'rejected'))::int AS open FROM certificate_requests`),
  ]);
  res.json({
    today,
    totals: totals.rows[0],
    areas: areas.rows,
    survey: survey.rows[0],
    occasions: occasions.map(({ kind, name, head_name: headName, phone, area }) => ({ kind, name, head_name: headName, area, has_phone: Boolean(phone) })),
    pendingMessages: pendingMessages.rows[0].n,
    openCertificates: certificates.rows[0].open,
  });
});

export default router;
