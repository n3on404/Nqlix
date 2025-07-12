import React, { useState, useEffect } from 'react';
import { Loader2, Wifi, WifiOff, Printer, User, Download, CheckCircle, XCircle, AlertCircle, Settings, Search, Globe } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useInit } from '../context/InitProvider';
import { useTauri } from '../context/TauriProvider';
import api from '../lib/api';

interface SystemCheck {
  name: string;
  status: 'pending' | 'success' | 'error' | 'warning';
  message: string;
  icon: React.ReactNode;
}

interface InitScreenProps {
  onInitComplete: (shouldShowLogin: boolean) => void;
}

export const InitScreen: React.FC<InitScreenProps> = ({ onInitComplete }) => {
  const { systemStatus, updateServerUrl } = useInit();
  const { discoverLocalServers, getAppVersion } = useTauri();
  const [appVersion, setAppVersion] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(0);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredServers, setDiscoveredServers] = useState<Array<{ip: string, port: number, url: string, response_time: number}>>([]);
  
  // Load app version on component mount
  useEffect(() => {
    const loadAppVersion = async () => {
      try {
        const version = await getAppVersion();
        setAppVersion(version);
      } catch (err) {
        console.error('Failed to load app version:', err);
        setAppVersion('Unknown');
      }
    };
    loadAppVersion();
  }, [getAppVersion]);
  
  const [checks, setChecks] = useState<SystemCheck[]>([
    {
      name: 'Network Discovery',
      status: 'pending',
      message: 'Searching for local node servers...',
      icon: <Search className="w-5 h-5" />
    },
    {
      name: 'Server Connection',
      status: 'pending',
      message: 'Connecting to local server...',
      icon: <Wifi className="w-5 h-5" />
    },
    {
      name: 'Authentication',
      status: 'pending',
      message: 'Verifying user session...',
      icon: <User className="w-5 h-5" />
    },
    {
      name: 'Ticket Printer',
      status: 'pending',
      message: 'Detecting printer connection...',
      icon: <Printer className="w-5 h-5" />
    },
    {
      name: 'App Updates',
      status: 'pending',
      message: 'Checking for updates...',
      icon: <Download className="w-5 h-5" />
    }
  ]);

  const getStatusIcon = (status: SystemCheck['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
    }
  };

  const updateCheck = (index: number, status: SystemCheck['status'], message: string) => {
    setChecks(prev => prev.map((check, i) => 
      i === index ? { ...check, status, message } : check
    ));
  };

  const handleServerUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerUrl(e.target.value);
    setConnectionError(null);
  };

  const discoverServers = async () => {
    setIsDiscovering(true);
    updateCheck(0, 'pending', 'Scanning local network for servers...');
    
    try {
      console.log('🔍 Starting network discovery...');
      const result = await discoverLocalServers();
      console.log('🔍 Discovery result:', result);
      setDiscoveredServers(result.servers);
      
      if (result.servers.length > 0) {
        const bestServer = result.servers[0]; // Fastest response time
        setServerUrl(bestServer.url);
        updateCheck(0, 'success', `Found ${result.servers.length} server(s) on port ${bestServer.port} in ${result.scan_duration_ms}ms`);
        console.log('🔍 Best server found:', bestServer);
        return bestServer.url;
      } else {
        updateCheck(0, 'error', `No local node servers found on network (scanned ${result.total_scanned} IPs on ports 3001-3005)`);
        console.log('🔍 No servers found, scanned:', result.total_scanned, 'IPs');
        return null;
      }
    } catch (error) {
      console.error('🔍 Network discovery failed:', error);
      updateCheck(0, 'error', `Network discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsDiscovering(false);
    }
  };

  const testServerConnection = async () => {
    setIsTestingConnection(true);
    setConnectionError(null);
    
    try {
      console.log('🔍 Testing connection to:', serverUrl);
      const success = await updateServerUrl(serverUrl);
      
      if (success) {
        console.log('🔍 Connection successful!');
        setShowServerConfig(false);
        performChecks(); // Restart checks with new URL
      } else {
        console.log('🔍 Connection failed');
        setConnectionError('Could not connect to server. Please check the URL and ensure the server is running.');
      }
    } catch (error) {
      console.error('🔍 Connection test error:', error);
      setConnectionError(`Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const performChecks = async () => {
    // Reset checks
    setChecks(prev => prev.map(check => ({
      ...check,
      status: 'pending',
      message: check.name === 'Network Discovery' 
        ? 'Searching for local node servers...' 
        : check.name === 'Server Connection'
        ? 'Connecting to local server...'
        : check.message.replace(/success|error|warning/i, 'pending')
    })));
    
    // Check 1: Network Discovery
    setCurrentStep(0);
    const discoveredUrl = await discoverServers();
    
    if (!discoveredUrl) {
      // Show server config if no servers found
      setShowServerConfig(true);
      return; // Stop checks if no servers found
    }

    // Auto-connect to discovered server
    setServerUrl(discoveredUrl);
    const connectionSuccess = await updateServerUrl(discoveredUrl);
    if (!connectionSuccess) {
      setShowServerConfig(true);
      return;
    }

    // Check 2: Server Connection
    setCurrentStep(1);
    try {
      const isConnected = await api.checkConnection();
      
      if (isConnected) {
        updateCheck(1, 'success', `Connected to local server (${discoveredUrl})`);
      } else {
        updateCheck(1, 'error', 'Failed to connect to local server');
        setShowServerConfig(true);
        return; // Stop checks if server connection fails
      }
    } catch (error) {
      updateCheck(1, 'error', 'Network error when connecting to server');
      setShowServerConfig(true);
      return; // Stop checks if server connection fails
    }

    // Check 3: Authentication
    setCurrentStep(2);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    try {
      // Check if token is valid
      const authResponse = await api.verifyToken();
      const isLoggedIn = authResponse.success;
      
      if (isLoggedIn) {
        updateCheck(2, 'success', 'User session active');
      } else {
        updateCheck(2, 'warning', 'No active session - login required');
      }
    } catch (error) {
      updateCheck(2, 'warning', 'Could not verify authentication status');
    }

    // Check 4: Printer Connection
    setCurrentStep(3);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Simulate printer check (70% success rate)
    const printerConnected = Math.random() > 0.3;
    if (printerConnected) {
      updateCheck(3, 'success', 'Thermal printer ready (USB001)');
    } else {
      updateCheck(3, 'warning', 'Printer not detected - manual tickets only');
    }

    // Check 5: App Updates
    setCurrentStep(4);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Simulate update check (95% up to date)
    const needsUpdate = Math.random() > 0.95;
    if (needsUpdate) {
      updateCheck(4, 'warning', 'Update available (v2.1.3)');
    } else {
      updateCheck(4, 'success', 'App is up to date (v2.1.2)');
    }

    // Wait a bit before completing
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Complete initialization
    const networkCheck = checks[0];
    const serverCheck = checks[1];
    const authCheck = checks[2];
    const shouldShowLogin = authCheck.status !== 'success' || serverCheck.status !== 'success';
    onInitComplete(shouldShowLogin);
  };

  useEffect(() => {
    performChecks();
  }, []);

  if (showServerConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            {/* Logo and Title */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-2xl">L</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Server Configuration
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                No local node servers found. Please enter the server URL manually.
              </p>
            </div>

            {/* Discovered Servers */}
            {discoveredServers.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Discovered Servers:
                </h3>
                <div className="space-y-2">
                  {discoveredServers.map((server, index) => (
                    <div
                      key={`${server.ip}:${server.port}`}
                      className="flex items-center justify-between p-3 bg-muted dark:bg-muted rounded-lg cursor-pointer hover:bg-muted/80 dark:hover:bg-muted/80"
                      onClick={() => setServerUrl(server.url)}
                    >
                      <div>
                        <div className="font-medium text-sm">{server.ip}:{server.port}</div>
                        <div className="text-xs text-gray-500">{server.response_time}ms response</div>
                      </div>
                      {serverUrl === server.url && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Server URL Input */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="server-url" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Server URL
                </label>
                <Input
                  id="server-url"
                  value={serverUrl}
                  onChange={handleServerUrlChange}
                  placeholder="http://192.168.1.100:3001"
                  className="w-full"
                />
                {connectionError && (
                  <p className="text-sm text-red-500">{connectionError}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Example: http://192.168.1.100:3001
                </p>
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={testServerConnection}
                  disabled={isTestingConnection}
                  className="flex-1"
                >
                  {isTestingConnection ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-4 h-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={discoverServers}
                  disabled={isDiscovering}
                  className="flex-1"
                >
                  {isDiscovering ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Scan Network
                    </>
                  )}
                </Button>
              </div>
              
              <div className="flex space-x-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    // Skip discovery and try to connect with default URL
                    setServerUrl('http://localhost:3001');
                    testServerConnection();
                  }}
                  className="flex-1"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Try Localhost
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    // Skip discovery and try to connect with common local IP
                    setServerUrl('http://192.168.1.100:3001');
                    testServerConnection();
                  }}
                  className="flex-1"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Try Common IP
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">L</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Nqlix
            </h1>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                v{appVersion}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Initializing system...
            </p>
          </div>

          {/* System Checks */}
          <div className="space-y-4">
            {checks.map((check, index) => (
              <div
                key={check.name}
                className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 ${
                  index <= currentStep
                    ? 'bg-card dark:bg-card shadow-sm'
                    : 'bg-muted dark:bg-muted opacity-50'
                }`}
              >
                <div className="flex-shrink-0">
                  {index <= currentStep ? getStatusIcon(check.status) : check.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {check.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {check.message}
                  </div>
                </div>
                {index === 0 && check.status === 'error' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowServerConfig(true)}
                    className="flex-shrink-0"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
              <span>Initializing</span>
              <span>{Math.round(((currentStep + 1) / checks.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${((currentStep + 1) / checks.length) * 100}%`
                }}
              />
            </div>
          </div>

          {/* Loading Animation */}
          <div className="flex items-center justify-center mt-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Please wait...
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 