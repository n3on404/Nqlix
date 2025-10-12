import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { dbClient } from './dbClient';

// WebSocket client for real-time communication between Wasla apps
export class WebSocketRealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private isConnecting = false;
  private isConnected = false;
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();
  private appName: string;
  private serverUrl: string;

  constructor(appName: string = 'Wasla App', serverUrl: string = 'ws://localhost:8765') {
    this.appName = appName;
    this.serverUrl = serverUrl;
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      return;
    }

    this.isConnecting = true;
    
    try {
      console.log(`🌐 Connecting to WebSocket server: ${this.serverUrl}`);
      
      this.ws = new WebSocket(this.serverUrl);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        
        // Register this app with the server
        this.send({
          message_type: 'register',
          data: {
            app_name: this.appName,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });
        
        // Emit connection event
        this.emit('connected', { appName: this.appName });
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', message);
          
          // Handle different message types
          switch (message.message_type) {
            case 'realtime_event':
              this.handleRealtimeEvent(message.data);
              break;
            case 'pong':
              // Handle pong response
              break;
            default:
              console.log('📨 Unknown message type:', message.message_type);
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };
      
      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.isConnecting = false;
        
        // Emit disconnection event
        this.emit('disconnected', { code: event.code, reason: event.reason });
        
        // Attempt to reconnect if not a manual close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnecting = false;
        
        // Emit error event
        this.emit('error', { error });
      };
      
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      throw error;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    
    console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isConnected && this.reconnectAttempts <= this.maxReconnectAttempts) {
        this.connect().catch(console.error);
      }
    }, delay);
  }

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ WebSocket not connected, cannot send message');
    }
  }

  private handleRealtimeEvent(eventData: any): void {
    console.log('🔔 Handling realtime event:', eventData);
    
    // Emit the event to all listeners
    this.emit('realtime-event', eventData);
    
    // Also emit specific event types
    switch (eventData.event_type) {
      case 'INSERT':
      case 'UPDATE':
      case 'DELETE':
        this.emit(`${eventData.table}-${eventData.event_type.toLowerCase()}`, eventData);
        break;
      case 'BOOKING_CREATED':
      case 'BOOKING_CANCELLED':
        this.emit('booking-change', eventData);
        break;
      case 'VEHICLE_ENTERED':
      case 'VEHICLE_UPDATED':
      case 'VEHICLE_EXITED':
        this.emit('vehicle-change', eventData);
        break;
      default:
        this.emit(eventData.event_type.toLowerCase(), eventData);
    }
  }

  private emit(eventType: string, data: any): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in event listener for ${eventType}:`, error);
        }
      });
    }
  }

  // Public methods for event handling
  on(eventType: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(callback);
  }

  off(eventType: string, callback: (data: any) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
    }
  }

  // Send ping to keep connection alive
  ping(): void {
    this.send({
      message_type: 'ping',
      data: {},
      timestamp: new Date().toISOString()
    });
  }

  // Send custom event to other apps
  broadcastEvent(eventType: string, data: any): void {
    this.send({
      message_type: 'custom_event',
      data: {
        event_type: eventType,
        data: data
      },
      timestamp: new Date().toISOString()
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
  }

  getConnectionStatus(): { connected: boolean; connecting: boolean; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Global WebSocket client instance
let globalWebSocketClient: WebSocketRealtimeClient | null = null;

// Initialize WebSocket client
export async function initializeWebSocketRealtime(appName: string = 'Wasla App'): Promise<WebSocketRealtimeClient> {
  if (!globalWebSocketClient) {
    // Try to detect the server URL based on the current environment
    const serverUrl = await detectWebSocketServerUrl();
    globalWebSocketClient = new WebSocketRealtimeClient(appName, serverUrl);
  }
  return globalWebSocketClient;
}

// Detect WebSocket server URL using network discovery
async function detectWebSocketServerUrl(): Promise<string> {
  try {
    // First try to get the best server from network discovery
    const bestServer = await invoke<string | null>('get_best_websocket_server');
    if (bestServer) {
      console.log('🔍 Found WebSocket server via network discovery:', bestServer);
      return bestServer;
    }
  } catch (error) {
    console.warn('⚠️ Network discovery failed, falling back to local detection:', error);
  }

 
 
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:8765`;
}

// Get the global WebSocket client
export function getWebSocketRealtimeClient(): WebSocketRealtimeClient | null {
  return globalWebSocketClient;
}

// Enhanced dbClient with WebSocket integration
export const websocketDbClient = {
  // Include all existing dbClient methods
  ...dbClient,
  
  // Initialize WebSocket connection
  async initializeWebSocket(appName: string = 'Wasla App'): Promise<void> {
    const client = await initializeWebSocketRealtime(appName);
    await client.connect();
    
    // Set up automatic reconnection
    client.on('disconnected', () => {
      console.log('🔄 WebSocket disconnected, will attempt to reconnect...');
    });
    
    client.on('connected', () => {
      console.log('✅ WebSocket reconnected successfully');
    });
    
    client.on('error', (error: any) => {
      console.error('❌ WebSocket error:', error);
    });
    
    // Set up ping interval to keep connection alive
    setInterval(() => {
      if (client.getConnectionStatus().connected) {
        client.ping();
      }
    }, 30000); // Ping every 30 seconds
  },
  
  // Get WebSocket connection status
  getWebSocketStatus(): { connected: boolean; connecting: boolean; reconnectAttempts: number } {
    const client = getWebSocketRealtimeClient();
    return client ? client.getConnectionStatus() : { connected: false, connecting: false, reconnectAttempts: 0 };
  },

  // Get discovered apps from network discovery
  async getDiscoveredApps(): Promise<any[]> {
    try {
      return await invoke<any[]>('get_discovered_apps');
    } catch (error) {
      console.error('❌ Failed to get discovered apps:', error);
      return [];
    }
  },

  // Get network discovery status
  async getNetworkDiscoveryStatus(): Promise<{ discoveredApps: number; bestServer: string | null }> {
    try {
      const [discoveredApps, bestServer] = await Promise.all([
        invoke<any[]>('get_discovered_apps'),
        invoke<string | null>('get_best_websocket_server')
      ]);
      
      return {
        discoveredApps: discoveredApps.length,
        bestServer
      };
    } catch (error) {
      console.error('❌ Failed to get network discovery status:', error);
      return { discoveredApps: 0, bestServer: null };
    }
  },
  
  // Listen to WebSocket events
  onWebSocketEvent(eventType: string, callback: (data: any) => void): () => void {
    const client = getWebSocketRealtimeClient();
    if (client) {
      client.on(eventType, callback);
      return () => client.off(eventType, callback);
    }
    return () => {}; // Return empty cleanup function
  },
  
  // Broadcast custom event to other apps
  broadcastToOtherApps(eventType: string, data: any): void {
    const client = getWebSocketRealtimeClient();
    if (client) {
      client.broadcastEvent(eventType, data);
    }
  },
  
  // Disconnect WebSocket
  disconnectWebSocket(): void {
    const client = getWebSocketRealtimeClient();
    if (client) {
      client.disconnect();
    }
  }
};