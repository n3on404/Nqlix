import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export interface WebSocketMessage {
  type: string;
  data?: any;
  timestamp?: string;
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

export class WebSocketClient {
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private eventListeners: Map<string, Function[]> = new Map();
  private isManualClose = false;
  private relayUnlisten: (() => void) | null = null;
  private closedUnlisten: (() => void) | null = null;

  connect() {
    if (this.connectionState === ConnectionState.CONNECTED || this.connectionState === ConnectionState.CONNECTING) {
      return;
    }
    this.setConnectionState(ConnectionState.CONNECTING);
    this.isManualClose = false;
    invoke('start_ws_relay')
      .then(() => {
        this.setConnectionState(ConnectionState.CONNECTED);
        this.emit('connected');
      })
      .catch((err) => {
        this.setConnectionState(ConnectionState.FAILED);
        this.emit('error', err);
      });
    // Listen for relay messages
    if (!this.relayUnlisten) {
      listen<string>('ws-relay-message', (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.payload);
          this.emit('message', message);
          this.emit(message.type, message.data);
        } catch (e) {
          // fallback: emit raw
          this.emit('message', event.payload);
        }
      }).then(unlisten => {
        this.relayUnlisten = unlisten;
      });
    }
    // Listen for closed event
    if (!this.closedUnlisten) {
      listen('ws-relay-closed', () => {
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.emit('disconnected');
      }).then(unlisten => {
        this.closedUnlisten = unlisten;
      });
    }
  }

  disconnect() {
    this.isManualClose = true;
    this.setConnectionState(ConnectionState.DISCONNECTED);
    if (this.relayUnlisten) {
      this.relayUnlisten();
      this.relayUnlisten = null;
    }
    if (this.closedUnlisten) {
      this.closedUnlisten();
      this.closedUnlisten = null;
    }
    // No way to close the backend socket from here, but we can ignore events
  }

  send(message: WebSocketMessage) {
    invoke('ws_relay_send', { message: JSON.stringify(message) });
  }

  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  getReadyState(): number {
    return this.isConnected() ? 1 : 3; // 1 = OPEN, 3 = CLOSED
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  private setConnectionState(state: ConnectionState) {
    if (this.connectionState !== state) {
      const oldState = this.connectionState;
      this.connectionState = state;
      this.emit('state_changed', { oldState, newState: state });
    }
  }

  // Event emitter methods
  on(event: string, listener: Function): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }

  removeListener(event: string, listener: Function): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  // Legacy methods for compatibility
  async getDashboardData(): Promise<any> {
    return this.sendMessage({
      type: 'dashboard_data_request'
    });
  }

  async subscribe(topics: string[]): Promise<any> {
    return this.sendMessage({
      type: 'subscribe',
      data: { topics }
    });
  }

  async sendMessage(message: Omit<WebSocketMessage, 'timestamp'>): Promise<any> {
    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: new Date().toISOString()
    };
    this.send(fullMessage);
    // No response tracking in relay mode
    return Promise.resolve();
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient();
    wsClient.connect();
  }
  return wsClient;
} 