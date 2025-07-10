import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import api from '../lib/api';
import { getLocalStorage, setLocalStorage } from '../lib/storage';

interface SystemStatus {
  networkConnected: boolean;
  authValid: boolean;
  printerConnected: boolean;
  appUpToDate: boolean;
  localNodeUrl: string;
}

interface InitContextType {
  isInitialized: boolean;
  isInitializing: boolean;
  shouldShowLogin: boolean;
  systemStatus: SystemStatus;
  completeInitialization: (shouldShowLogin: boolean) => void;
  resetInitialization: () => void;
  updateServerUrl: (url: string) => Promise<boolean>;
}

const InitContext = createContext<InitContextType>({
  isInitialized: false,
  isInitializing: true,
  shouldShowLogin: false,
  systemStatus: {
    networkConnected: false,
    authValid: false,
    printerConnected: false,
    appUpToDate: false,
    localNodeUrl: '' // No default URL - will be discovered
  },
  completeInitialization: () => {},
  resetInitialization: () => {},
  updateServerUrl: async () => false,
});

export const useInit = () => {
  const context = useContext(InitContext);
  if (!context) {
    throw new Error('useInit must be used within an InitProvider');
  }
  return context;
};

interface InitProviderProps {
  children: ReactNode;
}

export const InitProvider: React.FC<InitProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [shouldShowLogin, setShouldShowLogin] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    networkConnected: false,
    authValid: false,
    printerConnected: false,
    appUpToDate: false,
    localNodeUrl: getLocalStorage('serverUrl') || '' // Use saved URL or empty string
  });

  // Initialize API with saved server URL on startup
  useEffect(() => {
    const savedUrl = getLocalStorage('serverUrl');
    if (savedUrl) {
      const baseUrl = savedUrl.replace(/\/api$/, '');
      api.setConfig({ baseUrl: `${baseUrl}/api` });
    }
  }, []);

  const updateServerUrl = async (url: string): Promise<boolean> => {
    try {
      console.log('🔍 Updating server URL to:', url);
      
      // Normalize URL (ensure it ends with /api)
      const baseUrl = url.replace(/\/api$/, '');
      const apiUrl = `${baseUrl}/api`;
      
      console.log('🔍 Normalized API URL:', apiUrl);
      
      // Update API config with new URL
      api.setConfig({ baseUrl: apiUrl });
      
      // Test connection using proxy first
      console.log('🔍 Testing connection via proxy...');
      const isConnectedViaProxy = await api.checkConnectionViaProxy(baseUrl);
      
      if (isConnectedViaProxy) {
        console.log('🔍 Connection successful via proxy');
        // Save URL if connection successful
        setLocalStorage('serverUrl', apiUrl);
        setSystemStatus(prev => ({
          ...prev,
          networkConnected: true,
          localNodeUrl: apiUrl
        }));
        console.log('🔍 Server URL updated successfully');
        return true;
      }
      
      // Fallback to original method
      console.log('🔍 Proxy failed, trying original method...');
      const isConnected = await api.checkConnection();
      
      console.log('🔍 Connection test result:', isConnected);
      
      if (isConnected) {
        // Save URL if connection successful
        setLocalStorage('serverUrl', apiUrl);
        setSystemStatus(prev => ({
          ...prev,
          networkConnected: true,
          localNodeUrl: apiUrl
        }));
        console.log('🔍 Server URL updated successfully');
        return true;
      } else {
        console.log('🔍 Connection test failed');
        return false;
      }
    } catch (error) {
      console.error('🔍 Error updating server URL:', error);
      return false;
    }
  };

  const completeInitialization = (shouldShowLogin: boolean) => {
    setShouldShowLogin(shouldShowLogin);
    setIsInitialized(true);
    setIsInitializing(false);
    
    // Update system status based on initialization results
    setSystemStatus(prev => ({
      ...prev,
      networkConnected: true, // We'll assume network is connected if init completes
      authValid: !shouldShowLogin,
      printerConnected: true,
      appUpToDate: Math.random() > 0.05, // Simulate update check
    }));
  };

  const resetInitialization = () => {
    setIsInitialized(false);
    setIsInitializing(true);
    setShouldShowLogin(false);
    setSystemStatus(prev => ({
      ...prev,
      networkConnected: false,
      authValid: false,
    }));
  };

  const value: InitContextType = {
    isInitialized,
    isInitializing,
    shouldShowLogin,
    systemStatus,
    completeInitialization,
    resetInitialization,
    updateServerUrl,
  };

  return (
    <InitContext.Provider value={value}>
      {children}
    </InitContext.Provider>
  );
}; 