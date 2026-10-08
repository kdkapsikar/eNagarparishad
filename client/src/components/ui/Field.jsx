import { useId } from 'react';
import { useT } from '../../i18n/LanguageContext.jsx';

/** Label + control + error. `children` is a render function receiving the input's id and error state. */
export default function Field({ label, error, optional, hint, className = '', children }) {
  const { t } = useT();
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label} {optional && <span className="font-normal text-stone-400">{t('common.optional')}</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, className: `input${error ? ' input-error' : ''}` })}
      {hint && !error && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
