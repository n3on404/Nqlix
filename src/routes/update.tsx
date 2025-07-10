import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { relaunch } from '@tauri-apps/api/process';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Download, RefreshCw, CheckCircle, AlertCircle, ArrowLeft, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UpdateInfo {
  version: string;
  date: string;
  body: string;
}

interface UpdateProgress {
  chunkLength: number;
  contentLength: number;
}

interface UpdateState {
  isAvailable: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  progress: number;
  error: string | null;
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
}

export default function UpdatePage() {
  const navigate = useNavigate();
  const [updateState, setUpdateState] = useState<UpdateState>({
    isAvailable: false,
    isDownloading: false,
    isInstalling: false,
    progress: 0,
    error: null,
    updateInfo: null,
    isChecking: false,
  });

  useEffect(() => {
    // Auto-check for updates when page loads
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    setUpdateState(prev => ({ ...prev, isChecking: true, error: null }));
    
    try {
      await invoke('check_for_updates');
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateState(prev => ({ 
        ...prev, 
        error: 'Failed to check for updates',
        isChecking: false,
      }));
    }
  };

  useEffect(() => {
    const unlistenFns: (() => void)[] = [];

    // Listen for update available
    listen('update-available', (event) => {
      console.log('Update available:', event.payload);
      const updateInfo = event.payload as UpdateInfo;
      setUpdateState(prev => ({
        ...prev,
        isAvailable: true,
        updateInfo,
        error: null,
        isChecking: false,
      }));
    }).then(unlisten => unlistenFns.push(unlisten));

    // Listen for download progress
    listen('update-download-progress', (event) => {
      const progressData = event.payload as UpdateProgress;
      const percentage = (progressData.chunkLength / progressData.contentLength) * 100;
      setUpdateState(prev => ({
        ...prev,
        isDownloading: true,
        progress: percentage,
      }));
    }).then(unlisten => unlistenFns.push(unlisten));

    // Listen for download finished
    listen('update-download-finished', () => {
      setUpdateState(prev => ({
        ...prev,
        isDownloading: false,
        progress: 100,
      }));
    }).then(unlisten => unlistenFns.push(unlisten));

    // Listen for install
    listen('update-install', () => {
      console.log('Installing update...');
      setUpdateState(prev => ({
        ...prev,
        isInstalling: true,
      }));
    }).then(unlisten => unlistenFns.push(unlisten));

    // Listen for errors
    listen('update-error', (event) => {
      console.error('Update error:', event.payload);
      setUpdateState(prev => ({
        ...prev,
        error: event.payload as string,
        isDownloading: false,
        isInstalling: false,
        isChecking: false,
      }));
    }).then(unlisten => unlistenFns.push(unlisten));

    return () => {
      unlistenFns.forEach(unlisten => unlisten());
    };
  }, []);

  const handleInstallUpdate = async () => {
    try {
      setUpdateState(prev => ({ ...prev, isInstalling: true }));
      await relaunch();
    } catch (err) {
      console.error('Failed to relaunch:', err);
      setUpdateState(prev => ({ 
        ...prev, 
        error: 'Failed to install update',
        isInstalling: false,
      }));
    }
  };

  const handleRetry = () => {
    setUpdateState(prev => ({ ...prev, error: null }));
    checkForUpdates();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            {updateState.isDownloading && <Download className="w-8 h-8 animate-pulse text-blue-500" />}
            {updateState.isInstalling && <RefreshCw className="w-8 h-8 animate-spin text-green-500" />}
            {updateState.error && <AlertCircle className="w-8 h-8 text-red-500" />}
            {updateState.isChecking && <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />}
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && updateState.isAvailable && 
              <CheckCircle className="w-8 h-8 text-green-500" />
            }
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && !updateState.isAvailable && 
              <Info className="w-8 h-8 text-gray-500" />
            }
          </div>
          
          <CardTitle className="text-2xl">
            {updateState.isDownloading && 'Downloading Update'}
            {updateState.isInstalling && 'Installing Update'}
            {updateState.error && 'Update Error'}
            {updateState.isChecking && 'Checking for Updates'}
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && updateState.isAvailable && 'Update Available'}
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && !updateState.isAvailable && 'No Updates Available'}
          </CardTitle>
          
          <CardDescription>
            {updateState.isDownloading && 'Downloading the latest version...'}
            {updateState.isInstalling && 'Installing the update...'}
            {updateState.error && 'An error occurred during the update process.'}
            {updateState.isChecking && 'Checking for available updates...'}
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && updateState.isAvailable && 
              `Version ${updateState.updateInfo?.version} is available for download.`
            }
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && !updateState.isAvailable && 
              'Your app is up to date.'
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {updateState.error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Update Error</p>
                <p className="text-xs text-red-600">{updateState.error}</p>
              </div>
            </div>
          )}

          {updateState.isDownloading && (
            <div className="space-y-4">
              <Progress value={updateState.progress} className="w-full h-3" />
              <div className="flex justify-between text-sm text-gray-600">
                <span>Downloading update...</span>
                <span>{Math.round(updateState.progress)}%</span>
              </div>
            </div>
          )}

          {updateState.isInstalling && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-green-500" />
                <p className="text-lg font-medium text-gray-800">Installing update...</p>
                <p className="text-sm text-gray-500 mt-2">The app will restart automatically</p>
              </div>
            </div>
          )}

          {updateState.isChecking && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
                <p className="text-lg font-medium text-gray-800">Checking for updates...</p>
                <p className="text-sm text-gray-500 mt-2">Please wait</p>
              </div>
            </div>
          )}

          {updateState.updateInfo && !updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  v{updateState.updateInfo.version}
                </Badge>
                <span className="text-sm text-gray-500">{updateState.updateInfo.date}</span>
              </div>
              
              {updateState.updateInfo.body && (
                <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                  <p className="font-medium mb-2">What's new in this update:</p>
                  <p className="text-sm leading-relaxed">{updateState.updateInfo.body}</p>
                </div>
              )}
            </div>
          )}

          {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && !updateState.isAvailable && (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-800">Your app is up to date!</p>
              <p className="text-sm text-gray-500 mt-2">You have the latest version installed.</p>
            </div>
          )}
        </CardContent>

        <div className="p-6 pt-0">
          <div className="flex gap-3 justify-center">
            {updateState.error && (
              <>
                <Button variant="outline" onClick={handleRetry} disabled={updateState.isChecking}>
                  {updateState.isChecking ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                  Retry
                </Button>
                <Button variant="outline" onClick={() => navigate('/dashboard')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </>
            )}

            {updateState.isAvailable && !updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && (
              <>
                <Button variant="outline" onClick={() => navigate('/dashboard')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Later
                </Button>
                <Button onClick={handleInstallUpdate} disabled={updateState.isDownloading} size="lg">
                  Install Update
                </Button>
              </>
            )}

            {!updateState.isAvailable && !updateState.isDownloading && !updateState.isInstalling && !updateState.error && !updateState.isChecking && (
              <>
                <Button variant="outline" onClick={checkForUpdates} disabled={updateState.isChecking}>
                  {updateState.isChecking ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                  Check Again
                </Button>
                <Button onClick={() => navigate('/dashboard')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </>
            )}

            {updateState.isDownloading && (
              <Button variant="outline" onClick={() => navigate('/dashboard')} disabled>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
} 