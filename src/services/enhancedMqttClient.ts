import mqtt from 'mqtt';
import { getLocalStorage } from '../lib/storage';
import enhancedApi from './enhancedLocalNodeApi';

export interface MqttMessage {
  type: string;
  data?: any;
  payload?: any;
  timestamp: string;
  priority?: number;
  entityType?: string;
  entityId?: string;
  operationId?: string;
  messageId?: string;
  retryCount?: number;
  source?: 'client' | 'server' | 'local_node';
  target?: string;
  broadcast?: boolean;
  clientId?: string;
}

export enum MqttConnectionState {
  DISCONNECTED = 'disconnected',
  DISCOVERING = 'discovering',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

export interface ConnectionMetrics {
  latency: number;
  messageThroughput: number;
  errorRate: number;
  lastHeartbeat: Date;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  uptime: number;
  messagesSent: number;
  messagesReceived: number;
  reconnectionAttempts: number;
  lastReconnection: Date | null;
}

export interface MqttConfig {
  brokerUrl: string;
  username?: string;
  password?: string;
  clientId: string;
  stationId: string;
  topics: {
    plateDetection: string;
    stationStatus: string;
    systemCommands: string;
    clientCommands: string;
    clientUpdates: string;
    queueUpdates: string;
    bookingUpdates: string;
    financialUpdates: string;
    dashboardUpdates: string;
    seatAvailability: string;
    concurrencySync: string;
    realTimeSync: string;
    authentication: string;
    heartbeat: string;
    subscriptions: string;
  };
}

export class EnhancedMqttClient {
  private connectionState: MqttConnectionState = MqttConnectionState.DISCONNECTED;
  private eventListeners: Map<string, Function[]> = new Map();
  private isManualClose = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();
  private connectionMetrics: ConnectionMetrics;
  private retryCount = 0;
  private maxRetries = 10;
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private heartbeatInterval = 30000;
  
  // MQTT client
  private client: mqtt.MqttClient | null = null;
  private config: MqttConfig | null = null;
  
  // Message handling
  private priorityQueue: MqttMessage[] = [];
  private processingQueue = false;
  private messageCache: Map<string, MqttMessage> = new Map();
  private failedMessages: Map<string, { message: MqttMessage; retryCount: number; lastAttempt: Date }> = new Map();
  private lastMessageId = 0;
  private connectionStartTime: Date | null = null;
  private serverDiscoveryCache: any[] = [];

  constructor() {
    this.connectionMetrics = {
      latency: 0,
      messageThroughput: 0,
      errorRate: 0,
      lastHeartbeat: new Date(),
      connectionQuality: 'fair',
      uptime: 0,
      messagesSent: 0,
      messagesReceived: 0,
      reconnectionAttempts: 0,
      lastReconnection: null
    };
    
    this.setupEnhancedEventListeners();
  }

  /**
   * Setup enhanced event listeners for real-time updates
   */
  private setupEnhancedEventListeners(): void {
    // Core system events
    this.on('cash_booking_updated', this.handleCashBookingUpdate.bind(this));
    this.on('seat_availability_changed', this.handleSeatAvailabilityChange.bind(this));
    this.on('queue_update', this.handleQueueUpdate.bind(this));
    this.on('financial_update', this.handleFinancialUpdate.bind(this));
    this.on('concurrency_operation_synced', this.handleConcurrencySync.bind(this));
    this.on('real_time_sync_update', this.handleRealTimeSync.bind(this));
    
    // Enhanced MQTT events
    this.on('connection_quality_changed', this.handleConnectionQualityChange.bind(this));
    this.on('server_discovered', this.handleServerDiscovered.bind(this));
    this.on('health_check', this.handleHealthCheck.bind(this));
    this.on('plate_detection', this.handlePlateDetection.bind(this));
    this.on('dashboard_update', this.handleDashboardUpdate.bind(this));
  }

