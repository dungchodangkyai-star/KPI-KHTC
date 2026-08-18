import React, { createContext, useContext, useState, useEffect } from 'react';
import { OrgConfig } from '../types';
import { DEFAULT_ORG_CONFIG } from '../utils';

interface OrgContextType {
  orgConfig: OrgConfig;
  loading: boolean;
  updateOrgConfig: (newConfig: Partial<OrgConfig>) => Promise<{ success: boolean; data?: OrgConfig; error?: string }>;
  resetOrgConfig: () => Promise<{ success: boolean; data?: OrgConfig; error?: string }>;
  refreshOrgConfig: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType>({
  orgConfig: DEFAULT_ORG_CONFIG,
  loading: true,
  updateOrgConfig: async () => ({ success: false }),
  resetOrgConfig: async () => ({ success: false }),
  refreshOrgConfig: async () => {}
});

const STORAGE_KEY = 'kpi_system_org_config';

export const OrgProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orgConfig, setOrgConfig] = useState<OrgConfig>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return { ...DEFAULT_ORG_CONFIG, ...JSON.parse(cached) };
      }
    } catch (e) {
      console.warn("Error reading cached org config:", e);
    }
    return DEFAULT_ORG_CONFIG;
  });

  const [loading, setLoading] = useState(true);

  const fetchOrgConfig = async () => {
    try {
      const res = await fetch('/api/org-config');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const merged = { ...DEFAULT_ORG_CONFIG, ...json.data };
          setOrgConfig(merged);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          } catch (e) {
            console.warn("Error caching org config:", e);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching org config:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgConfig();
  }, []);

  const updateOrgConfig = async (newConfig: Partial<OrgConfig>) => {
    try {
      const payload = { ...orgConfig, ...newConfig };
      const res = await fetch('/api/org-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.data) {
        const merged = { ...DEFAULT_ORG_CONFIG, ...data.data };
        setOrgConfig(merged);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {
          console.warn("Error saving org config to localStorage:", e);
        }
        return { success: true, data: merged };
      }
      return { success: false, error: data.error || 'Không thể lưu cấu hình đơn vị.' };
    } catch (err) {
      console.error("Error updating org config:", err);
      return { success: false, error: String(err) };
    }
  };

  const resetOrgConfig = async () => {
    try {
      const res = await fetch('/api/org-config/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success && data.data) {
        const merged = { ...DEFAULT_ORG_CONFIG, ...data.data };
        setOrgConfig(merged);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {
          console.warn("Error saving org config to localStorage:", e);
        }
        return { success: true, data: merged };
      }
      return { success: false, error: data.error || 'Không thể khôi phục cấu hình đơn vị.' };
    } catch (err) {
      console.error("Error resetting org config:", err);
      return { success: false, error: String(err) };
    }
  };

  return (
    <OrgContext.Provider value={{
      orgConfig,
      loading,
      updateOrgConfig,
      resetOrgConfig,
      refreshOrgConfig: fetchOrgConfig
    }}>
      {children}
    </OrgContext.Provider>
  );
};

export function useOrgConfig() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrgConfig must be used within an OrgProvider');
  }
  return context;
}
