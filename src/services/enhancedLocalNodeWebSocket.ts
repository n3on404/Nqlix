import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { getLocalStorage } from '../lib/storage';
import enhancedApi from './enhancedLocalNodeApi';

export interface EnhancedWebSocketMessage {
  type: string;
  data?: any;
  payload?: any;
  timestamp?: string;
  priority?: number;
  entityType?: string;
  entityId?: string;
  operationId?: string;
}

export enum EnhancedConnectionState {
  DISCONNECTED = 'disconnected',
  DISCOVERING = 'discovering',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
  OPTIMIZING = 'optimizing'
}

export interface ConnectionMetrics {
  latency: number;
  messageThroughput: number;
  errorRate: number;
  lastHeartbeat: Date;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export class EnhancedLocalNodeWebSocketClient {
  private connectionState: EnhancedConnectionState = EnhancedConnectionState.DISCONNECTED;
  private eventListeners: Map<string, Function[]> = new Map();
  private isManualClose = false;
  private relayUnlisten: (() => void) | null = null;
  private closedUnlisten: (() => void) | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();
  private connectionMetrics: ConnectionMetrics;
  private retryCount = 0;
  private maxRetries = 5;
  private baseReconnectDelay = 1000;
  
  // Enhanced features
  private priorityQueue: EnhancedWebSocketMessage[] = [];
  private processingQueue = false;
  private lastServerMetrics: any = null;
  private connectionPool: Map<string, any> = new Map();

  constructor() {
    this.connectionMetrics = {
      latency: 0,
      messageThroughput: 0,
      errorRate: 0,
      lastHeartbeat: new Date(),
      connectionQuality: 'fair'
    };
    
    this.setupEnhancedEventListeners();
  }

  /**
   * Setup enhanced event listeners for real-time updates
   */
  private setupEnhancedEventListeners(): void {
    // Listen for enhanced system events
    this.on('cash_booking_updated', this.handleCashBookingUpdate.bind(this));
    this.on('seat_availability_changed', this.handleSeatAvailabilityChange.bind(this));
    this.on('queue_update', this.handleQueueUpdate.bind(this));
    this.on('financial_update', this.handleFinancialUpdate.bind(this));
    this.on('concurrency_operation_synced', this.handleConcurrencySync.bind(this));
    this.on('real_time_sync_update', this.handleRealTimeSync.bind(this));
  }

  /**
   * Connect with enhanced discovery and optimization
   */
  async connect(): Promise<void> {
    if (this.connectionState === EnhancedConnectionState.CONNECTED || 
        this.connectionState === EnhancedConnectionState.AUTHENTICATED ||
        this.connectionState === EnhancedConnectionState.CONNECTING) {
      return;
    }
    
    this.setConnectionState(EnhancedConnectionState.DISCOVERING);
    this.isManualClose = false;
    
    try {
      console.log('🔍 Enhanced WebSocket: Discovering local node servers...');
      
      // Discover servers using enhanced API
      const discoveredServers = await enhancedApi.discoverLocalNodeServers();
      
      if (discoveredServers.length === 0) {
        console.warn('⚠️ No servers discovered, using fallback connection');
      } else {
        console.log(`✅ Discovered ${discoveredServers.length} servers:`, discoveredServers);
      }
      
      this.setConnectionState(EnhancedConnectionState.CONNECTING);
      console.log('🔌 Enhanced WebSocket: Connecting to local node...');
      
      // Start WebSocket relay
      console.log('🚀 Starting Tauri WebSocket relay...');
      await invoke('start_ws_relay');
      console.log('✅ Tauri WebSocket relay started');
      
      this.setConnectionState(EnhancedConnectionState.CONNECTED);
      this.emit('connected');
      console.log('✅ Enhanced WebSocket connected successfully');
      
      // Start optimization phase
      this.setConnectionState(EnhancedConnectionState.OPTIMIZING);
      await this.optimizeConnection();
      
      // Automatically authenticate after connection
      console.log('🔐 Starting authentication process...');
      await this.authenticate();
      
    } catch (error) {
      console.error('❌ Enhanced WebSocket connection failed:', error);
      this.setConnectionState(EnhancedConnectionState.FAILED);
      this.emit('error', error);
      this.scheduleReconnect();
    }
    
    await this.setupEventListeners();
  }

  /**
   * Optimize connection for enhanced performance
   */
  private async optimizeConnection(): Promise<void> {
    try {
      console.log('⚡ Optimizing connection for enhanced performance...');
      
      // Get server metrics
      const serverMetrics = await enhancedApi.getEnhancedServerMetrics();
      if (serverMetrics.success) {
        this.lastServerMetrics = serverMetrics.data;
        console.log('📊 Server metrics received:', serverMetrics.data);
      }
      
      // Get connection pool status
      const poolStatus = await enhancedApi.getConnectionPoolStatus();
      if (poolStatus.success) {
        console.log('🔗 Connection pool status:', poolStatus.data);
      }
      
      // Get concurrency metrics
      const concurrencyMetrics = await enhancedApi.getConcurrencyMetrics();
      if (concurrencyMetrics.success) {
        console.log('🔄 Concurrency metrics:', concurrencyMetrics.data);
      }
      
      // Get sync metrics
      const syncMetrics = await enhancedApi.getSyncMetrics();
      if (syncMetrics.success) {
        console.log('🔄 Sync metrics:', syncMetrics.data);
      }
      
      console.log('✅ Connection optimization completed');
      
    } catch (error) {
      console.warn('⚠️ Connection optimization failed:', error);
    }
  }

  /**
   * Enhanced authentication with priority handling
   */
  private async authenticate(): Promise<void> {
    try {
      const authData = getLocalStorage('auth');
      console.log('🔍 Checking for auth data:', authData);
      
      if (!authData || !authData.token) {
        console.log('🔐 No authentication token found');
        return;
      }

      console.log('🔐 Enhanced WebSocket: Authenticating with token...');
      console.log('🔐 Token length:', authData.token.length);
      
      // Send authentication with high priority
      const authMessage: EnhancedWebSocketMessage = {
        type: 'authenticate',
        payload: { token: authData.token },
        priority: 10,
        timestamp: new Date().toISOString()
      };
      
      console.log('📤 Sending authentication message:', authMessage);
      await this.sendMessage(authMessage);
      
      this.setConnectionState(EnhancedConnectionState.AUTHENTICATED);
      this.emit('authenticated', authData);
      console.log('✅ Enhanced WebSocket authenticated successfully');
      
      // Start enhanced heartbeat
      this.startEnhancedHeartbeat();
      
    } catch (error) {
      console.error('❌ Enhanced WebSocket authentication failed:', error);
      this.emit('auth_error', error);
    }
  }

  /**
   * Enhanced heartbeat with connection quality monitoring
   */
  private startEnhancedHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.heartbeatTimer = setInterval(async () => {
      try {
        const startTime = Date.now();
        
        // Send heartbeat with metrics
        const heartbeatMessage: EnhancedWebSocketMessage = {
          type: 'heartbeat',
          payload: {
            timestamp: new Date().toISOString(),
            clientMetrics: this.connectionMetrics
          },
          priority: 1,
          timestamp: new Date().toISOString()
        };
        
        await this.sendMessage(heartbeatMessage);
        
        // Update latency
        const latency = Date.now() - startTime;
        this.updateConnectionMetrics(latency);
        
        // Check connection quality
        this.assessConnectionQuality();
        
      } catch (error) {
        console.warn('⚠️ Heartbeat failed:', error);
        this.connectionMetrics.errorRate++;
      }
    }, 30000); // 30 seconds
    
    console.log('💓 Enhanced heartbeat started');
  }

