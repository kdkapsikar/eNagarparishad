const STYLES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-amber-200 bg-amber-50 text-amber-900',
};

export default function Alert({ kind = 'info', children }) {
  if (!children) return null;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${STYLES[kind]}`}>
      {children}
    </div>
  );
}
