import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { getLocalStorage } from './storage';

export interface WebSocketMessage {
  type: string;
  data?: any;
  payload?: any;
  timestamp?: string;
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

export class WebSocketClient {
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private eventListeners: Map<string, Function[]> = new Map();
  private isManualClose = false;
  private relayUnlisten: (() => void) | null = null;
  private closedUnlisten: (() => void) | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();

  connect() {
    if (this.connectionState === ConnectionState.CONNECTED || 
        this.connectionState === ConnectionState.AUTHENTICATED ||
        this.connectionState === ConnectionState.CONNECTING) {
      return;
    }
    
    this.setConnectionState(ConnectionState.CONNECTING);
    this.isManualClose = false;
    
    console.log('🔌 Connecting to WebSocket...');
    
    invoke('start_ws_relay')
      .then(() => {
        this.setConnectionState(ConnectionState.CONNECTED);
        this.emit('connected');
        console.log('✅ WebSocket connected successfully');
        
        // Automatically authenticate after connection
        this.authenticate();
      })
      .catch((err) => {
        console.error('❌ WebSocket connection failed:', err);
        this.setConnectionState(ConnectionState.FAILED);
        this.emit('error', err);
        this.scheduleReconnect();
      });
      
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for relay messages
    if (!this.relayUnlisten) {
      listen<string>('ws-relay-message', (event) => {
        console.log('🔍 Raw WebSocket relay event received:', {
          eventType: 'ws-relay-message',
          payload: event.payload,
          payloadType: typeof event.payload
        });
        
        // Check if payload is already an object (pre-parsed)
        let message: WebSocketMessage;
        
        if (typeof event.payload === 'object' && event.payload !== null) {
          // Payload is already an object
          message = event.payload as WebSocketMessage;
          console.log('📦 Payload is already an object, no parsing needed');
        } else if (typeof event.payload === 'string') {
          // Payload is a string, try to parse it
          try {
            message = JSON.parse(event.payload);
            console.log('📦 Parsed JSON payload successfully');
          } catch (e) {
            console.error('❌ Error parsing WebSocket message:', e);
            console.error('Raw payload:', event.payload);
            this.emit('raw_message', event.payload);
            return;
          }
        } else {
          console.warn('⚠️ Unexpected payload type:', typeof event.payload, event.payload);
          return;
        }
        
        // Validate message structure
        if (!message || typeof message !== 'object') {
          console.warn('⚠️ Invalid message structure received:', message);
          return;
        }
        
        if (!message.type) {
          console.warn('⚠️ Message missing type property:', message);
          return;
        }
        
        console.log('📨 Received WebSocket message:', message.type);
        this.handleMessage(message);
      }).then(unlisten => {
        this.relayUnlisten = unlisten;
      });
    }
    
    // Listen for closed event
    if (!this.closedUnlisten) {
      listen('ws-relay-closed', () => {
        console.log('🔌 WebSocket connection closed');
        this.setConnectionState(ConnectionState.DISCONNECTED);
        this.emit('disconnected');
        
        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      }).then(unlisten => {
        this.closedUnlisten = unlisten;
      });
    }
  }

  private handleMessage(message: WebSocketMessage) {
    // Validate message structure
    if (!message || !message.type) {
      console.warn('⚠️ Invalid message structure in handleMessage:', message);
      return;
    }
    
    // Handle specific message types
    switch (message.type) {
      case 'connected':
        console.log('🎉 Received welcome message from server');
        break;
        
      case 'authenticated':
        console.log('✅ Successfully authenticated with server');
        this.setConnectionState(ConnectionState.AUTHENTICATED);
        this.emit('authenticated', message.payload);
        this.startHeartbeat();
        // Auto-subscribe to essential topics for real-time updates
        this.autoSubscribe();
        // Re-subscribe to previous subscriptions
        this.resubscribe();
        break;
        
      case 'auth_error':
        console.error('❌ Authentication failed:', message.payload?.message);
        this.emit('auth_error', message.payload);
        break;
        
      case 'heartbeat_ack':
        console.log('💓 Heartbeat acknowledged');
        break;
        
      case 'initial_data':
      case 'dashboard_data':
        console.log('📊 Received dashboard data');
        this.emit('dashboard_data', message.payload);
        this.emit('queue_data', message.payload); // Also emit as queue_data for compatibility
        break;
        
      case 'queue_update':
        console.log('🚗 Received queue update');
        this.emit('queue_update', message.payload);
        break;
        
      case 'booking_update':
        console.log('🎫 Received booking update');
        this.emit('booking_update', message.payload);
        break;
        
      case 'cash_booking_updated':
        console.log('💰 Received cash booking update');
        this.emit('cash_booking_updated', message.payload);
        break;
        
      case 'queue_updated':
        console.log('🔄 Received queue updated');
        this.emit('queue_updated', message.payload);
        break;
        
      case 'booking_created':
        console.log('🎯 Received booking created');
        this.emit('booking_created', message.payload);
        break;
        
      case 'destinations_updated':
        console.log('📍 Received destinations updated');
        this.emit('destinations_updated', message.payload);
        break;
        
      case 'booking_conflict':
        console.log('🚨 Received booking conflict');
        this.emit('booking_conflict', message.payload);
        break;
        
      case 'booking_success':
        console.log('🎉 Received booking success notification');
        this.emit('booking_success', message.payload);
        break;
        
      case 'financial_update':
        console.log('💰 Received financial update');
        this.emit('financial_update', message.payload);
        break;
        
      case 'payment_confirmation':
        console.log('💳 Received payment confirmation');
        this.emit('payment_confirmation', message.payload);
        break;
        
      case 'vehicle_status_changed':
        console.log('🚌 Received vehicle status changed');
        this.emit('vehicle_status_changed', message.payload);
        break;
        
      case 'error':
        console.error('❌ Server error:', message.payload?.message);
        this.emit('error', message.payload);
        break;
        
      default:
        console.log(`📨 Received ${message.type} message`);
        break;
    }
    
    // Emit the generic message event
    this.emit('message', message);
    
    // Emit typed event with validation
    if (message.type && typeof message.type === 'string') {
      this.emit(message.type, message.payload || message.data);
    } else {
      console.warn('⚠️ Cannot emit typed event - invalid message type:', message.type);
    }
  }

