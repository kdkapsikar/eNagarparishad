import { useState } from 'react';
import { api } from '../../api/client.js';
import Alert from '../../components/ui/Alert.jsx';
import { useT } from '../../i18n/LanguageContext.jsx';
import { formatDateTime } from '../../lib/format.js';
import { useApi } from '../../lib/useApi.js';

export default function Import() {
  const { t } = useT();
  const [file, setFile] = useState(null);
  const [consent, setConsent] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const batches = useApi(() => api.importBatches());

  const run = async (commit) => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('commit', String(commit));
    form.append('consent', String(consent));
    try {
      const result = await api.importFile(form);
      setReport(result);
      if (commit) batches.reload();
    } catch (err) {
      setError(err.fields?.consent ?? err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="page-title">{t('import.title')}</h1>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">1. {t('import.step1')}</h2>
        <p className="text-sm text-stone-600">{t('import.step1Text')}</p>
        <button type="button" className="btn btn-secondary" onClick={() => api.importTemplate().catch((e) => setError(e.message))}>⬇ {t('import.template')}</button>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">2. {t('import.step2')}</h2>
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => { setFile(e.target.files[0] ?? null); setReport(null); }}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-700"
        />
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {t('import.consent')}
        </label>
        <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={() => run(false)}>{busy ? t('common.loading') : t('import.check')}</button>
      </section>

      <Alert kind="error">{error}</Alert>

      {report && (
        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">3. {t('import.step3')}</h2>
          {report.preview ? (
            <p>{t('import.summary', { rows: report.rows, households: report.households, members: report.members })}</p>
          ) : (
            <Alert kind="success">
              {t('import.done', { households: report.saved.households, members: report.saved.members })}
              {report.saved.duplicates.length > 0 && ` ${t('import.duplicates', { n: report.saved.duplicates.length })}`}
            </Alert>
          )}
          {report.errorCount > 0 && (
            <>
              <Alert kind="info">{t('import.errors', { n: report.errorCount })}</Alert>
              <div className="max-h-80 overflow-auto rounded-lg border border-stone-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-stone-50 text-xs text-stone-500">
                    <tr><th className="px-3 py-2">{t('import.row')}</th><th className="px-3 py-2">{t('import.column')}</th><th className="px-3 py-2">{t('import.problem')}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {report.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{e.row}</td>
                        <td className="px-3 py-1.5">{e.column ? t(`import.col.${e.column}`) : '—'}</td>
                        <td className="px-3 py-1.5">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {report.preview && report.households > 0 && (
            <button type="button" className="btn btn-primary" disabled={busy || !consent} onClick={() => run(true)}>
              {t('import.commit', { n: report.households })}
            </button>
          )}
          {report.preview && !consent && report.households > 0 && <p className="text-sm text-stone-500">{t('import.consentNeeded')}</p>}
        </section>
      )}

      {batches.data?.batches.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">{t('import.history')}</h2>
          <ul className="card divide-y divide-stone-100 text-sm">
            {batches.data.batches.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>{b.filename}</span>
                <span className="text-stone-500">{t('import.batchLine', { households: b.households, members: b.members })} · {formatDateTime(b.created_at)} · {b.created_by_name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
