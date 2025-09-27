import mqtt, { MqttClient } from 'mqtt';
import { SERVER_CONFIG } from '../config/server';

export interface MQTTConfig {
  brokerUrl: string;
  clientId: string;
  username?: string;
  password?: string;
  keepalive?: number;
  reconnectPeriod?: number;
  connectTimeout?: number;
}

export interface MQTTMessage {
  topic: string;
  payload: any;
  timestamp: Date;
}

export interface ConnectionStatus {
  connected: boolean;
  connecting: boolean;
  error?: string;
  reconnectAttempts: number;
  lastConnected?: Date;
}

export interface ConnectionMetrics {
  messagesReceived: number;
  messagesSent: number;
  connectionTime: number;
  lastMessageTime?: Date;
}

class MQTTService {
  private client: MqttClient | null = null;
  private config: MQTTConfig;
  private connectionStatus: ConnectionStatus = {
    connected: false,
    connecting: false,
    reconnectAttempts: 0
  };
  private metrics: ConnectionMetrics = {
    messagesReceived: 0,
    messagesSent: 0,
    connectionTime: 0
  };
  private subscriptions: Map<string, Function[]> = new Map();
  private messageQueue: MQTTMessage[] = [];
  private maxQueueSize = 100;
  private connectionStartTime: Date | null = null;

