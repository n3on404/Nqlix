import { useState, useEffect, useCallback, useRef } from 'react';
import { getMQTTService, MQTTMessage } from './mqttService';

export interface UseMQTTOptions {
  autoConnect?: boolean;
  reconnectOnMount?: boolean;
}

export interface UseMQTTReturn {
  // Connection status
  isConnected: boolean;
  isConnecting: boolean;
  connectionStatus: string;
  error?: string;
  reconnectAttempts: number;
  
  // Metrics
  metrics: {
    messagesReceived: number;
    messagesSent: number;
    connectionTime: number;
    lastMessageTime?: Date;
  };
  
  // Methods
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  publish: (topic: string, payload: any, options?: { qos?: 0 | 1 | 2; retain?: boolean }) => Promise<boolean>;
  subscribe: (topic: string, callback: Function) => void;
  unsubscribe: (topic: string, callback?: Function) => void;
  
  // Health check
  healthCheck: () => Promise<any>;
}

export const useMQTT = (options: UseMQTTOptions = {}): UseMQTTReturn => {
  const {
    autoConnect = true,
    reconnectOnMount = true
  } = options;

  const mqttService = getMQTTService();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [metrics, setMetrics] = useState({
    messagesReceived: 0,
    messagesSent: 0,
    connectionTime: 0
  });

  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update connection status periodically
  const updateStatus = useCallback(() => {
    const status = mqttService.getConnectionStatus();
    const currentMetrics = mqttService.getMetrics();
    
    setIsConnected(status.connected);
    setIsConnecting(status.connecting);
    setError(status.error);
    setReconnectAttempts(status.reconnectAttempts);
    setMetrics(currentMetrics);
    
    if (status.connected) {
      setConnectionStatus('connected');
    } else if (status.connecting) {
      setConnectionStatus('connecting');
    } else if (status.error) {
      setConnectionStatus('error');
    } else {
      setConnectionStatus('disconnected');
    }
  }, [mqttService]);

  // Connect to MQTT broker
  const connect = useCallback(async (): Promise<boolean> => {
    try {
      setIsConnecting(true);
      setError(undefined);
      const success = await mqttService.connect();
      updateStatus();
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setIsConnecting(false);
      return false;
    }
  }, [mqttService, updateStatus]);

  // Disconnect from MQTT broker
  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await mqttService.disconnect();
      updateStatus();
    } catch (err) {
      console.error('❌ Error disconnecting from MQTT:', err);
    }
  }, [mqttService, updateStatus]);

  // Publish message
  const publish = useCallback(async (
    topic: string, 
    payload: any, 
    options?: { qos?: 0 | 1 | 2; retain?: boolean }
  ): Promise<boolean> => {
    try {
      return await mqttService.publish(topic, payload, options);
    } catch (err) {
      console.error('❌ Error publishing MQTT message:', err);
      return false;
    }
  }, [mqttService]);

  // Subscribe to topic
  const subscribe = useCallback((topic: string, callback: Function): void => {
    mqttService.subscribe(topic, callback);
  }, [mqttService]);

  // Unsubscribe from topic
  const unsubscribe = useCallback((topic: string, callback?: Function): void => {
    mqttService.unsubscribe(topic, callback);
  }, [mqttService]);

  // Health check
  const healthCheck = useCallback(async () => {
    return await mqttService.healthCheck();
  }, [mqttService]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && reconnectOnMount) {
      connect();
    }

    // Set up status update interval
    statusIntervalRef.current = setInterval(updateStatus, 1000);

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
    };
  }, [autoConnect, reconnectOnMount, connect, updateStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    connectionStatus,
    error,
    reconnectAttempts,
    metrics,
    connect,
    disconnect,
    publish,
    subscribe,
    unsubscribe,
    healthCheck
  };
};

export default useMQTT;