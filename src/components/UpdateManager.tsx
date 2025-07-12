import React, { useEffect, useState } from 'react';
import { checkUpdate, installUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
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
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const initializeUpdater = async () => {
      try {
        // Set up updater event listener
        unlisten = await onUpdaterEvent(({ error, status }) => {
          console.log('Updater event:', error, status);
          
          if (error) {
            console.error('Updater error:', error);
            setError(error);
            setDownloading(false);
            setChecking(false);
          }

          // Handle different status updates
          switch (status) {
            case 'PENDING':
              setChecking(true);
              break;
            case 'UPTODATE':
              setChecking(false);
              break;
            case 'DONE':
              setDownloading(false);
              setProgress(100);
              break;
            case 'ERROR':
              setError('Update failed');
              setDownloading(false);
              setChecking(false);
              break;
            default:
              console.log('Unknown update status:', status);
              break;
          }
        });

        // Check for updates
        const { shouldUpdate, manifest } = await checkUpdate();
        
        if (shouldUpdate && manifest) {
          console.log(`Update available: ${manifest.version}, ${manifest.date}, ${manifest.body}`);
          setUpdateAvailable({
            version: manifest.version,
            date: manifest.date,
            body: manifest.body
          });
          setError(null);
        }
        
        setChecking(false);
      } catch (err) {
        console.error('Failed to initialize updater:', err);
        setError('Failed to check for updates');
        setChecking(false);
      }
    };

    initializeUpdater();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleInstallUpdate = async () => {
    try {
      setDownloading(true);
      setError(null);
      
      // Install the update
      await installUpdate();
      
      // Relaunch the app
      await relaunch();
    } catch (err) {
      console.error('Failed to install update:', err);
      setError('Failed to install update');
      setDownloading(false);
    }
  };

  // Don't show anything if no update is available and not checking
  if (!updateAvailable && !downloading && !error && !checking) {
    return null;
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {checking ? '🔍 Checking for Updates' :
           downloading ? '📥 Downloading Update' : 
           '🔄 Update Available'}
        </CardTitle>
        <CardDescription>
          {checking ? 'Checking for available updates...' :
           downloading ? 'Downloading the latest version...' :
           `Version ${updateAvailable?.version} is available`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-red-600 text-sm">
            Error: {error}
          </div>
        )}
        
        {checking && (
          <div className="space-y-2">
            <Progress value={0} className="w-full" />
            <p className="text-sm text-gray-600">
              Checking for updates...
            </p>
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
        
        {updateAvailable && !downloading && !checking && (
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
                disabled={downloading || checking}
              >
                Install Update
              </Button>
              <Button 
                variant="outline"
                onClick={() => setUpdateAvailable(null)}
                disabled={downloading || checking}
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