  /**
   * Establish MQTT connection with enhanced discovery
   */
  async connect(): Promise<void> {
    if (this.connectionState === MqttConnectionState.CONNECTED || 
        this.connectionState === MqttConnectionState.AUTHENTICATED ||
        this.connectionState === MqttConnectionState.CONNECTING) {
      return;
    }
    
    this.setConnectionState(MqttConnectionState.DISCOVERING);
    this.isManualClose = false;
    this.connectionStartTime = new Date();
    
    try {
      console.log('🔍 Enhanced MQTT: Discovering local node servers...');
      
      // Enhanced server discovery with caching
      const discoveredServers = await this.discoverServersWithFallback();
      
      if (discoveredServers.length === 0) {
        throw new Error('No local node servers discovered');
      }
      
      console.log(`✅ Discovered ${discoveredServers.length} servers:`, discoveredServers);
      this.serverDiscoveryCache = discoveredServers;
      
      // Build MQTT configuration from discovered server
      const server = discoveredServers[0]; // Use the first (fastest) server
      this.config = this.buildMqttConfig(server);
      
      this.setConnectionState(MqttConnectionState.CONNECTING);
      console.log('🔌 Enhanced MQTT: Establishing connection...');
      
      // Connect to MQTT broker
      await this.connectToMqttBroker();
      
      this.setConnectionState(MqttConnectionState.CONNECTED);
      this.emit('connected');
      console.log('✅ Enhanced MQTT connected successfully');
      
      // Authenticate with enhanced security
      await this.authenticateWithRetry();
      
    } catch (error) {
      console.error('❌ Enhanced MQTT connection failed:', error);
      this.setConnectionState(MqttConnectionState.FAILED);
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Discover servers with multiple fallback strategies
   */
  private async discoverServersWithFallback(): Promise<any[]> {
    try {
      // Try enhanced API discovery first
      const discoveredServers = await enhancedApi.discoverLocalNodeServers();
      if (discoveredServers.length > 0) {
        return discoveredServers;
      }
      
      // Fallback to hardcoded localhost
      console.log('🔄 Using hardcoded localhost fallback...');
      return [{ ip: '127.0.0.1', port: 3001, url: 'http://127.0.0.1:3001' }];
      
    } catch (error) {
      console.warn('⚠️ Server discovery failed, using fallback:', error);
      return [{ ip: '127.0.0.1', port: 3001, url: 'http://127.0.0.1:3001' }];
    }
  }

  /**
   * Build MQTT configuration from discovered server
   */
  private buildMqttConfig(server: any): MqttConfig {
    // Extract IP from server URL if needed
    const serverIp = server.ip || '127.0.0.1';
    const stationId = 'monastir-main-station'; // This should come from config
    const clientId = `nqlix-desktop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    return {
      brokerUrl: `ws://${serverIp}:9001`, // Use WebSocket MQTT port for Tauri/browser environment
      clientId,
      stationId,
      topics: {
        plateDetection: `louaj/stations/${stationId}/plate-detection`,
        stationStatus: `louaj/stations/${stationId}/status`,
        systemCommands: `louaj/stations/${stationId}/commands`,
        clientCommands: `louaj/stations/${stationId}/client-commands`,
        clientUpdates: `louaj/stations/${stationId}/client-updates`,
        queueUpdates: `louaj/stations/${stationId}/queue-updates`,
        bookingUpdates: `louaj/stations/${stationId}/booking-updates`,
        financialUpdates: `louaj/stations/${stationId}/financial-updates`,
        dashboardUpdates: `louaj/stations/${stationId}/dashboard-updates`,
        seatAvailability: `louaj/stations/${stationId}/seat-availability`,
        concurrencySync: `louaj/stations/${stationId}/concurrency-sync`,
        realTimeSync: `louaj/stations/${stationId}/real-time-sync`,
        authentication: `louaj/stations/${stationId}/authentication`,
        heartbeat: `louaj/stations/${stationId}/heartbeat`,
        subscriptions: `louaj/stations/${stationId}/subscriptions`,
      }
    };
  }

  /**
   * Connect to MQTT broker
   */
  private async connectToMqttBroker(): Promise<void> {
    if (!this.config) {
      throw new Error('MQTT configuration not available');
    }

    try {
      console.log(`🚀 Connecting to MQTT broker: ${this.config.brokerUrl}`);
      
      const options: mqtt.IClientOptions = {
        clientId: this.config.clientId,
        clean: true,
        connectTimeout: 30000,
        reconnectPeriod: 0, // We handle reconnection manually
        keepalive: 60,
        protocolVersion: 4, // MQTT 3.1.1
      };

      if (this.config.username && this.config.password) {
        options.username = this.config.username;
        options.password = this.config.password;
      }

      this.client = mqtt.connect(this.config.brokerUrl, options);

      return new Promise((resolve, reject) => {
        if (!this.client) {
          reject(new Error('Failed to create MQTT client'));
          return;
        }

        this.client.on('connect', () => {
          console.log('✅ MQTT Connected successfully');
          this.setConnectionState(MqttConnectionState.CONNECTED);
          this.retryCount = 0;
          this.subscribeToTopics();
          this.startEnhancedHeartbeat();
          resolve();
        });

        this.client.on('message', this.handleMessage.bind(this));
        
        this.client.on('error', (error) => {
          console.error('❌ MQTT Connection error:', error);
          this.connectionMetrics.errorRate++;
          reject(error);
        });

        this.client.on('close', () => {
          console.log('🔌 MQTT Connection closed');
          this.setConnectionState(MqttConnectionState.DISCONNECTED);
          this.stopHeartbeat();
          this.emit('disconnected');
          
          if (!this.isManualClose) {
            this.scheduleReconnect();
          }
        });

        this.client.on('offline', () => {
          console.log('📱 MQTT Client offline');
          this.setConnectionState(MqttConnectionState.DISCONNECTED);
        });

        this.client.on('reconnect', () => {
          console.log('🔄 MQTT Reconnecting...');
          this.retryCount++;
          this.connectionMetrics.reconnectionAttempts++;
          this.connectionMetrics.lastReconnection = new Date();
        });
      });

    } catch (error) {
      console.error('❌ Failed to connect to MQTT broker:', error);
      throw error;
    }
  }

  /**
   * Subscribe to MQTT topics
   */
  private subscribeToTopics(): void {
    if (!this.client || !this.config) return;

    // Subscribe to broadcast updates
    const broadcastTopics = [
      this.config.topics.clientUpdates,
      this.config.topics.queueUpdates,
      this.config.topics.bookingUpdates,
      this.config.topics.financialUpdates,
      this.config.topics.dashboardUpdates,
      this.config.topics.seatAvailability,
      this.config.topics.plateDetection,
      this.config.topics.stationStatus,
    ];

    // Subscribe to client-specific topics
    const clientSpecificTopics = [
      `${this.config.topics.clientUpdates}/${this.config.clientId}`,
      `${this.config.topics.authentication}/${this.config.clientId}`,
    ];

    const allTopics = [...broadcastTopics, ...clientSpecificTopics];

    allTopics.forEach(topic => {
      this.client!.subscribe(topic, { qos: 1 }, (error) => {
        if (error) {
          console.error(`❌ Failed to subscribe to ${topic}:`, error);
        } else {
          console.log(`📡 Subscribed to topic: ${topic}`);
        }
      });
    });
  }

  /**
   * Handle incoming MQTT messages
   */
  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    try {
      const messageStr = payload.toString();
      let message: MqttMessage;

      try {
        message = JSON.parse(messageStr);
      } catch (parseError) {
        console.error('❌ Failed to parse MQTT message:', parseError);
        return;
      }

      console.log(`📨 MQTT Message received on ${topic}:`, message.type || 'unknown');
      
      // Update metrics
      this.connectionMetrics.messagesReceived++;
      message.timestamp = message.timestamp || new Date().toISOString();

      // Process message
      this.processEnhancedMessage(message, topic);

    } catch (error) {
      console.error('❌ Error handling MQTT message:', error);
      this.connectionMetrics.errorRate++;
    }
  }

