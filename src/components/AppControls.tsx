import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { 
  Maximize, 
  Minimize, 
  Settings, 
  Power,
  RotateCcw,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface AppControlsProps {
  className?: string;
}

export const AppControls: React.FC<AppControlsProps> = ({ className = "" }) => {
  const [isAutoStartupEnabled, setIsAutoStartupEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check auto-startup status on component mount
  useEffect(() => {
    checkAutoStartupStatus();
  }, []);

  const checkAutoStartupStatus = async () => {
    try {
      const enabled = await invoke<boolean>('check_auto_startup');
      setIsAutoStartupEnabled(enabled);
    } catch (error) {
      console.error('Failed to check auto-startup status:', error);
    }
  };

  const toggleFullscreen = async () => {
    try {
      await invoke('toggle_fullscreen');
      toast.success('Mode plein écran basculé');
    } catch (error) {
      toast.error('Échec du basculement en plein écran');
      console.error('Failed to toggle fullscreen:', error);
    }
  };

  const minimizeToTray = async () => {
    try {
      await invoke('minimize_to_tray');
      toast.info('Application minimisée dans la barre système');
    } catch (error) {
      toast.error('Échec de la minimisation');
      console.error('Failed to minimize to tray:', error);
    }
  };

  const toggleAutoStartup = async () => {
    try {
      setIsLoading(true);
      
      if (isAutoStartupEnabled) {
        const result = await invoke<string>('disable_auto_startup');
        setIsAutoStartupEnabled(false);
        toast.success('Démarrage automatique désactivé');
        console.log(result);
      } else {
        const result = await invoke<string>('setup_auto_startup');
        setIsAutoStartupEnabled(true);
        toast.success('Démarrage automatique activé');
        console.log(result);
      }
    } catch (error) {
      toast.error('Échec de la modification du démarrage automatique');
      console.error('Failed to toggle auto-startup:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const restartApp = () => {
    if (window.confirm('Êtes-vous sûr de vouloir redémarrer l\'application ?')) {
      window.location.reload();
    }
  };

  return (
    <Card className={`p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">
            Contrôles de l'application
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Fullscreen Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleFullscreen}
          className="flex flex-col items-center gap-1 h-auto py-3"
        >
          <Maximize className="h-4 w-4" />
          <span className="text-xs">Plein écran</span>
          <span className="text-xs text-muted-foreground">F11</span>
        </Button>

        {/* Minimize to Tray */}
        <Button
          variant="outline"
          size="sm"
          onClick={minimizeToTray}
          className="flex flex-col items-center gap-1 h-auto py-3"
        >
          <Minimize className="h-4 w-4" />
          <span className="text-xs">Minimiser</span>
          <span className="text-xs text-muted-foreground">Ctrl+Shift+H</span>
        </Button>

        {/* Auto-Startup Toggle */}
        <Button
          variant={isAutoStartupEnabled ? "default" : "outline"}
          size="sm"
          onClick={toggleAutoStartup}
          disabled={isLoading}
          className="flex flex-col items-center gap-1 h-auto py-3"
        >
          {isAutoStartupEnabled ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span className="text-xs">Démarrage auto</span>
          <span className="text-xs text-muted-foreground">
            {isAutoStartupEnabled ? 'Activé' : 'Désactivé'}
          </span>
        </Button>

        {/* Restart App */}
        <Button
          variant="outline"
          size="sm"
          onClick={restartApp}
          className="flex flex-col items-center gap-1 h-auto py-3"
        >
          <RotateCcw className="h-4 w-4" />
          <span className="text-xs">Redémarrer</span>
          <span className="text-xs text-muted-foreground">App</span>
        </Button>
      </div>

      {/* System Tray Info */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
          <div className="text-xs text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">Barre système active</p>
            <p>• Clic gauche sur l'icône: Afficher/Masquer</p>
            <p>• Clic droit: Menu contextuel</p>
            <p>• Fermer la fenêtre: Minimise dans la barre système</p>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-start gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
          <div className="text-xs text-green-800 dark:text-green-200">
            <p className="font-medium mb-1">Raccourcis clavier</p>
            <p>• <code className="bg-green-100 dark:bg-green-900 px-1 rounded">F11</code>: Basculer plein écran</p>
            <p>• <code className="bg-green-100 dark:bg-green-900 px-1 rounded">Ctrl+Shift+H</code>: Afficher/Masquer</p>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default AppControls;