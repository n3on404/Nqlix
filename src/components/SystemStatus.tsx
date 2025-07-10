import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { getWebSocketClient, ConnectionState } from '../lib/websocket';
import { useAuth } from '../context/AuthProvider';

interface ConnectionMetrics {
  state: ConnectionState;
  isConnected: boolean;
  isAuthenticated: boolean;
  quality: 'excellent' | 'good' | 'poor' | 'critical';
  latency: number;
  reconnectAttempts: number;
  queuedMessages: number;
  connectionHistory: Array<{ timestamp: number; success: boolean; latency?: number }>;
}

interface SystemStatusProps {
  compact?: boolean;
  showDetails?: boolean;
  className?: string;
}

export function SystemStatus({ compact = false, showDetails = false, className = '' }: SystemStatusProps) {
  const { isAuthenticated } = useAuth();
  const [connectionState, setConnectionState] = useState(ConnectionState.DISCONNECTED);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const wsClient = getWebSocketClient();

  useEffect(() => {
    const updateState = () => {
      setConnectionState(wsClient.getConnectionState());
      setIsConnected(wsClient.isConnected());
    };
    updateState();
    wsClient.on('state_changed', updateState);
    wsClient.on('connected', updateState);
    wsClient.on('disconnected', updateState);
    return () => {
      wsClient.removeListener('state_changed', updateState);
      wsClient.removeListener('connected', updateState);
      wsClient.removeListener('disconnected', updateState);
    };
  }, [wsClient]);

  const handleForceReconnect = () => {
    setIsReconnecting(true);
    wsClient.disconnect();
    setTimeout(() => {
      wsClient.connect();
      setIsReconnecting(false);
    }, 500);
  };

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Badge variant={connectionState === ConnectionState.CONNECTED ? 'default' : 'outline'}>
          {connectionState === ConnectionState.CONNECTED ? '🟢 Connected' : connectionState === ConnectionState.CONNECTING ? '🟡 Connecting...' : connectionState === ConnectionState.RECONNECTING ? '🔄 Reconnecting...' : connectionState === ConnectionState.FAILED ? '❌ Failed' : '🔴 Disconnected'}
        </Badge>
        {(!isConnected || connectionState === ConnectionState.FAILED) && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleForceReconnect}
            disabled={isReconnecting}
          >
            {isReconnecting ? 'Connecting...' : 'Reconnect'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          Connection Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection State */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">State:</span>
          <Badge variant={connectionState === ConnectionState.CONNECTED ? 'default' : 'outline'}>
            {connectionState === ConnectionState.CONNECTED ? '🟢 Connected' : connectionState === ConnectionState.CONNECTING ? '🟡 Connecting...' : connectionState === ConnectionState.RECONNECTING ? '🔄 Reconnecting...' : connectionState === ConnectionState.FAILED ? '❌ Failed' : '🔴 Disconnected'}
          </Badge>
        </div>
        {/* Authentication Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Authenticated:</span>
          <Badge variant={isAuthenticated ? 'default' : 'destructive'}>
            {isAuthenticated ? '✅ Yes' : '❌ No'}
          </Badge>
        </div>
        {/* Actions */}
        <div className="flex space-x-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleForceReconnect}
            disabled={isReconnecting || connectionState === ConnectionState.CONNECTING}
            className="flex-1"
          >
            {isReconnecting ? 'Connecting...' : 'Force Reconnect'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SystemStatus; 