  /**
   * Process enhanced MQTT message
   */
  private processEnhancedMessage(message: MqttMessage, topic: string): void {
    console.log('📦 Processing enhanced message:', message);
    
    // Cache message if it has an ID
    if (message.messageId) {
      this.messageCache.set(message.messageId, message);
    }
    
    // Emit the message for listeners
    this.emit('message', { message, topic });
    
    // Emit specific event types
    if (message.type) {
      this.emit(message.type, message.data || message.payload);
    }
    
    // Handle priority-based processing
    if (message.priority && message.priority >= 8) {
      console.log('🚨 High priority message received:', message);
      this.emit('high_priority_message', message);
    }
    
    // Handle broadcast messages
    if (message.broadcast) {
      this.emit('broadcast_message', message);
    }

    // Handle specific message types
    this.handleSpecificMessageTypes(message);
  }

  /**
   * Handle specific message types
   */
  private handleSpecificMessageTypes(message: MqttMessage): void {
    switch (message.type) {
      case 'authenticated':
        this.handleAuthenticationResponse(message);
        break;
      case 'auth_failed':
        this.handleAuthenticationFailed(message);
        break;
      case 'heartbeat_response':
        this.handleHeartbeatResponse(message);
        break;
      case 'test_message_response':
        this.handleTestMessageResponse(message);
        break;
      case 'performance_test_response':
        this.handlePerformanceTestResponse(message);
        break;
      case 'dashboard_data':
        this.handleDashboardData(message);
        break;
      case 'queue_data':
        this.handleQueueData(message);
        break;
      default:
        // Handle other message types
        break;
    }
  }

