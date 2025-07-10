import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/api/process';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';

interface UpdateInfo {
  version: string;
  date: string;
  body: string;
}

interface UpdateProgress {
  chunkLength: number;
  contentLength: number;
}

export const UpdateManager: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlistenFns: (() => void)[] = [];

    // Listen for update available
    listen('tauri://update-available', (event) => {
      console.log('Update available:', event.payload);
      setUpdateAvailable(event.payload as UpdateInfo);
      setError(null);
    }).then(unlisten => unlistenFns.push(unlisten));

    // Listen for download progress
    listen('tauri://update-download-progress', (event) => {
      const progressData = event.payload as UpdateProgress;
      const percentage = (progressData.chunkLength / progressData.contentLength) * 100;
      setProgress(percentage);
      setDownloading(true);
    }).then(unlisten => unlistenFns.push(unlisten));

    // Listen for download finished
    listen('tauri://update-download-finished', () => {
      setDownloading(false);
      setProgress(100);
    }).then(unlisten => unlistenFns.push(unlisten));

    // Listen for install
    listen('tauri://update-install', () => {
      console.log('Installing update...');
    }).then(unlisten => unlistenFns.push(unlisten));

    // Listen for errors
    listen('tauri://update-error', (event) => {
      console.error('Update error:', event.payload);
      setError(event.payload as string);
      setDownloading(false);
    }).then(unlisten => unlistenFns.push(unlisten));

    return () => {
      unlistenFns.forEach(unlisten => unlisten());
    };
  }, []);

  const handleInstallUpdate = async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error('Failed to relaunch:', err);
      setError('Failed to install update');
    }
  };

  if (!updateAvailable && !downloading && !error) {
    return null;
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {downloading ? '📥 Downloading Update' : '🔄 Update Available'}
        </CardTitle>
        <CardDescription>
          {downloading 
            ? 'Downloading the latest version...'
            : `Version ${updateAvailable?.version} is available`
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-red-600 text-sm">
            Error: {error}
          </div>
        )}
        
        {downloading && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-gray-600">
              {Math.round(progress)}% complete
            </p>
          </div>
        )}
        
        {updateAvailable && !downloading && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              <p><strong>Version:</strong> {updateAvailable.version}</p>
              <p><strong>Date:</strong> {updateAvailable.date}</p>
              {updateAvailable.body && (
                <div className="mt-2">
                  <strong>What's new:</strong>
                  <p className="mt-1">{updateAvailable.body}</p>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleInstallUpdate}
                className="flex-1"
                disabled={downloading}
              >
                Install Update
              </Button>
              <Button 
                variant="outline"
                onClick={() => setUpdateAvailable(null)}
                disabled={downloading}
              >
                Later
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 