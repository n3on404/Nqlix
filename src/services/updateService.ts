import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export interface UpdateInfo {
  version: string;
  date: string;
  body: string;
}

export interface UpdateProgress {
  chunkLength: number;
  contentLength: number;
}

export interface UpdateState {
  isAvailable: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  progress: number;
  error: string | null;
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
}

export class UpdateService {
  private static instance: UpdateService;
  private listeners: Map<string, (data: any) => void> = new Map();

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  private setupEventListeners() {
    // Listen for update events
    listen('update-available', (event) => {
      this.notifyListeners('update-available', event.payload);
    });

    listen('update-download-progress', (event) => {
      this.notifyListeners('update-download-progress', event.payload);
    });

    listen('update-download-finished', (event) => {
      this.notifyListeners('update-download-finished', event.payload);
    });

    listen('update-install', (event) => {
      this.notifyListeners('update-install', event.payload);
    });

    listen('update-error', (event) => {
      this.notifyListeners('update-error', event.payload);
    });
  }

  public async checkForUpdates(): Promise<void> {
    try {
      await invoke('check_for_updates');
    } catch (error) {
      console.error('Failed to check for updates:', error);
      throw error;
    }
  }

  public async installUpdate(): Promise<void> {
    try {
      await invoke('install_update');
    } catch (error) {
      console.error('Failed to install update:', error);
      throw error;
    }
  }

  public addListener(event: string, callback: (data: any) => void): () => void {
    this.listeners.set(event, callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(event);
    };
  }

  private notifyListeners(event: string, data: any) {
    const callback = this.listeners.get(event);
    if (callback) {
      callback(data);
    }
  }

  public getAppVersion(): string {
    // This would typically come from the backend
    return '0.0.0';
  }

  public getAppName(): string {
    // This would typically come from the backend
    return 'Nqlix';
  }
}

export const updateService = UpdateService.getInstance(); 