  /**
   * Handle authentication response
   */
  private handleAuthenticationResponse(message: MqttMessage): void {
    console.log('✅ Authentication successful:', message.payload);
    this.setConnectionState(MqttConnectionState.AUTHENTICATED);
    this.emit('authenticated', message.payload);
    
    // Subscribe to real-time updates after authentication
    this.subscribeToUpdates([
      'queue_update',
      'cash_booking_updated',
      'seat_availability_changed',
      'financial_update',
      'dashboard_update',
      'plate_detection'
    ]);
  }

  /**
   * Handle authentication failed
   */
  private handleAuthenticationFailed(message: MqttMessage): void {
    console.error('❌ Authentication failed:', message.payload);
    this.emit('auth_error', message.payload);
  }

  /**
   * Handle heartbeat response
   */
  private handleHeartbeatResponse(message: MqttMessage): void {
    const now = Date.now();
    if (message.timestamp) {
      const latency = now - new Date(message.timestamp).getTime();
      this.updateConnectionMetrics(latency);
    }
    
    this.connectionMetrics.lastHeartbeat = new Date();
    this.emit('heartbeat_received', message.payload);
  }

  /**
   * Handle test message response
   */
  private handleTestMessageResponse(message: MqttMessage): void {
    console.log('🧪 Test message response:', message.payload);
    this.emit('test_message_response', message.payload);
  }

  /**
   * Handle performance test response
   */
  private handlePerformanceTestResponse(message: MqttMessage): void {
    console.log('⚡ Performance test response:', message.payload);
    this.emit('performance_test_response', message.payload);
  }

  /**
   * Handle dashboard data
   */
  private handleDashboardData(message: MqttMessage): void {
    console.log('📊 Dashboard data received');
    this.emit('dashboard_data_received', message.payload);
  }

  /**
   * Handle queue data
   */
  private handleQueueData(message: MqttMessage): void {
    console.log('📋 Queue data received');
    this.emit('queue_data_received', message.payload);
  }

  /**
   * Authenticate with retry mechanism
   */
  private async authenticateWithRetry(): Promise<void> {
    const maxAuthRetries = 3;
    let authRetries = 0;
    
    while (authRetries < maxAuthRetries) {
      try {
        await this.authenticate();
        return;
      } catch (error) {
        authRetries++;
        console.warn(`⚠️ Authentication attempt ${authRetries} failed:`, error);
        
        if (authRetries < maxAuthRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * authRetries));
        }
      }
    }
    
