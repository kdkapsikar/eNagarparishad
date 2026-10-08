import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Office name, ward label and contact details (editable by the admin in Settings).
const SettingsContext = createContext({});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  useEffect(() => {
    api.settings().then((d) => setSettings(d.settings)).catch(() => {});
  }, []);
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
