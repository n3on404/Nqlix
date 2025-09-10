import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useEnhancedMqtt } from '../context/EnhancedMqttProvider';
import { MqttConnectionState } from '../services/enhancedMqttClient';
import { useAuth } from '../context/AuthProvider';
import { printerService } from '../services/printerService';
import { Printer } from 'lucide-react';



interface SystemStatusProps {
  compact?: boolean;
  showDetails?: boolean;
  className?: string;
}

export function SystemStatus({ compact = false, showDetails = false, className = '' }: SystemStatusProps) {
  const { isAuthenticated } = useAuth();
  const { 
    connectionState, 
    isConnected, 
    isAuthenticated: isMqttAuthenticated,
    connect,
    disconnect
  } = useEnhancedMqtt();
  
  const refreshConnection = async () => {
    await disconnect();
    await connect();
  };
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [printerAvailable, setPrinterAvailable] = useState(false);
  const [checkingPrinter, setCheckingPrinter] = useState(false);

  const checkPrinterStatus = async () => {
    setCheckingPrinter(true);
    try {
      const available = await printerService.isPrinterAvailable();
      setPrinterAvailable(available);
    } catch (error) {
      console.error('Failed to check printer status:', error);
      setPrinterAvailable(false);
    } finally {
      setCheckingPrinter(false);
    }
  };

  useEffect(() => {
    checkPrinterStatus(); // Check printer status on mount
    
    // Set up periodic printer status check
    const printerCheckInterval = setInterval(checkPrinterStatus, 30000); // Check every 30 seconds
    
    return () => {
      clearInterval(printerCheckInterval);
    };
  }, []);

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
        <Badge variant={printerAvailable ? 'default' : 'destructive'}>
          <Printer className="h-3 w-3 mr-1" />
          {checkingPrinter ? '⏳' : printerAvailable ? '🖨️' : '❌'}
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
          <Badge variant={printerAvailable ? 'default' : 'destructive'}>
            <Printer className="h-3 w-3 mr-1" />
            {checkingPrinter ? 'Checking...' : printerAvailable ? '✅ Available' : '❌ Not Available'}
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
          <Button
            size="sm"
            variant="outline"
            onClick={checkPrinterStatus}
            disabled={checkingPrinter}
            className="flex-1"
          >
            <Printer className="h-3 w-3 mr-1" />
            {checkingPrinter ? 'Checking...' : 'Check Printer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SystemStatus; 