  /**
   * Update connection metrics
   */
  private updateConnectionMetrics(latency: number): void {
    this.connectionMetrics.latency = latency;
    this.connectionMetrics.lastHeartbeat = new Date();
    
    // Update message throughput (simplified calculation)
    this.connectionMetrics.messageThroughput = this.connectionMetrics.messageThroughput * 0.9 + 0.1;
  }

  /**
   * Assess connection quality based on metrics
   */
  private assessConnectionQuality(): void {
    const { latency, errorRate } = this.connectionMetrics;
    
    let quality: ConnectionMetrics['connectionQuality'] = 'fair';
    
    if (latency < 50 && errorRate < 0.01) {
      quality = 'excellent';
    } else if (latency < 100 && errorRate < 0.05) {
      quality = 'good';
    } else if (latency < 200 && errorRate < 0.1) {
      quality = 'fair';
    } else {
      quality = 'poor';
    }
    
    if (quality !== this.connectionMetrics.connectionQuality) {
      this.connectionMetrics.connectionQuality = quality;
      this.emit('connection_quality_changed', quality);
      console.log(`📊 Connection quality changed to: ${quality}`);
    }
  }

  /**
   * Send message with priority handling
   */
  async sendMessage(message: EnhancedWebSocketMessage): Promise<void> {
    try {
      // Add priority to message if not specified
      if (!message.priority) {
        message.priority = 5; // Default priority
      }
      
      // High priority messages (8-10) are sent immediately
      if (message.priority >= 8) {
        await this.sendImmediateMessage(message);
      } else {
        // Lower priority messages are queued
        this.queueMessage(message);
      }
      
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      this.emit('send_error', { message, error });
    }
  }