    throw new Error('Authentication failed after maximum retries');
  }

  /**
   * Enhanced authentication with security features
   */
  private async authenticate(): Promise<void> {
    try {
      const authData = getLocalStorage('auth');
      console.log('🔍 Checking for auth data');
      
      if (!authData || !authData.token) {
        console.log('🔐 No authentication token found');
        return;
      }

      console.log('🔐 Enhanced MQTT: Authenticating with token...');
      
      // Send authentication with high priority and security
      const authMessage: MqttMessage = {
        type: 'authenticate',
        payload: { 
          token: authData.token,
          clientId: this.config?.clientId,
          timestamp: new Date().toISOString(),
          securityLevel: 'enhanced',
          clientType: 'desktop-app'
        },
        priority: 10,
        timestamp: new Date().toISOString(),
        source: 'client',
        clientId: this.config?.clientId
      };
      
      console.log('📤 Sending authentication message');
      await this.sendMessage(authMessage);
      
      console.log('✅ Authentication message sent');
      
    } catch (error) {
      console.error('❌ Enhanced MQTT authentication failed:', error);
      this.emit('auth_error', error);
      throw error;
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
        
        // Send heartbeat with enhanced metrics
        const heartbeatMessage: MqttMessage = {
          type: 'heartbeat',
          payload: {
            timestamp: new Date().toISOString(),
            clientMetrics: this.connectionMetrics,
            connectionHealth: {
              uptime: this.connectionMetrics.uptime,
              messageQueueSize: this.priorityQueue.length,
              failedMessagesCount: this.failedMessages.size,
              connectionQuality: this.connectionMetrics.connectionQuality
            }
          },
          priority: 1,
          timestamp: new Date().toISOString(),
          source: 'client',
          clientId: this.config?.clientId
        };
        
        await this.sendMessage(heartbeatMessage);
        
        // Assess connection quality
        this.assessConnectionQuality();
        
        // Emit health check event
        this.emit('health_check', {
          quality: this.connectionMetrics.connectionQuality,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.warn('⚠️ Heartbeat failed:', error);
        this.connectionMetrics.errorRate++;
        this.emit('heartbeat_failed', error);
      }
    }, this.heartbeatInterval);
    
    console.log('💓 Enhanced heartbeat started');
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('💓 Enhanced heartbeat stopped');
    }
  }

  /**
   * Update connection metrics
   */
  private updateConnectionMetrics(latency: number): void {
    this.connectionMetrics.latency = latency;
    this.connectionMetrics.lastHeartbeat = new Date();
    
    // Update message throughput (exponential moving average)
    this.connectionMetrics.messageThroughput = 
      this.connectionMetrics.messageThroughput * 0.9 + 0.1;
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
   * Send message with enhanced priority handling and reliability
   */
  async sendMessage(message: MqttMessage): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error('MQTT client not connected');
    }

    try {
      // Add metadata to message
      if (!message.messageId) {
        message.messageId = this.generateMessageId();
      }
      if (!message.timestamp) {
        message.timestamp = new Date().toISOString();
      }
      if (!message.priority) {
        message.priority = 5;
      }
      message.source = 'client';
      message.clientId = this.config.clientId;
      
      // Determine target topic
      let targetTopic = this.config.topics.clientCommands;
      
      // Route specific message types to appropriate topics
      switch (message.type) {
        case 'authenticate':
          targetTopic = this.config.topics.authentication;
          break;
        case 'heartbeat':
          targetTopic = this.config.topics.heartbeat;
          break;
        case 'subscribe':
          targetTopic = this.config.topics.subscriptions;
          break;
        default:
          targetTopic = this.config.topics.clientCommands;
      }
      
      // High priority messages (8-10) are sent immediately
      if (message.priority >= 8) {
        await this.sendImmediateMessage(message, targetTopic);
      } else if (message.priority >= 5) {
        // Medium priority messages go to priority queue
        this.queueMessage(message, targetTopic);
      } else {
        // Low priority messages are sent with delay
        setTimeout(() => this.sendImmediateMessage(message, targetTopic), 100);
      }
      
      this.connectionMetrics.messagesSent++;
      
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      
      // Add to failed messages for retry
      if (message.messageId) {
        this.failedMessages.set(message.messageId, {
          message,
          retryCount: 0,
          lastAttempt: new Date()
        });
      }
      
      this.emit('send_error', { message, error });
      throw error;
    }
  }

  /**
   * Send message immediately (high priority)
   */
  private async sendImmediateMessage(message: MqttMessage, topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('MQTT client not available'));
        return;
      }

      this.client.publish(topic, JSON.stringify(message), { qos: 1 }, (error) => {
        if (error) {
          console.error('❌ Failed to send immediate message:', error);
          reject(error);
        } else {
          this.emit('message_sent', message);
          resolve();
        }
      });
    });
  }

  /**
   * Queue message for later processing
   */
  private queueMessage(message: MqttMessage, topic: string): void {
    this.priorityQueue.push({ ...message, target: topic } as any);
    
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
          const topic = (message as any).target || this.config?.topics.clientCommands;
          await this.sendImmediateMessage(message, topic);
          
          // Small delay between messages to prevent flooding
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Subscribe to enhanced real-time updates
   */
  async subscribeToUpdates(entityTypes: string[]): Promise<void> {
    try {
      const subscriptionMessage: MqttMessage = {
        type: 'subscribe',
        payload: {
          entityTypes,
          clientId: this.config?.clientId,
          subscriptionId: this.generateSubscriptionId()
        },
        priority: 8,
        timestamp: new Date().toISOString(),
        source: 'client',
        clientId: this.config?.clientId
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
   * Handle enhanced real-time updates
   */
  private handleCashBookingUpdate(data: any): void {
    console.log('🎫 Enhanced cash booking update received:', data);
    this.emit('cash_booking_updated', data);
    this.emit('ui_refresh_required', { type: 'cash_booking', data });
  }

  private handleSeatAvailabilityChange(data: any): void {
    console.log('💺 Enhanced seat availability change:', data);
    this.emit('seat_availability_changed', data);
    this.emit('ui_refresh_required', { type: 'seat_availability', data });
  }

  private handleQueueUpdate(data: any): void {
    console.log('📋 Enhanced queue update:', data);
    this.emit('queue_update', data);
    this.emit('ui_refresh_required', { type: 'queue', data });
  }

  private handleFinancialUpdate(data: any): void {
    console.log('💰 Enhanced financial update:', data);
    this.emit('financial_update', data);
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

  private handleConnectionQualityChange(quality: string): void {
    console.log('📊 Connection quality changed:', quality);
    this.emit('connection_quality_changed', quality);
  }

  private handleServerDiscovered(servers: any[]): void {
    console.log('🔍 Servers discovered:', servers);
    this.emit('servers_discovered', servers);
  }

  private handleHealthCheck(data: any): void {
    console.log('💓 Health check:', data);
    this.emit('health_check', data);
  }

  private handlePlateDetection(data: any): void {
    console.log('🚗 Plate detection received:', data);
    this.emit('plate_detection', data);
  }

  private handleDashboardUpdate(data: any): void {
    console.log('📊 Dashboard update received:', data);
    this.emit('dashboard_update', data);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${++this.lastMessageId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Test connection and send test message
   */
  async sendTestMessage(payload: any = {}): Promise<void> {
    const testMessage: MqttMessage = {
      type: 'test_message',
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
        testId: Math.random().toString(36).substring(2, 9)
      },
      priority: 5,
      timestamp: new Date().toISOString(),
      source: 'client'
    };

    await this.sendMessage(testMessage);
    console.log('🧪 Test message sent');
  }

  /**
   * Send performance test
   */
  async sendPerformanceTest(): Promise<void> {
    const performanceMessage: MqttMessage = {
      type: 'performance_test',
      payload: {
        timestamp: new Date().toISOString(),
        testId: Math.random().toString(36).substring(2, 9)
      },
      priority: 6,
      timestamp: new Date().toISOString(),
      source: 'client'
    };

    await this.sendMessage(performanceMessage);
    console.log('⚡ Performance test sent');
  }

  /**
   * Request dashboard data
   */
  async requestDashboardData(): Promise<void> {
    const dashboardRequest: MqttMessage = {
      type: 'get_dashboard_data',
      payload: {
        timestamp: new Date().toISOString()
      },
      priority: 7,
      timestamp: new Date().toISOString(),
      source: 'client'
    };

    await this.sendMessage(dashboardRequest);
    console.log('📊 Dashboard data requested');
  }

  /**
   * Request queue data
   */
  async requestQueueData(): Promise<void> {
    const queueRequest: MqttMessage = {
      type: 'get_queue_data',
      payload: {
        timestamp: new Date().toISOString()
      },
      priority: 7,
      timestamp: new Date().toISOString(),
      source: 'client'
    };

    await this.sendMessage(queueRequest);
    console.log('📋 Queue data requested');
  }

  /**
   * Get connection metrics
   */
  getConnectionMetrics(): ConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  /**
   * Get connection state
   */
  getConnectionState(): MqttConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === MqttConnectionState.CONNECTED || 
           this.connectionState === MqttConnectionState.AUTHENTICATED;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.connectionState === MqttConnectionState.AUTHENTICATED;
  }

  /**
   * Disconnect with cleanup
   */
  disconnect(): void {
    this.isManualClose = true;
    this.setConnectionState(MqttConnectionState.DISCONNECTED);
    
    // Clear all timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Clear queues and caches
    this.priorityQueue = [];
    this.messageCache.clear();
    this.failedMessages.clear();
    
    // Disconnect MQTT client
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    
    this.emit('disconnected');
    console.log('🔌 Enhanced MQTT disconnected');
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.isManualClose || this.retryCount >= this.maxRetries) {
      console.log('❌ Max reconnection attempts reached or manual close');
      return;
    }
    
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.retryCount),
      this.maxReconnectDelay
    );
    this.retryCount++;
    
    console.log(`🔄 Scheduling reconnection attempt ${this.retryCount} in ${delay}ms`);
    
    this.setConnectionState(MqttConnectionState.RECONNECTING);
    this.connectionMetrics.reconnectionAttempts++;
    this.connectionMetrics.lastReconnection = new Date();
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Set connection state
   */
  private setConnectionState(state: MqttConnectionState): void {
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

  /**
   * Get MQTT configuration
   */
  getMqttConfig(): MqttConfig | null {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MqttConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...config };
      console.log('🔧 MQTT configuration updated');
    }
  }
}

// Export singleton instance
export const enhancedMqttClient = new EnhancedMqttClient();

// Export initialization function
export const initializeEnhancedMqtt = () => {
  return enhancedMqttClient;
};
