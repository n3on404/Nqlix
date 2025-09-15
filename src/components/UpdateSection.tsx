import React, { useEffect, useState } from 'react';
import { checkUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
import { useTauri } from '../context/TauriProvider';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Download, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface UpdateInfo {
  version: string;
  date: string;
  body: string;
}

export const UpdateSection: React.FC = () => {
  const { getAppVersion, getAppName } = useTauri();
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [appName, setAppName] = useState<string>('');
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    const loadAppInfo = async () => {
      try {
        const version = await getAppVersion();
        const name = await getAppName();
        setCurrentVersion(version);
        setAppName(name);
      } catch (err) {
        console.error('Failed to load app info:', err);
        setCurrentVersion('Unknown');
        setAppName('Wasla');
      }
    };

    loadAppInfo();
  }, [getAppVersion, getAppName]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupUpdaterEvents = async () => {
      try {
        unlisten = await onUpdaterEvent(({ error, status }) => {
          console.log('Updater event:', error, status);
          
          if (error) {
            console.error('Updater error:', error);
            setError(error);
            setChecking(false);
          }

          switch (status) {
            case 'PENDING':
              setChecking(true);
              break;
            case 'UPTODATE':
              setChecking(false);
              setError(null);
              break;
            case 'DONE':
              setChecking(false);
              break;
            case 'ERROR':
              setError('Update failed');
              setChecking(false);
              break;
            default:
              console.log('Unknown update status:', status);
              break;
          }
        });
      } catch (err) {
        console.error('Failed to setup updater events:', err);
      }
    };

    setupUpdaterEvents();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleCheckForUpdates = async () => {
    try {
      setChecking(true);
      setError(null);
      setUpdateAvailable(null);

      const { shouldUpdate, manifest } = await checkUpdate();
      
      if (shouldUpdate && manifest) {
        console.log(`Update available: ${manifest.version}, ${manifest.date}, ${manifest.body}`);
        setUpdateAvailable({
          version: manifest.version,
          date: manifest.date,
          body: manifest.body
        });
      } else {
        console.log('No updates available');
      }
      
      setLastChecked(new Date());
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setError('Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Download className="h-5 w-5" />
          Application Updates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Version Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Application:</span>
            <span className="text-sm text-muted-foreground">{appName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current Version:</span>
            <Badge variant="outline" className="text-xs">
              {currentVersion}
            </Badge>
          </div>
          {lastChecked && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Last Checked:</span>
              <span className="text-sm text-muted-foreground">
                {lastChecked.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Update Status */}
        {updateAvailable && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Update Available
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <div><strong>Version:</strong> {updateAvailable.version}</div>
              <div><strong>Date:</strong> {updateAvailable.date}</div>
              {updateAvailable.body && (
                <div><strong>What's new:</strong> {updateAvailable.body}</div>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-800 dark:text-red-200">
                {error}
              </span>
            </div>
          </div>
        )}

        {/* Check for Updates Button */}
        <Button
          onClick={handleCheckForUpdates}
          disabled={checking}
          className="w-full"
          variant="outline"
        >
          {checking ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Checking for Updates...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Check for Updates
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}; 