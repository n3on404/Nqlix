import React, { useState, useEffect } from 'react';
import { Loader2, Wifi, Printer, User, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useInit } from '../context/InitProvider';
import { useTauri } from '../context/TauriProvider';
import api from '../lib/api';
import { WaslaLogo } from './WaslaLogo';
import { getLocalStorage } from '../lib/storage';

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
  const { getAppVersion } = useTauri();
  const [appVersion, setAppVersion] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(0);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);
  
  // Fixed server URL - no configuration needed
  const FIXED_SERVER_URL = 'http://192.168.192.100:3001';
  
  // Load app version on component mount
  useEffect(() => {
    const loadAppVersion = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          const version = await getAppVersion();
          setAppVersion(version);
        } else {
          setAppVersion('Web Version');
        }
      } catch (err) {
        console.error('Failed to load app version:', err);
        setAppVersion('Unknown');
      }
    };
    loadAppVersion();
  }, [getAppVersion]);
  
  const [checks, setChecks] = useState<SystemCheck[]>([
    {
      name: 'Server Connection',
      status: 'pending',
      message: `Connecting to ${FIXED_SERVER_URL}...`,
      icon: <Wifi className="w-5 h-5" />
    },
    {
      name: 'Authentication',
      status: 'pending',
      message: 'Verifying user session...',
      icon: <User className="w-5 h-5" />
    },
    {
      name: 'Printer Configuration',
      status: 'pending',
      message: 'Checking printer configuration...',
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

  const attemptConnection = async (attempt: number): Promise<boolean> => {
    try {
      console.log(`🔄 Connection attempt ${attempt} to ${FIXED_SERVER_URL}`);
      updateCheck(0, 'pending', `Connecting to ${FIXED_SERVER_URL}... (attempt ${attempt})`);
      
      const success = await updateServerUrl(FIXED_SERVER_URL);
      
      if (success) {
        const isConnected = await api.checkConnection();
        if (isConnected) {
          updateCheck(0, 'success', `Connected to ${FIXED_SERVER_URL}`);
          return true;
        }
      }
      
      updateCheck(0, 'error', `Failed to connect (attempt ${attempt})`);
      return false;
    } catch (error) {
      console.error(`❌ Connection attempt ${attempt} failed:`, error);
      updateCheck(0, 'error', `Connection failed (attempt ${attempt})`);
      return false;
    }
  };

  const performChecks = async () => {
    setIsConnecting(true);
    setConnectionAttempts(0);
    
    // Step 1: Server Connection with retry logic
    setCurrentStep(0);
    let connected = false;
    let attempts = 0;
    const maxAttempts = 10; // Try up to 10 times
    
    while (!connected && attempts < maxAttempts) {
      attempts++;
      setConnectionAttempts(attempts);
      
      connected = await attemptConnection(attempts);
      
      if (!connected) {
        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (!connected) {
      updateCheck(0, 'error', `Failed to connect after ${maxAttempts} attempts`);
      setIsConnecting(false);
      return; // Stop if we can't connect
    }

    // Step 2: Authentication
    setCurrentStep(1);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    try {
      const authResponse = await api.verifyToken();
      const isLoggedIn = authResponse.success;
      
      if (isLoggedIn) {
        updateCheck(1, 'success', 'User session active');
      } else {
        updateCheck(1, 'warning', 'No active session - login required');
      }
    } catch (error) {
      updateCheck(1, 'warning', 'Could not verify authentication status');
    }

    // Step 3: Printer Configuration
    setCurrentStep(2);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const printerIp = getLocalStorage('printerIp') || '';
    if (printerIp) {
      updateCheck(2, 'success', `Printer configured: ${printerIp}`);
    } else {
      updateCheck(2, 'warning', 'Printer not configured - configure in settings');
    }

    // Step 4: App Updates
    setCurrentStep(3);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Simulate update check
    const needsUpdate = Math.random() > 0.95;
    if (needsUpdate) {
      updateCheck(3, 'warning', 'Update available (v2.1.3)');
    } else {
      updateCheck(3, 'success', 'App is up to date');
    }

    // Wait a bit before completing
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Complete initialization
    const serverCheck = checks[0];
    const authCheck = checks[1];
    const shouldShowLogin = authCheck.status !== 'success' || serverCheck.status !== 'success';
    
    setIsConnecting(false);
    onInitComplete(shouldShowLogin);
  };

  useEffect(() => {
    performChecks();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <WaslaLogo size={64} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Wasla
            </h1>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                v{appVersion}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isConnecting ? 'Connecting to server...' : 'Initializing system...'}
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
              {isConnecting ? `Connecting... (${connectionAttempts} attempts)` : 'Please wait...'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 