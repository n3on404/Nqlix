import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  enhancedMqttClient, 
  EnhancedMqttClient, 
  MqttConnectionState, 
  ConnectionMetrics,
  MqttMessage 
} from '../services/enhancedMqttClient';

interface EnhancedMqttContextType {
  mqttClient: EnhancedMqttClient;
  connectionState: MqttConnectionState;
  connectionMetrics: ConnectionMetrics;
  isConnected: boolean;
  isAuthenticated: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: MqttMessage) => Promise<void>;
  sendTestMessage: (payload?: any) => Promise<void>;
  sendPerformanceTest: () => Promise<void>;
  requestDashboardData: () => Promise<void>;
  requestQueueData: () => Promise<void>;
  subscribeToUpdates: (entityTypes: string[]) => Promise<void>;
  lastError: string | null;
  lastMessage: any;
  reconnectAttempts: number;
}

const EnhancedMqttContext = createContext<EnhancedMqttContextType | undefined>(undefined);

interface EnhancedMqttProviderProps {
  children: ReactNode;
}

export const EnhancedMqttProvider: React.FC<EnhancedMqttProviderProps> = ({ children }) => {
  const [connectionState, setConnectionState] = useState<MqttConnectionState>(
    enhancedMqttClient.getConnectionState()
  );
  const [connectionMetrics, setConnectionMetrics] = useState<ConnectionMetrics>(
    enhancedMqttClient.getConnectionMetrics()
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  useEffect(() => {
    // Set up event listeners
    const handleStateChanged = (state: MqttConnectionState) => {
      console.log('🔄 MQTT Connection state changed:', state);
      setConnectionState(state);
    };

    const handleConnected = () => {
      console.log('✅ MQTT Connected');
      setLastError(null);
      setReconnectAttempts(0);
    };

    const handleDisconnected = () => {
      console.log('🔌 MQTT Disconnected');
    };

    const handleAuthenticated = (data: any) => {
      console.log('🔐 MQTT Authenticated:', data);
      setLastError(null);
    };

    const handleError = (error: any) => {
      console.error('❌ MQTT Error:', error);
      setLastError(error?.message || 'MQTT connection error');
    };

    const handleAuthError = (error: any) => {
      console.error('❌ MQTT Auth Error:', error);
      setLastError(error?.message || 'MQTT authentication failed');
    };

    const handleMessage = (data: { message: MqttMessage; topic: string }) => {
      setLastMessage(data);
    };

    const handleHealthCheck = (data: any) => {
      setConnectionMetrics(enhancedMqttClient.getConnectionMetrics());
    };

    const handleConnectionQualityChanged = (quality: string) => {
      console.log('📊 Connection quality changed:', quality);
      setConnectionMetrics(enhancedMqttClient.getConnectionMetrics());
    };

    const handleHeartbeatFailed = () => {
      setReconnectAttempts(prev => prev + 1);
    };

    // Register event listeners
    enhancedMqttClient.on('state_changed', handleStateChanged);
    enhancedMqttClient.on('connected', handleConnected);
    enhancedMqttClient.on('disconnected', handleDisconnected);
    enhancedMqttClient.on('authenticated', handleAuthenticated);
    enhancedMqttClient.on('error', handleError);
    enhancedMqttClient.on('auth_error', handleAuthError);
    enhancedMqttClient.on('message', handleMessage);
    enhancedMqttClient.on('health_check', handleHealthCheck);
    enhancedMqttClient.on('connection_quality_changed', handleConnectionQualityChanged);
    enhancedMqttClient.on('heartbeat_failed', handleHeartbeatFailed);

    // Periodic metrics update
    const metricsInterval = setInterval(() => {
      setConnectionMetrics(enhancedMqttClient.getConnectionMetrics());
    }, 5000);

    // Cleanup function
    return () => {
      enhancedMqttClient.off('state_changed', handleStateChanged);
      enhancedMqttClient.off('connected', handleConnected);
      enhancedMqttClient.off('disconnected', handleDisconnected);
      enhancedMqttClient.off('authenticated', handleAuthenticated);
      enhancedMqttClient.off('error', handleError);
      enhancedMqttClient.off('auth_error', handleAuthError);
      enhancedMqttClient.off('message', handleMessage);
      enhancedMqttClient.off('health_check', handleHealthCheck);
      enhancedMqttClient.off('connection_quality_changed', handleConnectionQualityChanged);
      enhancedMqttClient.off('heartbeat_failed', handleHeartbeatFailed);
      clearInterval(metricsInterval);
    };
  }, []);

  const connect = async () => {
    try {
      setLastError(null);
      await enhancedMqttClient.connect();
    } catch (error: any) {
      console.error('❌ Failed to connect to MQTT:', error);
      setLastError(error?.message || 'Failed to connect to MQTT');
      throw error;
    }
  };

  const disconnect = () => {
    enhancedMqttClient.disconnect();
  };

  const sendMessage = async (message: MqttMessage) => {
    try {
      await enhancedMqttClient.sendMessage(message);
    } catch (error: any) {
      console.error('❌ Failed to send MQTT message:', error);
      setLastError(error?.message || 'Failed to send message');
      throw error;
    }
  };

  const sendTestMessage = async (payload?: any) => {
    try {
      await enhancedMqttClient.sendTestMessage(payload);
    } catch (error: any) {
      console.error('❌ Failed to send test message:', error);
      setLastError(error?.message || 'Failed to send test message');
      throw error;
    }
  };

  const sendPerformanceTest = async () => {
    try {
      await enhancedMqttClient.sendPerformanceTest();
    } catch (error: any) {
      console.error('❌ Failed to send performance test:', error);
      setLastError(error?.message || 'Failed to send performance test');
      throw error;
    }
  };

  const requestDashboardData = async () => {
    try {
      await enhancedMqttClient.requestDashboardData();
    } catch (error: any) {
      console.error('❌ Failed to request dashboard data:', error);
      setLastError(error?.message || 'Failed to request dashboard data');
      throw error;
    }
  };

  const requestQueueData = async () => {
    try {
      await enhancedMqttClient.requestQueueData();
    } catch (error: any) {
      console.error('❌ Failed to request queue data:', error);
      setLastError(error?.message || 'Failed to request queue data');
      throw error;
    }
  };

  const subscribeToUpdates = async (entityTypes: string[]) => {
    try {
      await enhancedMqttClient.subscribeToUpdates(entityTypes);
    } catch (error: any) {
      console.error('❌ Failed to subscribe to updates:', error);
      setLastError(error?.message || 'Failed to subscribe to updates');
      throw error;
    }
  };

  const contextValue: EnhancedMqttContextType = {
    mqttClient: enhancedMqttClient,
    connectionState,
    connectionMetrics,
    isConnected: enhancedMqttClient.isConnected(),
    isAuthenticated: enhancedMqttClient.isAuthenticated(),
    connect,
    disconnect,
    sendMessage,
    sendTestMessage,
    sendPerformanceTest,
    requestDashboardData,
    requestQueueData,
    subscribeToUpdates,
    lastError,
    lastMessage,
    reconnectAttempts
  };

  return (
    <EnhancedMqttContext.Provider value={contextValue}>
      {children}
    </EnhancedMqttContext.Provider>
  );
};

export const useEnhancedMqtt = (): EnhancedMqttContextType => {
  const context = useContext(EnhancedMqttContext);
  if (context === undefined) {
    throw new Error('useEnhancedMqtt must be used within an EnhancedMqttProvider');
  }
  return context;
};

export default EnhancedMqttProvider;