  constructor() {
    this.config = {
      brokerUrl: SERVER_CONFIG.MQTT.BROKER_URL, // WebSocket port for browser compatibility with MQTT path
      clientId: `transportation-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      username: SERVER_CONFIG.MQTT.USERNAME,
      password: SERVER_CONFIG.MQTT.PASSWORD,
      keepalive: 60,
      reconnectPeriod: 5000,
      connectTimeout: 10000
    };
  }

  /**
   * Connect to MQTT broker
   */
  async connect(): Promise<boolean> {
    if (this.client?.connected) {
      console.log('🔌 MQTT already connected');
      return true;
    }

    if (this.connectionStatus.connecting) {
      console.log('🔌 MQTT connection already in progress');
      return false;
    }

    try {
      console.log('🔌 Connecting to MQTT broker...', this.config.brokerUrl);
      console.log('🔌 MQTT connection config:', {
        brokerUrl: this.config.brokerUrl,
        clientId: this.config.clientId,
        username: this.config.username,
        password: this.config.password ? '***' : 'none',
        keepalive: this.config.keepalive,
        reconnectPeriod: this.config.reconnectPeriod,
        connectTimeout: this.config.connectTimeout
      });
      this.connectionStatus.connecting = true;
      this.connectionStartTime = new Date();

      this.client = mqtt.connect(this.config.brokerUrl, {
        clientId: this.config.clientId,
        username: this.config.username,
        password: this.config.password,
        keepalive: this.config.keepalive,
        reconnectPeriod: this.config.reconnectPeriod,
        connectTimeout: this.config.connectTimeout,
        clean: true, // Clean session for browser
        protocolVersion: 4, // MQTT 3.1.1
        will: {
          topic: 'transport/client/status',
          payload: JSON.stringify({
            status: 'offline',
            clientId: this.config.clientId,
            timestamp: new Date().toISOString()
          }),
          qos: 1,
          retain: false
        },
        // WebSocket specific options
        wsOptions: {
          headers: {
            'Sec-WebSocket-Protocol': 'mqtt'
          }
        }
      });

      this.setupEventHandlers();

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.error('❌ MQTT connection timeout');
          this.connectionStatus.connecting = false;
          this.connectionStatus.error = 'Connection timeout';
          resolve(false);
        }, this.config.connectTimeout);

        this.client!.on('connect', () => {
          clearTimeout(timeout);
          this.connectionStatus.connected = true;
          this.connectionStatus.connecting = false;
          this.connectionStatus.reconnectAttempts = 0;
          this.connectionStatus.lastConnected = new Date();
          this.connectionStatus.error = undefined;
          
          if (this.connectionStartTime) {
            this.metrics.connectionTime = Date.now() - this.connectionStartTime.getTime();
          }
          
          console.log('✅ MQTT broker connected successfully');
          
          // Publish online status
          this.publishClientStatus('online');
          
          // Process queued messages
          this.processQueuedMessages();
          
          // Re-subscribe to all topics
          this.resubscribeAll();
          
          resolve(true);
        });
      });

    } catch (error) {
      console.error('❌ MQTT connection error:', error);
      this.connectionStatus.connecting = false;
      this.connectionStatus.error = error instanceof Error ? error.message : 'Unknown error';
      return false;
    }
  }

  /**
   * Setup MQTT event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      console.log('✅ MQTT broker connected');
      this.connectionStatus.connected = true;
      this.connectionStatus.connecting = false;
      this.connectionStatus.reconnectAttempts = 0;
      this.connectionStatus.lastConnected = new Date();
      this.connectionStatus.error = undefined;
    });

    this.client.on('disconnect', () => {
      console.log('❌ MQTT broker disconnected');
      this.connectionStatus.connected = false;
    });

    this.client.on('reconnect', () => {
      this.connectionStatus.reconnectAttempts++;
      console.log(`🔄 MQTT reconnecting... (attempt ${this.connectionStatus.reconnectAttempts})`);
    });

    this.client.on('error', (error) => {
      console.error('❌ MQTT error:', error);
      console.error('❌ MQTT error details:', {
        message: error.message,
        code: (error as any).code,
        errno: (error as any).errno,
        syscall: (error as any).syscall,
        address: (error as any).address,
        port: (error as any).port
      });
      this.connectionStatus.connected = false;
      this.connectionStatus.error = error.message;
    });

    this.client.on('offline', () => {
      console.log('📴 MQTT broker offline');
      this.connectionStatus.connected = false;
    });

    this.client.on('close', () => {
      console.log('🔒 MQTT connection closed');
      this.connectionStatus.connected = false;
    });

    this.client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        this.handleMessage(topic, payload);
      } catch (error) {
        console.error('❌ Error parsing MQTT message:', error);
        this.handleMessage(topic, message.toString());
      }
    });
  }

  /**
   * Handle incoming MQTT messages
   */
  private handleMessage(topic: string, payload: any): void {
    this.metrics.messagesReceived++;
    this.metrics.lastMessageTime = new Date();

    const message: MQTTMessage = {
      topic,
      payload,
      timestamp: new Date()
    };

    // Add to queue if not connected
    if (!this.connectionStatus.connected) {
      this.addToQueue(message);
    }

    // Notify subscribers
    const subscribers = this.subscriptions.get(topic);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(payload, topic);
        } catch (error) {
          console.error('❌ Error in MQTT message handler:', error);
        }
      });
    }

    // Also notify wildcard subscribers
    this.subscriptions.forEach((subscribers, subscriptionTopic) => {
      if (this.matchesTopic(subscriptionTopic, topic)) {
        subscribers.forEach(callback => {
          try {
            callback(payload, topic);
          } catch (error) {
            console.error('❌ Error in MQTT wildcard handler:', error);
          }
        });
      }
    });

    console.log(`📨 MQTT message received: ${topic}`, payload);
  }

  /**
   * Check if a topic matches a subscription pattern
   */
  private matchesTopic(pattern: string, topic: string): boolean {
    if (pattern === topic) return true;
    
    // Handle wildcards
    if (pattern.includes('+')) {
      const patternParts = pattern.split('/');
      const topicParts = topic.split('/');
      
      if (patternParts.length !== topicParts.length) return false;
      
      return patternParts.every((part, index) => {
        return part === '+' || part === topicParts[index];
      });
    }
    
    if (pattern.includes('#')) {
      const patternPrefix = pattern.replace('#', '');
      return topic.startsWith(patternPrefix);
    }
    
    return false;
  }

  /**
   * Subscribe to MQTT topic
   */
  subscribe(topic: string, callback: Function): void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
    
    this.subscriptions.get(topic)!.push(callback);
    
    if (this.client?.connected) {
      this.client.subscribe(topic, { qos: 1 });
      console.log(`📡 Subscribed to MQTT topic: ${topic}`);
    }
  }

  /**
   * Unsubscribe from MQTT topic
   */
  unsubscribe(topic: string, callback?: Function): void {
    if (!this.subscriptions.has(topic)) return;
    
    if (callback) {
      const subscribers = this.subscriptions.get(topic)!;
      const index = subscribers.indexOf(callback);
      if (index > -1) {
        subscribers.splice(index, 1);
      }
      
      if (subscribers.length === 0) {
        this.subscriptions.delete(topic);
        if (this.client?.connected) {
          this.client.unsubscribe(topic);
          console.log(`📡 Unsubscribed from MQTT topic: ${topic}`);
        }
      }
    } else {
      this.subscriptions.delete(topic);
      if (this.client?.connected) {
        this.client.unsubscribe(topic);
        console.log(`📡 Unsubscribed from MQTT topic: ${topic}`);
      }
    }
  }

  /**
   * Publish message to MQTT broker
   */
  async publish(topic: string, payload: any, options: { qos?: 0 | 1 | 2; retain?: boolean } = {}): Promise<boolean> {
    const message: MQTTMessage = {
      topic,
      payload,
      timestamp: new Date()
    };

    if (!this.connectionStatus.connected || !this.client) {
      console.log('📦 MQTT not connected, queuing message:', topic);
      this.addToQueue(message);
      return false;
    }

    try {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      
      this.client.publish(topic, payloadString, {
        qos: options.qos || 1,
        retain: options.retain || false
      });

      this.metrics.messagesSent++;
      console.log(`📤 MQTT published: ${topic}`, payload);
      return true;
    } catch (error) {
      console.error('❌ MQTT publish error:', error);
      this.addToQueue(message);
      return false;
    }
  }

  /**
   * Add message to queue
   */
  private addToQueue(message: MQTTMessage): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest message
    }
    this.messageQueue.push(message);
  }

  /**
   * Process queued messages when connection is restored
   */
  private processQueuedMessages(): void {
    if (this.messageQueue.length === 0) return;

    console.log(`🔄 Processing ${this.messageQueue.length} queued MQTT messages...`);
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach(async (message) => {
      await this.publish(message.topic, message.payload);
    });
  }

  /**
   * Re-subscribe to all topics after reconnection
   */
  private resubscribeAll(): void {
    this.subscriptions.forEach((_, topic) => {
      if (this.client?.connected) {
        this.client.subscribe(topic, { qos: 1 });
        console.log(`📡 Re-subscribed to MQTT topic: ${topic}`);
      }
    });
  }

  /**
   * Publish client status
   */
  async publishClientStatus(status: 'online' | 'offline'): Promise<void> {
    await this.publish('transport/client/status', {
      status,
      clientId: this.config.clientId,
      timestamp: new Date().toISOString()
    }, { qos: 1, retain: false });
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.publishClientStatus('offline');
      this.client.end();
      this.client = null;
      this.connectionStatus.connected = false;
      this.connectionStatus.connecting = false;
      console.log('🔌 MQTT broker disconnected');
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Get connection metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    connected: boolean;
    reconnectAttempts: number;
    queuedMessages: number;
    brokerUrl: string;
    metrics: ConnectionMetrics;
  }> {
    return {
      status: this.connectionStatus.connected ? 'healthy' : 'unhealthy',
      connected: this.connectionStatus.connected,
      reconnectAttempts: this.connectionStatus.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      brokerUrl: this.config.brokerUrl,
      metrics: this.getMetrics()
    };
  }
}

// Singleton instance
let mqttServiceInstance: MQTTService | null = null;

export const getMQTTService = (): MQTTService => {
  if (!mqttServiceInstance) {
    mqttServiceInstance = new MQTTService();
  }
  return mqttServiceInstance;
};

export default MQTTService;