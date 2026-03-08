import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const defaults = {
  portal_title: 'SMART360: Ai Edition',
  institution_name: 'MRSMKU',
};

const PortalConfigContext = createContext(defaults);

export function PortalConfigProvider({ children }) {
  const [config, setConfig] = useState(defaults);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/public/settings/portal')
      .then((res) => {
        if (cancelled || !res.data) return;
        setConfig({
          portal_title: res.data.portal_title || defaults.portal_title,
          institution_name: res.data.institution_name || defaults.institution_name,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <PortalConfigContext.Provider value={config}>
      {children}
    </PortalConfigContext.Provider>
  );
}

export function usePortalConfig() {
  return useContext(PortalConfigContext) || defaults;
}