  private authenticate() {
    const token = getLocalStorage('authToken');
    const staffData = getLocalStorage('currentStaff');
    
    if (!token || !staffData) {
      console.warn('⚠️ No authentication data available');
      return;
    }
    
    console.log('🔐 Authenticating with server...');
    this.sendMessage({
      type: 'authenticate',
      payload: {
        token,
        staffData: JSON.parse(staffData),
        clientType: 'desktop_app'
      }
    });
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isAuthenticated()) {
        this.sendMessage({
          type: 'heartbeat',
          payload: {
            timestamp: Date.now()
          }
        });
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  private autoSubscribe() {
    // Automatically subscribe to essential topics for real-time updates
    const essentialTopics = ['queues', 'bookings', 'financial', 'overnight_queue'];
    console.log('🔄 Auto-subscribing to essential topics:', essentialTopics);
    this.subscribe(essentialTopics);
  }

  private resubscribe() {
    if (this.subscriptions.size > 0) {
      console.log('🔄 Re-subscribing to topics:', Array.from(this.subscriptions));
      this.subscribe(Array.from(this.subscriptions));
    }
  }

  private scheduleReconnect() {
    if (this.isManualClose || this.reconnectTimer) return;
    
    console.log('🔄 Scheduling reconnection in 3 seconds...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isManualClose) {
        console.log('🔄 Attempting to reconnect...');
        this.connect();
      }
    }, 3000);
  }

  disconnect() {
    console.log('🔌 Disconnecting WebSocket...');
    this.isManualClose = true;
    this.setConnectionState(ConnectionState.DISCONNECTED);
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Clean up event listeners
    if (this.relayUnlisten) {
      this.relayUnlisten();
      this.relayUnlisten = null;
    }
    if (this.closedUnlisten) {
      this.closedUnlisten();
      this.closedUnlisten = null;
    }
    
    this.emit('disconnected');
  }

  send(message: WebSocketMessage) {
    if (!this.isConnected()) {
      console.warn('⚠️ WebSocket not connected, cannot send message:', message.type);
      return false;
    }
    
    try {
      invoke('ws_relay_send', { message: JSON.stringify(message) });
      return true;
    } catch (error) {
      console.error('❌ Failed to send WebSocket message:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED || 
           this.connectionState === ConnectionState.AUTHENTICATED;
  }

  isAuthenticated(): boolean {
    return this.connectionState === ConnectionState.AUTHENTICATED;
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
      console.log(`🔄 WebSocket state changed: ${oldState} → ${state}`);
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
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`❌ Error in ${event} listener:`, error);
        }
      });
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

  // Public API methods
  async subscribe(topics: string[]): Promise<any> {
    topics.forEach(topic => this.subscriptions.add(topic));
    
    if (!this.isAuthenticated()) {
      console.warn('⚠️ Cannot subscribe: not authenticated');
      return Promise.resolve();
    }
    
    console.log('📡 Subscribing to topics:', topics);
    return this.sendMessage({
      type: 'subscribe',
      payload: { topics }
    });
  }

  async requestQueueData(): Promise<any> {
    if (!this.isAuthenticated()) {
      console.warn('⚠️ Cannot request queue data: not authenticated');
      return Promise.resolve();
    }
    
    console.log('📋 Requesting queue data...');
    return this.sendMessage({
      type: 'dashboard_data_request'
    });
  }

  async getDashboardData(): Promise<any> {
    return this.requestQueueData();
  }

  async sendMessage(message: Omit<WebSocketMessage, 'timestamp'>): Promise<any> {
    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: new Date().toISOString()
    };
    this.send(fullMessage);
    return Promise.resolve();
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient();
  }
  return wsClient;
}

// Auto-connect when client is created
export function initializeWebSocket(): WebSocketClient {
  const client = getWebSocketClient();
  if (!client.isConnected()) {
    client.connect();
  }
  return client;
} 