import { useCallback, useEffect, useState } from 'react';

/** Load data on mount (and when deps change). Returns { data, error, loading, reload }. */
export function useApi(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return load()
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  }, [load]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
