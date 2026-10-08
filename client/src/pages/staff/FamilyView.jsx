import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { ageFrom, formatDate, formatDateTime, whatsappLink } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';

export default function FamilyView() {
  const { t } = useT();
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, loading, reload } = useApi(() => api.household(id), [id]);
  const [actionError, setActionError] = useState(null);
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error.message}</Alert>;
  const h = data.household;
  const yn = (v) => (v === true ? t('common.yes') : v === false ? t('common.no') : '—');
  const contact = h.whatsapp || h.mobile;

  const verify = () => api.verifyHousehold(id).then(reload).catch((e) => setActionError(e.message));
  const remove = async () => {
    if (!window.confirm(t('family.deleteConfirm', { name: h.head_name }))) return;
    try {
      await api.deleteHousehold(id);
      navigate('/staff/families', { replace: true });
    } catch (e) {
      setActionError(e.message);
    }
  };

  const details = [
    [t('field.mobile'), h.mobile], [t('field.whatsapp'), h.whatsapp], [t('field.address'), h.address], [t('field.area'), h.area],
    [t('field.category'), h.category && t(`category.${h.category}`)], [t('field.caste'), h.caste], [t('field.farmDetails'), h.farm_details],
    [t('field.disabilityDetails'), h.disability], [t('field.internet'), yn(h.has_internet)], [t('field.waterFilter'), yn(h.has_water_filter)],
    [t('field.anganwadi'), yn(h.has_anganwadi)], [t('field.gharkul'), yn(h.gharkul_benefit)], [t('field.otherIssues'), h.other_issues],
  ];

  return (
    <div className="space-y-5">
      <Link to="/staff/families" className="text-sm font-medium text-brand-700">← {t('families.title')}</Link>
      {location.state?.saved && <Alert kind="success">{t('family.saved')}</Alert>}
      <Alert kind="error">{actionError}</Alert>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{h.head_name}</h1>
          <p className="text-sm text-stone-500">
            {t(`source.${h.source}`)} · {formatDateTime(h.created_at)}{h.created_by_name && ` · ${h.created_by_name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!h.verified && <button type="button" className="btn btn-primary" onClick={verify}>✓ {t('family.verify')}</button>}
          {contact && <a className="btn btn-secondary" href={whatsappLink(contact, '')} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          <Link to={`/staff/families/${id}/edit`} className="btn btn-secondary">{t('common.edit')}</Link>
          {isAdmin && <button type="button" className="btn btn-danger" onClick={remove}>{t('common.delete')}</button>}
        </div>
      </div>
      {!h.verified && <Alert kind="info">{t('family.unverifiedNote')}</Alert>}

      <section className="card p-5">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-stone-500">{k}</dt>
              <dd className="text-stone-900">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('form.membersSection')} ({h.members.length})</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-stone-50 text-xs text-stone-500">
              <tr>
                {['#', 'field.name', 'field.relation', 'field.dob', 'field.gender', 'field.education', 'field.occupation', 'field.mobile', 'field.aadhaar', 'field.voterId', 'field.pan']
                  .map((k) => <th key={k} className="px-3 py-2 font-medium">{k === '#' ? t('family.serial') : t(k)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {h.members.map((m, i) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2">{m.relation}</td>
                  <td className="px-3 py-2">{m.dob && `${formatDate(m.dob)} (${ageFrom(m.dob)})`}</td>
                  <td className="px-3 py-2">{m.gender && t(`gender.${m.gender}`)}</td>
                  <td className="px-3 py-2">{m.education}</td>
                  <td className="px-3 py-2">{m.occupation}</td>
                  <td className="px-3 py-2">{m.mobile}</td>
                  <td className="px-3 py-2">{m.aadhaar_last4 && `XXXX ${m.aadhaar_last4}`}</td>
                  <td className="px-3 py-2">{m.voter_id}</td>
                  <td className="px-3 py-2">{m.pan_masked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
