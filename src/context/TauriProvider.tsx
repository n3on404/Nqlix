import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { UpdateManager } from '../components/UpdateManager';

interface DiscoveredServer {
  ip: string;
  port: number;
  url: string;
  response_time: number;
}

interface NetworkDiscoveryResult {
  servers: DiscoveredServer[];
  total_scanned: number;
  scan_duration_ms: number;
}

interface TauriContextType {
  discoverLocalServers: () => Promise<NetworkDiscoveryResult>;
  getAppVersion: () => Promise<string>;
  getAppName: () => Promise<string>;
  showUpdateManager: boolean;
}

const TauriContext = createContext<TauriContextType>({
  discoverLocalServers: async () => {
    throw new Error('TauriProvider not initialized');
  },
  getAppVersion: async () => {
    throw new Error('TauriProvider not initialized');
  },
  getAppName: async () => {
    throw new Error('TauriProvider not initialized');
  },
  showUpdateManager: false,
});

export const useTauri = () => {
  const context = useContext(TauriContext);
  if (!context) {
    throw new Error('useTauri must be used within a TauriProvider');
  }
  return context;
};

interface TauriProviderProps {
  children: ReactNode;
}

export const TauriProvider: React.FC<TauriProviderProps> = ({ children }) => {
  const [showUpdateManager, setShowUpdateManager] = React.useState(false);
  const discoverLocalServers = async (): Promise<NetworkDiscoveryResult> => {
    try {
      const result = await invoke<NetworkDiscoveryResult>('discover_local_servers');
      console.log('Network discovery result:', result);
      return result;
    } catch (error) {
      console.error('Network discovery failed:', error);
      throw error;
    }
  };

  const getAppVersion = async (): Promise<string> => {
    try {
      return await invoke<string>('get_app_version');
    } catch (error) {
      console.error('Failed to get app version:', error);
      return 'Unknown';
    }
  };

  const getAppName = async (): Promise<string> => {
    try {
      return await invoke<string>('get_app_name');
    } catch (error) {
      console.error('Failed to get app name:', error);
      return 'Wasla';
    }
  };

  const value: TauriContextType = {
    discoverLocalServers,
    getAppVersion,
    getAppName,
    showUpdateManager,
  };

  return (
    <TauriContext.Provider value={value}>
      {showUpdateManager && <UpdateManager />}
      {children}
    </TauriContext.Provider>
  );
};
