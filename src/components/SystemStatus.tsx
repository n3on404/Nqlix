import React, { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
// Simplified static statuses for connection display
enum MqttConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  CONNECTING = 'connecting',
  DISCOVERING = 'discovering',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}
import { useAuth } from '../context/AuthProvider';
// Printer service removed



interface SystemStatusProps {
  compact?: boolean;
  showDetails?: boolean;
  className?: string;
}

export function SystemStatus({ compact = false, showDetails = false, className = '' }: SystemStatusProps) {
  const { isAuthenticated } = useAuth();
  // Show disconnected and disable controls (no broker)
  const [connectionState] = useState<MqttConnectionState>(MqttConnectionState.DISCONNECTED);
  const isConnected = false;
  const isMqttAuthenticated = false;
  const connect = async () => {};
  const disconnect = async () => {};
  
  const refreshConnection = async () => {
    await disconnect();
    await connect();
  };
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Printer status checks removed

  const handleForceReconnect = async () => {
    setIsReconnecting(true);
    try {
      await refreshConnection();
    } catch (error) {
      console.error('Reconnection failed:', error);
    } finally {
      setIsReconnecting(false);
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Badge variant={isConnected ? 'default' : 'outline'}>
          {connectionState === MqttConnectionState.CONNECTED ? '🟢 Connected' :
           connectionState === MqttConnectionState.AUTHENTICATED ? '🟢 Authenticated' :
           connectionState === MqttConnectionState.CONNECTING ? '🟡 Connecting...' :
           connectionState === MqttConnectionState.DISCOVERING ? '🔍 Discovering...' :
           connectionState === MqttConnectionState.RECONNECTING ? '🔄 Reconnecting...' :
           connectionState === MqttConnectionState.FAILED ? '❌ Failed' : '🔴 Disconnected'}
        </Badge>
        <Badge variant="outline">
          🖨️ Impression désactivée
        </Badge>
        {(!isConnected || connectionState === MqttConnectionState.FAILED) && (
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
          <Badge variant={isConnected ? 'default' : 'outline'}>
            {connectionState === MqttConnectionState.CONNECTED ? '🟢 Connected' :
             connectionState === MqttConnectionState.AUTHENTICATED ? '🟢 Authenticated' :
             connectionState === MqttConnectionState.CONNECTING ? '🟡 Connecting...' :
             connectionState === MqttConnectionState.DISCOVERING ? '🔍 Discovering...' :
             connectionState === MqttConnectionState.RECONNECTING ? '🔄 Reconnecting...' :
             connectionState === MqttConnectionState.FAILED ? '❌ Failed' : '🔴 Disconnected'}
          </Badge>
        </div>
        {/* Authentication Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Authenticated:</span>
          <Badge variant={isMqttAuthenticated ? 'default' : 'destructive'}>
            {isMqttAuthenticated ? '✅ Yes' : '❌ No'}
          </Badge>
        </div>
        
        {/* Printer Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Printer:</span>
          <Badge variant="outline">
            🖨️ Temporairement désactivé
          </Badge>
        </div>
        {/* Actions */}
        <div className="flex space-x-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleForceReconnect}
            disabled={isReconnecting || connectionState === MqttConnectionState.CONNECTING}
            className="flex-1"
          >
            {isReconnecting ? 'Connecting...' : 'Force Reconnect'}
          </Button>
          {/* Printer check button removed */}
        </div>
      </CardContent>
    </Card>
  );
}

export default SystemStatus; 