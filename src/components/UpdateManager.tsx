import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/api/process';
import { invoke } from '@tauri-apps/api/tauri';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Download, RefreshCw, CheckCircle, AlertCircle, X } from 'lucide-react';

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
}

export const UpdateManager: React.FC = () => {
  const [updateState, setUpdateState] = useState<UpdateState>({
    isAvailable: false,
    isDownloading: false,
    isInstalling: false,
    progress: 0,
    error: null,
    updateInfo: null,
  });
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Auto-check for updates on component mount
  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    setIsChecking(true);
    setUpdateState(prev => ({ ...prev, error: null }));
    
    try {
      await invoke('check_for_updates');
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateState(prev => ({ 
        ...prev, 
        error: 'Failed to check for updates' 
      }));
    } finally {
      setIsChecking(false);
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
      }));
      setShowUpdateDialog(true);
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

  const handleSkipUpdate = () => {
    setShowUpdateDialog(false);
    setUpdateState(prev => ({ ...prev, isAvailable: false }));
  };

  const handleRetry = () => {
    setUpdateState(prev => ({ ...prev, error: null }));
    checkForUpdates();
  };

  // Don't render anything if no update activity
  if (!updateState.isAvailable && !updateState.isDownloading && !updateState.isInstalling && !updateState.error && !showUpdateDialog) {
    return null;
  }

  const isDialogOpen = showUpdateDialog || updateState.isDownloading || updateState.isInstalling || !!updateState.error;

  return (
    <Dialog open={isDialogOpen} onOpenChange={setShowUpdateDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {updateState.isDownloading && <Download className="w-5 h-5 animate-pulse" />}
            {updateState.isInstalling && <RefreshCw className="w-5 h-5 animate-spin" />}
            {updateState.error && <AlertCircle className="w-5 h-5 text-red-500" />}
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && <CheckCircle className="w-5 h-5 text-green-500" />}
            
            {updateState.isDownloading && 'Downloading Update'}
            {updateState.isInstalling && 'Installing Update'}
            {updateState.error && 'Update Error'}
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && 'Update Available'}
          </DialogTitle>
          <DialogDescription>
            {updateState.isDownloading && 'Downloading the latest version...'}
            {updateState.isInstalling && 'Installing the update...'}
            {updateState.error && 'An error occurred during the update process.'}
            {!updateState.isDownloading && !updateState.isInstalling && !updateState.error && 
              `Version ${updateState.updateInfo?.version} is available for download.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {updateState.error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Update Error</p>
                <p className="text-xs text-red-600">{updateState.error}</p>
              </div>
            </div>
          )}

          {updateState.isDownloading && (
            <div className="space-y-3">
              <Progress value={updateState.progress} className="w-full" />
              <div className="flex justify-between text-sm text-gray-600">
                <span>Downloading...</span>
                <span>{Math.round(updateState.progress)}%</span>
              </div>
            </div>
          )}

          {updateState.isInstalling && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
                <p className="text-sm text-gray-600">Installing update...</p>
                <p className="text-xs text-gray-500 mt-1">The app will restart automatically</p>
              </div>
            </div>
          )}

          {updateState.updateInfo && !updateState.isDownloading && !updateState.isInstalling && !updateState.error && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">v{updateState.updateInfo.version}</Badge>
                <span className="text-sm text-gray-500">{updateState.updateInfo.date}</span>
              </div>
              
              {updateState.updateInfo.body && (
                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium mb-1">What's new:</p>
                  <p className="text-xs">{updateState.updateInfo.body}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          {updateState.error && (
            <>
              <Button variant="outline" onClick={handleRetry} disabled={isChecking}>
                {isChecking ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                Retry
              </Button>
              <Button variant="outline" onClick={handleSkipUpdate}>
                Skip
              </Button>
            </>
          )}

          {updateState.isAvailable && !updateState.isDownloading && !updateState.isInstalling && !updateState.error && (
            <>
              <Button variant="outline" onClick={handleSkipUpdate}>
                Later
              </Button>
              <Button onClick={handleInstallUpdate} disabled={updateState.isDownloading}>
                Install Update
              </Button>
            </>
          )}

          {updateState.isDownloading && (
            <Button variant="outline" onClick={handleSkipUpdate} disabled>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 