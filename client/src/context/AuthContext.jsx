import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: Boolean(tokenStore.get()), user: null });

  useEffect(() => {
    if (!tokenStore.get()) return;
    api.me()
      .then(({ user }) => {
        if (!user) tokenStore.clear(); // expired or revoked token
        setState({ loading: false, user });
      })
      .catch(() => setState({ loading: false, user: null }));
  }, []);

  const login = useCallback(async (credentials) => {
    const { user } = await api.login(credentials);
    setState({ loading: false, user });
    return user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setState({ loading: false, user: null });
  }, []);

  const value = useMemo(() => ({ ...state, isAdmin: state.user?.role === 'admin', login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