  /**
   * Send message immediately (high priority)
   */
  private async sendImmediateMessage(message: EnhancedWebSocketMessage): Promise<void> {
    try {
      await invoke('ws_relay_send', {
        message: JSON.stringify(message)
      });
      
      this.emit('message_sent', message);
      
    } catch (error) {
      console.error('❌ Failed to send immediate message:', error);
      throw error;
    }
  }

  /**
   * Queue message for later processing
   */
  private queueMessage(message: EnhancedWebSocketMessage): void {
    this.priorityQueue.push(message);
    
    // Sort by priority (higher priority first)
    this.priorityQueue.sort((a, b) => (b.priority || 5) - (a.priority || 5));
    
    // Process queue if not already processing
    if (!this.processingQueue) {
      this.processMessageQueue();
    }
  }

  /**
   * Process queued messages
   */
  private async processMessageQueue(): Promise<void> {
    if (this.processingQueue || this.priorityQueue.length === 0) {
      return;
    }
    
    this.processingQueue = true;
    
    try {
      while (this.priorityQueue.length > 0) {
        const message = this.priorityQueue.shift();
        if (message) {
          await this.sendImmediateMessage(message);
          
          // Small delay between messages to prevent flooding
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Handle enhanced real-time updates
   */
  private handleCashBookingUpdate(data: any): void {
    console.log('🎫 Enhanced cash booking update received:', data);
    this.emit('cash_booking_updated', data);
    
    // Trigger UI updates
    this.emit('ui_refresh_required', { type: 'cash_booking', data });
  }

  private handleSeatAvailabilityChange(data: any): void {
    console.log('💺 Enhanced seat availability change:', data);
    this.emit('seat_availability_changed', data);
    
    // Trigger UI updates
    this.emit('ui_refresh_required', { type: 'seat_availability', data });
  }

  private handleQueueUpdate(data: any): void {
    console.log('📋 Enhanced queue update:', data);
    this.emit('queue_update', data);
    
    // Trigger UI updates
    this.emit('ui_refresh_required', { type: 'queue', data });
  }

  private handleFinancialUpdate(data: any): void {
    console.log('💰 Enhanced financial update:', data);
    this.emit('financial_update', data);
    
    // Trigger UI updates
    this.emit('ui_refresh_required', { type: 'financial', data });
  }

  private handleConcurrencySync(data: any): void {
    console.log('🔄 Enhanced concurrency sync:', data);
    this.emit('concurrency_operation_synced', data);
  }

  private handleRealTimeSync(data: any): void {
    console.log('🔄 Enhanced real-time sync:', data);
    this.emit('real_time_sync_update', data);
  }

  /**
   * Subscribe to enhanced real-time updates
   */
  async subscribeToUpdates(entityTypes: string[], filters?: Map<string, any>): Promise<void> {
    try {
      const subscriptionMessage: EnhancedWebSocketMessage = {
        type: 'subscribe',
        payload: {
          entityTypes,
          filters: filters ? Object.fromEntries(filters) : {},
          clientId: this.generateClientId()
        },
        priority: 8,
        timestamp: new Date().toISOString()
      };
      
      await this.sendMessage(subscriptionMessage);
      
      // Add to local subscriptions
      entityTypes.forEach(type => this.subscriptions.add(type));
      
      console.log(`📡 Subscribed to updates: ${entityTypes.join(', ')}`);
      
    } catch (error) {
      console.error('❌ Failed to subscribe to updates:', error);
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get connection metrics
   */
  getConnectionMetrics(): ConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  /**
   * Get server metrics
   */
  getServerMetrics(): any {
    return this.lastServerMetrics;
  }

  /**
   * Get connection state
   */
  getConnectionState(): EnhancedConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === EnhancedConnectionState.CONNECTED || 
           this.connectionState === EnhancedConnectionState.AUTHENTICATED;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.connectionState === EnhancedConnectionState.AUTHENTICATED;
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.isManualClose = true;
    this.setConnectionState(EnhancedConnectionState.DISCONNECTED);
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.emit('disconnected');
    console.log('🔌 Enhanced WebSocket disconnected');
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.isManualClose || this.retryCount >= this.maxRetries) {
      console.log('❌ Max reconnection attempts reached or manual close');
      return;
    }
    
    const delay = this.baseReconnectDelay * Math.pow(2, this.retryCount);
    this.retryCount++;
    
    console.log(`🔄 Scheduling reconnection attempt ${this.retryCount} in ${delay}ms`);
    
    this.setConnectionState(EnhancedConnectionState.RECONNECTING);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Setup event listeners for WebSocket relay
   */
  private async setupEventListeners(): Promise<void> {
    // Listen for relay messages
    if (!this.relayUnlisten) {
      this.relayUnlisten = await listen<string>('ws-relay-message', (event) => {
        this.handleRelayMessage(event.payload);
      });
    }
    
    // Listen for connection closed events
    if (!this.closedUnlisten) {
      this.closedUnlisten = await listen<string>('ws-relay-closed', () => {
        this.handleConnectionClosed();
      });
    }
  }

  /**
   * Handle relay message
   */
  private handleRelayMessage(payload: any): void {
    try {
      let message: EnhancedWebSocketMessage;
      
      if (typeof payload === 'object' && payload !== null) {
        message = payload as EnhancedWebSocketMessage;
      } else if (typeof payload === 'string') {
        message = JSON.parse(payload);
      } else {
        console.warn('⚠️ Unexpected payload type:', typeof payload);
        return;
      }
      
      // Validate message structure
      if (!message || typeof message !== 'object') {
        console.warn('⚠️ Invalid message structure received:', message);
        return;
      }
      
      // Process enhanced message
      this.processEnhancedMessage(message);
      
    } catch (error) {
      console.error('❌ Error handling relay message:', error);
    }
  }

  /**
   * Process enhanced WebSocket message
   */
  private processEnhancedMessage(message: EnhancedWebSocketMessage): void {
    console.log('📦 Processing enhanced message:', message);
    
    // Emit the message for listeners
    this.emit('message', message);
    
    // Emit specific event types
    if (message.type) {
      this.emit(message.type, message.data || message.payload);
    }
    
    // Handle priority-based processing
    if (message.priority && message.priority >= 8) {
      console.log('🚨 High priority message received:', message);
      this.emit('high_priority_message', message);
    }
  }

  /**
   * Handle connection closed
   */
  private handleConnectionClosed(): void {
    console.log('🔌 WebSocket relay connection closed');
    
    if (!this.isManualClose) {
      this.setConnectionState(EnhancedConnectionState.DISCONNECTED);
      this.emit('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * Set connection state
   */
  private setConnectionState(state: EnhancedConnectionState): void {
    this.connectionState = state;
    this.emit('state_changed', state);
  }

  /**
   * Event emitter methods
   */
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

  off(event: string, listener: Function): this {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }
}

// Export singleton instance
export const enhancedWebSocketClient = new EnhancedLocalNodeWebSocketClient();

// Export initialization function
export const initializeEnhancedWebSocket = () => {
  return enhancedWebSocketClient;
}; 