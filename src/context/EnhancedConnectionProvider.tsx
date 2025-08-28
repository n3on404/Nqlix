import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { enhancedWebSocketClient, EnhancedConnectionState, ConnectionMetrics } from '../services/enhancedLocalNodeWebSocket';
import enhancedApi from '../services/enhancedLocalNodeApi';

interface EnhancedConnectionContextType {
  connectionState: EnhancedConnectionState;
  connectionMetrics: ConnectionMetrics;
  isConnected: boolean;
  isAuthenticated: boolean;
  isOptimizing: boolean;
  serverMetrics: any;
  discoveredServers: string[];
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshConnection: () => Promise<void>;
  getConnectionStatus: () => Promise<any>;
  subscribeToUpdates: (entityTypes: string[], filters?: Map<string, any>) => Promise<void>;
}

const EnhancedConnectionContext = createContext<EnhancedConnectionContextType | undefined>(undefined);

export const useEnhancedConnection = () => {
  const context = useContext(EnhancedConnectionContext);
  if (!context) {
    throw new Error('useEnhancedConnection must be used within an EnhancedConnectionProvider');
  }
  return context;
};

interface EnhancedConnectionProviderProps {
  children: ReactNode;
}

export const EnhancedConnectionProvider: React.FC<EnhancedConnectionProviderProps> = ({ children }) => {
  const [connectionState, setConnectionState] = useState<EnhancedConnectionState>(EnhancedConnectionState.DISCONNECTED);
  const [connectionMetrics, setConnectionMetrics] = useState<ConnectionMetrics>({
    latency: 0,
    messageThroughput: 0,
    errorRate: 0,
    lastHeartbeat: new Date(),
    connectionQuality: 'fair'
  });
  const [serverMetrics, setServerMetrics] = useState<any>(null);
  const [discoveredServers, setDiscoveredServers] = useState<string[]>([]);

  useEffect(() => {
    // Setup event listeners
    const handleStateChanged = (state: EnhancedConnectionState) => {
      setConnectionState(state);
      console.log(`🔌 Enhanced connection state changed to: ${state}`);
    };

    const handleConnectionQualityChanged = (quality: ConnectionMetrics['connectionQuality']) => {
      setConnectionMetrics(prev => ({ ...prev, connectionQuality: quality }));
      console.log(`📊 Connection quality changed to: ${quality}`);
    };

    const handleMetricsUpdate = () => {
      const metrics = enhancedWebSocketClient.getConnectionMetrics();
      setConnectionMetrics(metrics);
    };

    const handleServerMetricsUpdate = () => {
      const metrics = enhancedWebSocketClient.getServerMetrics();
      setServerMetrics(metrics);
    };

    // Subscribe to events
    enhancedWebSocketClient.on('state_changed', handleStateChanged);
    enhancedWebSocketClient.on('connection_quality_changed', handleConnectionQualityChanged);
    enhancedWebSocketClient.on('connected', handleMetricsUpdate);
    enhancedWebSocketClient.on('authenticated', handleServerMetricsUpdate);

    // Start metrics update interval
    const metricsInterval = setInterval(handleMetricsUpdate, 5000);
    const serverMetricsInterval = setInterval(handleServerMetricsUpdate, 10000);

    // Auto-connect when provider mounts
    connect();

    return () => {
      // Cleanup
      enhancedWebSocketClient.off('state_changed', handleStateChanged);
      enhancedWebSocketClient.off('connection_quality_changed', handleConnectionQualityChanged);
      enhancedWebSocketClient.off('connected', handleMetricsUpdate);
      enhancedWebSocketClient.off('authenticated', handleServerMetricsUpdate);
      
      clearInterval(metricsInterval);
      clearInterval(serverMetricsInterval);
    };
  }, []);

  const connect = async (): Promise<void> => {
    try {
      console.log('🚀 Enhanced Connection Provider: Initiating connection...');
      
      // Discover servers first
      const servers = await enhancedApi.discoverLocalNodeServers();
      setDiscoveredServers(servers);
      
      // Connect WebSocket
      await enhancedWebSocketClient.connect();
      
    } catch (error) {
      console.error('❌ Enhanced Connection Provider: Connection failed:', error);
    }
  };

  const disconnect = (): void => {
    enhancedWebSocketClient.disconnect();
  };

  const refreshConnection = async (): Promise<void> => {
    try {
      console.log('🔄 Enhanced Connection Provider: Refreshing connection...');
      
      // Disconnect first
      disconnect();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reconnect
      await connect();
      
    } catch (error) {
      console.error('❌ Enhanced Connection Provider: Connection refresh failed:', error);
    }
  };

  const getConnectionStatus = async (): Promise<any> => {
    try {
      const status = await enhancedApi.getConnectionStatus();
      return status;
    } catch (error) {
      console.error('❌ Failed to get connection status:', error);
      return { success: false, error: (error as Error).message };
    }
  };

  const subscribeToUpdates = async (entityTypes: string[], filters?: Map<string, any>): Promise<void> => {
    try {
      await enhancedWebSocketClient.subscribeToUpdates(entityTypes, filters);
    } catch (error) {
      console.error('❌ Failed to subscribe to updates:', error);
    }
  };

  const value: EnhancedConnectionContextType = {
    connectionState,
    connectionMetrics,
    isConnected: enhancedWebSocketClient.isConnected(),
    isAuthenticated: enhancedWebSocketClient.isAuthenticated(),
    isOptimizing: connectionState === EnhancedConnectionState.OPTIMIZING,
    serverMetrics,
    discoveredServers,
    connect,
    disconnect,
    refreshConnection,
    getConnectionStatus,
    subscribeToUpdates
  };

  return (
    <EnhancedConnectionContext.Provider value={value}>
      {children}
    </EnhancedConnectionContext.Provider>
  );
}; 