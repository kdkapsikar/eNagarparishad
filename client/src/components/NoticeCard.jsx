import { useT } from '../i18n/LanguageContext.jsx';
import { formatDateTime } from '../lib/format.js';

const ICON = { electricity: '⚡', water: '💧', general: '📢' };
const TONE = {
  electricity: 'border-amber-300 bg-amber-50',
  water: 'border-sky-300 bg-sky-50',
  general: 'border-stone-200 bg-white',
};

export default function NoticeCard({ notice }) {
  const { t } = useT();
  return (
    <article className={`rounded-xl border-l-4 border px-4 py-3 ${TONE[notice.kind]}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
        <span className="chip bg-white/70 text-stone-700">{ICON[notice.kind]} {t(`notice.kind.${notice.kind}`)}</span>
        <span>{notice.area || t('notice.wholeWard')}</span>
      </div>
      <h3 className="mt-1 text-lg font-semibold text-stone-900">{notice.title}</h3>
      <p className="whitespace-pre-line text-stone-700">{notice.body}</p>
      {(notice.starts_at || notice.ends_at) && (
        <p className="mt-1 text-sm text-stone-600">
          🕒 {notice.starts_at && formatDateTime(notice.starts_at)}{notice.ends_at && ` — ${formatDateTime(notice.ends_at)}`}
        </p>
      )}
    </article>
  );
}
