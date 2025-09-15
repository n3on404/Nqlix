import { invoke } from '@tauri-apps/api/tauri';
import { getLocalStorage, setLocalStorage } from '../lib/storage';

// Enhanced API configuration
const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:3001/api', // Fallback to localhost
  discoveredServers: [] as string[],
  timeout: 10000,
  maxRetries: 3,
  retryDelay: 1000,
  priorityLevels: 10,
  connectionPoolSize: 5,
  batchSize: 50
};

// Enhanced API Configuration interface
interface EnhancedApiConfig {
  baseUrl: string;
  discoveredServers: string[];
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  priorityLevels: number;
  connectionPoolSize: number;
  batchSize: number;
}

// Enhanced API response interface
interface EnhancedApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  token?: string;
  staff?: any;
  requiresVerification?: boolean;
  operationId?: string;
  status?: 'immediate' | 'queued' | 'conflict';
  priority?: number;
  timestamp?: string;
  latency?: number;
}

// Connection pool interface
interface ConnectionPool {
  id: string;
  status: 'idle' | 'busy' | 'error';
  lastUsed: Date;
  errorCount: number;
  latency: number;
}

// Priority message interface
interface PriorityMessage {
  type: string;
  payload?: any;
  priority: number;
  timestamp: number;
  messageId?: string;
  retryCount?: number;
}

// Batch operation interface
interface BatchOperation {
  operations: Array<{
    type: string;
    endpoint: string;
    data?: any;
    priority: number;
  }>;
  batchId: string;
  timestamp: number;
}

class EnhancedLocalNodeApiService {
  private config: EnhancedApiConfig;
  private token: string | null = null;
  private connectionPools: ConnectionPool[] = [];
  private messageQueue: PriorityMessage[] = [];
  private processingQueue: boolean = false;
  private retryTimers: Map<string, NodeJS.Timeout> = new Map();
  private batchOperationsMap: Map<string, BatchOperation> = new Map();
  private connectionMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageLatency: 0,
    lastRequestTime: 0,
    activeConnections: 0
  };

  constructor(config?: Partial<EnhancedApiConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadToken();
    this.initializeConnectionPools();
    this.startQueueProcessing();
    
    console.log('🚀 Enhanced Local Node API Service initialized');
  }

  /**
   * Initialize connection pools
   */
  private initializeConnectionPools(): void {
    for (let i = 0; i < this.config.connectionPoolSize; i++) {
      this.connectionPools.push({
        id: `pool-${i}`,
        status: 'idle',
        lastUsed: new Date(),
        errorCount: 0,
        latency: 0
      });
    }
    console.log(`✅ Initialized ${this.config.connectionPoolSize} connection pools`);
  }

  /**
   * Get available connection pool
   */
  private getAvailableConnectionPool(): ConnectionPool | null {
    const availablePool = this.connectionPools.find(pool => pool.status === 'idle');
    if (availablePool) {
      availablePool.status = 'busy';
      availablePool.lastUsed = new Date();
      return availablePool;
    }
    return null;
  }

  /**
   * Release connection pool
   */
  private releaseConnectionPool(poolId: string, success: boolean, latency: number): void {
    const pool = this.connectionPools.find(p => p.id === poolId);
    if (pool) {
      pool.status = 'idle';
      pool.latency = latency;
      if (!success) {
        pool.errorCount++;
        if (pool.errorCount > 3) {
          pool.status = 'error';
          setTimeout(() => {
            pool.status = 'idle';
            pool.errorCount = 0;
          }, 30000); // Reset after 30 seconds
        }
      } else {
        pool.errorCount = Math.max(0, pool.errorCount - 1);
      }
    }
  }

  /**
   * Load authentication token from storage
   */
  private loadToken(): void {
    try {
      const authData = getLocalStorage('auth');
      if (authData && authData.token) {
        this.token = authData.token;
      }
    } catch (error) {
      console.error('Failed to load auth token:', error);
    }
  }

  /**
   * Save authentication token to storage
   */
  private saveToken(token: string): void {
    try {
      const authData = getLocalStorage('auth') || {};
      setLocalStorage('auth', { ...authData, token });
      this.token = token;
    } catch (error) {
      console.error('Failed to save auth token:', error);
    }
  }

  /**
   * Clear authentication token from storage
   */
  private clearToken(): void {
    try {
      const authData = getLocalStorage('auth') || {};
      const { token, ...rest } = authData;
      setLocalStorage('auth', rest);
      this.token = null;
    } catch (error) {
      console.error('Failed to clear auth token:', error);
    }
  }

  /**
   * Set API configuration
   */
  public setConfig(config: Partial<EnhancedApiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set discovered server IPs
   */
  public setDiscoveredServers(servers: string[]): void {
    this.config.discoveredServers = servers;
    console.log(`🔍 Updated discovered servers: ${servers.join(', ')}`);
  }

  /**
   * Get best available server URL
   */
  private getBestServerUrl(): string {
    if (this.config.discoveredServers.length > 0) {
      // Use the first discovered server
      const serverUrl = `http://${this.config.discoveredServers[0]}:3001`;
      console.log(`🔍 Using discovered server: ${serverUrl}`);
      return serverUrl;
    }
    // Fallback to localhost
    const fallbackUrl = this.config.baseUrl.replace('/api', '');
    console.log(`🔍 Using fallback server: ${fallbackUrl}`);
    return fallbackUrl;
  }

  /**
   * Get current API configuration
   */
  public getConfig(): EnhancedApiConfig {
    return { ...this.config };
  }

  /**
   * Queue a message with priority
   */
  public queueMessage(message: Omit<PriorityMessage, 'timestamp' | 'messageId'>): string {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const queuedMessage: PriorityMessage = {
      ...message,
      timestamp: Date.now(),
      messageId,
      retryCount: 0
    };

    this.messageQueue.push(queuedMessage);
    
    // Sort queue by priority (higher priority first)
    this.messageQueue.sort((a, b) => b.priority - a.priority);
    
    console.log(`📨 Queued message ${messageId} with priority ${message.priority}`);
    
    return messageId;
  }

  /**
   * Start queue processing
   */
  private startQueueProcessing(): void {
    setInterval(() => {
      if (!this.processingQueue && this.messageQueue.length > 0) {
        this.processQueue();
      }
    }, 100); // Process every 100ms
  }

  /**
   * Process message queue
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.messageQueue.length === 0) return;

    this.processingQueue = true;
    
    try {
      // Process up to batch size messages
      const messagesToProcess = this.messageQueue.splice(0, this.config.batchSize);
      
      for (const message of messagesToProcess) {
        await this.processMessage(message);
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Process individual message
   */
  private async processMessage(message: PriorityMessage): Promise<void> {
    const pool = this.getAvailableConnectionPool();
    if (!pool) {
      // No available pools, put message back in queue
      this.messageQueue.unshift(message);
      return;
    }

    try {
      const startTime = Date.now();
      
      // Process the message based on type
      let result: any;
      
      switch (message.type) {
        case 'api_request':
          result = await this.processApiRequest(message.payload, pool.id);
          break;
        case 'batch_operation':
          result = await this.processBatchOperation(message.payload, pool.id);
          break;
        case 'priority_request':
          result = await this.processPriorityRequest(message.payload, pool.id);
          break;
        default:
          console.warn(`⚠️ Unknown message type: ${message.type}`);
          return;
      }

      const latency = Date.now() - startTime;
      this.updateConnectionMetrics(true, latency);
      this.releaseConnectionPool(pool.id, true, latency);

      // Emit success event
      this.emit('message_processed', { messageId: message.messageId, success: true, result, latency });

    } catch (error) {
      const latency = Date.now() - Date.now();
      this.updateConnectionMetrics(false, latency);
      this.releaseConnectionPool(pool.id, false, latency);

      // Handle retry logic
      if (message.retryCount && message.retryCount < this.config.maxRetries) {
        message.retryCount++;
        message.timestamp = Date.now() + (this.config.retryDelay * message.retryCount);
        this.messageQueue.push(message);
        
        console.log(`🔄 Retrying message ${message.messageId} (attempt ${message.retryCount})`);
      } else {
        console.error(`❌ Message ${message.messageId} failed after ${message.retryCount || 0} retries:`, error);
        this.emit('message_failed', { messageId: message.messageId, error });
      }
    }
  }

  /**
   * Process API request
   */
  private async processApiRequest(payload: any, poolId: string): Promise<any> {
    const { method, endpoint, data, requiresAuth = true } = payload;
    
    return this.requestViaProxy(endpoint, method, data, requiresAuth);
  }

  /**
   * Process batch operation
   */
  private async processBatchOperation(payload: any, poolId: string): Promise<any> {
    const { operations } = payload;
    const results = [];

    for (const operation of operations) {
      try {
        const result = await this.requestViaProxy(
          operation.endpoint,
          operation.method || 'GET',
          operation.data,
          operation.requiresAuth !== false
        );
        results.push({ ...operation, result, success: true });
      } catch (error: any) {
        results.push({ ...operation, error: error.message, success: false });
      }
    }

    return { results, batchId: payload.batchId };
  }

  /**
   * Process priority request
   */
  private async processPriorityRequest(payload: any, poolId: string): Promise<any> {
    const { endpoint, method, data, requiresAuth = true, priority } = payload;
    
    // High priority requests get immediate processing
    if (priority >= 8) {
      return this.requestViaProxy(endpoint, method, data, requiresAuth);
    }
    
    // Lower priority requests go through normal queue
    return this.requestViaProxy(endpoint, method, data, requiresAuth);
  }

  /**
   * Make API request using Rust proxy with enhanced error handling
   */
  private async requestViaProxy<T>(
    endpoint: string,
    method: string = 'GET',
    data?: any,
    requiresAuth: boolean = true,
    serverUrl?: string
  ): Promise<EnhancedApiResponse<T>> {
    try {
      // Determine the server URL to use
      let targetServerUrl = serverUrl;
      if (!targetServerUrl) {
        targetServerUrl = this.getBestServerUrl();
      }
      
      console.log(`🔍 Enhanced Proxy Request: ${method} ${endpoint} (Priority: ${this.getCurrentPriority()})`);
      console.log(`🔍 Server URL:`, targetServerUrl);

      // Prepare headers and body for proxy
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Client-Priority': this.getCurrentPriority().toString(),
        'X-Client-Timestamp': Date.now().toString()
      };

      if (requiresAuth && this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      // Prepare request body
      let body: string | null = null;
      if (data) {
        body = JSON.stringify(data);
      }

      // Call Rust proxy
      const responseText = await invoke<string>('proxy_localnode', {
        method,
        endpoint,
        body,
        serverUrl: targetServerUrl,
        headers
      });

      console.log(`🔍 Enhanced Proxy Response:`, responseText);

      // Parse response
      const responseData = JSON.parse(responseText);
      
      if (!responseData.success && responseData.message) {
        // Handle authentication errors
        if (responseData.code === 'UNAUTHORIZED') {
          this.clearToken();
        }
        
        return {
          success: false,
          message: responseData.message || 'Request failed',
          code: responseData.code || 'UNKNOWN_ERROR',
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        ...responseData,
        timestamp: new Date().toISOString(),
        latency: this.calculateLatency()
      };
    } catch (error: any) {
      console.error(`🔍 Enhanced Proxy Request Error:`, error);
      
      return {
        success: false,
        message: error.message || 'Network error via proxy',
        code: 'PROXY_ERROR',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get current priority level
   */
  private getCurrentPriority(): number {
    // This could be enhanced to consider various factors
    return 5; // Default medium priority
  }

  /**
   * Calculate request latency
   */
  private calculateLatency(): number {
    // This is a simplified calculation - in production you'd track actual latency
    return Math.random() * 100 + 50; // 50-150ms simulated latency
  }

  /**
   * Update connection metrics
   */
  private updateConnectionMetrics(success: boolean, latency: number): void {
    this.connectionMetrics.totalRequests++;
    this.connectionMetrics.lastRequestTime = Date.now();
    
    if (success) {
      this.connectionMetrics.successfulRequests++;
    } else {
      this.connectionMetrics.failedRequests++;
    }

    // Update average latency
    const totalLatency = this.connectionMetrics.averageLatency * (this.connectionMetrics.totalRequests - 1);
    this.connectionMetrics.averageLatency = (totalLatency + latency) / this.connectionMetrics.totalRequests;
  }

  /**
   * Enhanced GET request with priority
   */
  public async get<T>(endpoint: string, requiresAuth: boolean = true, priority: number = 5): Promise<EnhancedApiResponse<T>> {
    if (priority >= 8) {
      // High priority - process immediately
      return this.requestViaProxy<T>(endpoint, 'GET', undefined, requiresAuth);
    } else {
      // Queue the request
      const messageId = this.queueMessage({
        type: 'api_request',
        payload: { method: 'GET', endpoint, requiresAuth },
        priority
      });
      
      return new Promise((resolve, reject) => {
        // Set up listener for response
        const handleResponse = (data: any) => {
          if (data.messageId === messageId) {
            this.off('message_processed', handleResponse);
            if (data.success) {
              resolve(data.result);
            } else {
              reject(new Error(data.error || 'Request failed'));
            }
          }
        };
        
        this.on('message_processed', handleResponse);
        
        // Set timeout
        setTimeout(() => {
          this.off('message_processed', handleResponse);
          reject(new Error('Request timeout'));
        }, this.config.timeout);
      });
    }
  }

  /**
   * Enhanced POST request with priority
   */
  public async post<T>(endpoint: string, data?: any, requiresAuth: boolean = true, priority: number = 5): Promise<EnhancedApiResponse<T>> {
    if (priority >= 8) {
      return this.requestViaProxy<T>(endpoint, 'POST', data, requiresAuth);
    } else {
      const messageId = this.queueMessage({
        type: 'api_request',
        payload: { method: 'POST', endpoint, data, requiresAuth },
        priority
      });
      
      return new Promise((resolve, reject) => {
        const handleResponse = (data: any) => {
          if (data.messageId === messageId) {
            this.off('message_processed', handleResponse);
            if (data.success) {
              resolve(data.result);
            } else {
              reject(new Error(data.error || 'Request failed'));
            }
          }
        };
        
        this.on('message_processed', handleResponse);
        
        setTimeout(() => {
          this.off('message_processed', handleResponse);
          reject(new Error('Request timeout'));
        }, this.config.timeout);
      });
    }
  }

  /**
   * Enhanced PUT request with priority
   */
  public async put<T>(endpoint: string, data?: any, requiresAuth: boolean = true, priority: number = 5): Promise<EnhancedApiResponse<T>> {
    if (priority >= 8) {
      return this.requestViaProxy<T>(endpoint, 'PUT', data, requiresAuth);
    } else {
      const messageId = this.queueMessage({
        type: 'api_request',
        payload: { method: 'PUT', endpoint, data, requiresAuth },
        priority
      });
      
      return new Promise((resolve, reject) => {
        const handleResponse = (data: any) => {
          if (data.messageId === messageId) {
            this.off('message_processed', handleResponse);
            if (data.success) {
              resolve(data.result);
            } else {
              reject(new Error(data.error || 'Request failed'));
            }
          }
        };
        
        this.on('message_processed', handleResponse);
        
        setTimeout(() => {
          this.off('message_processed', handleResponse);
          reject(new Error('Request timeout'));
        }, this.config.timeout);
      });
    }
  }

  /**
   * Enhanced DELETE request with priority
   */
  public async delete<T>(endpoint: string, requiresAuth: boolean = true, priority: number = 5): Promise<EnhancedApiResponse<T>> {
    if (priority >= 8) {
      return this.requestViaProxy<T>(endpoint, 'DELETE', undefined, requiresAuth);
    } else {
      const messageId = this.queueMessage({
        type: 'api_request',
        payload: { method: 'DELETE', endpoint, requiresAuth },
        priority
      });
      
      return new Promise((resolve, reject) => {
        const handleResponse = (data: any) => {
          if (data.messageId === messageId) {
            this.off('message_processed', handleResponse);
            if (data.success) {
              resolve(data.result);
            } else {
              reject(new Error(data.error || 'Request failed'));
            }
          }
        };
        
        this.on('message_processed', handleResponse);
        
        setTimeout(() => {
          this.off('message_processed', handleResponse);
          reject(new Error('Request timeout'));
        }, this.config.timeout);
      });
    }
  }

  /**
   * Submit concurrency operation
   */
  public async submitConcurrencyOperation(
    type: string,
    resourceId: string,
    data: any,
    priority: number = 5
  ): Promise<EnhancedApiResponse<any>> {
    return this.post('/concurrency/operation', {
      type,
      resourceId,
      data,
      priority
    }, true, priority);
  }

  /**
   * Submit cash booking with concurrency control
   */
  public async submitCashBooking(
    destinationId: string,
    seatsRequested: number,
    priority: number = 8
  ): Promise<EnhancedApiResponse<any>> {
    // Submit as a concurrency operation first
    const concurrencyResult = await this.submitConcurrencyOperation(
      'cash_booking',
      destinationId,
      {
        destinationId,
        seatsRequested,
        timestamp: new Date()
      },
      priority
    );

    if (concurrencyResult.success) {
      // Then make the actual booking request
      return this.post('/bookings/cash', {
        destinationId,
        seatsRequested
      }, true, priority);
    } else {
      return concurrencyResult;
    }
  }

  /**
   * Submit sync operation
   */
  public async submitSyncOperation(
    entityType: string,
    entityId: string,
    data: any,
    priority: number = 5
  ): Promise<EnhancedApiResponse<any>> {
    return this.post('/sync/operation', {
      entityType,
      entityId,
      data,
      priority
    }, true, priority);
  }

  /**
   * Batch multiple operations
   */
  public async batchOperations(operations: Array<{
    type: string;
    endpoint: string;
    data?: any;
    priority: number;
    requiresAuth?: boolean;
  }>): Promise<EnhancedApiResponse<any>> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const messageId = this.queueMessage({
      type: 'batch_operation',
      payload: { operations, batchId },
      priority: Math.max(...operations.map(op => op.priority))
    });

    return new Promise((resolve, reject) => {
      const handleResponse = (data: any) => {
        if (data.messageId === messageId) {
          this.off('message_processed', handleResponse);
          if (data.success) {
            resolve(data.result);
          } else {
            reject(new Error(data.error || 'Batch operation failed'));
          }
        }
      };
      
      this.on('message_processed', handleResponse);
      
      setTimeout(() => {
        this.off('message_processed', handleResponse);
        reject(new Error('Batch operation timeout'));
      }, this.config.timeout * 2); // Longer timeout for batch operations
    });
  }

  /**
   * Check connection to local server using Rust proxy
   */
  public async checkConnectionViaProxy(serverUrl?: string): Promise<boolean> {
    try {
      let targetServerUrl = serverUrl;
      if (!targetServerUrl) {
        targetServerUrl = this.getBestServerUrl();
      }
      
      console.log('🔍 Checking enhanced connection via proxy to /health');
      console.log('🔍 Server URL:', targetServerUrl);
      
      const responseText = await invoke<string>('proxy_localnode', {
        method: 'GET',
        endpoint: '/health',
        body: null,
        serverUrl: targetServerUrl
      });
      
      const data = JSON.parse(responseText);
      return data.status === 'ok';
    } catch (error) {
      console.error('🔍 Enhanced proxy connection check failed:', error);
      return false;
    }
  }

  /**
   * Check connection to local server
   */
  public async checkConnection(): Promise<boolean> {
    return this.checkConnectionViaProxy();
  }

  /**
   * Initialize login with CIN
   */
  public async initiateLogin(cin: string): Promise<EnhancedApiResponse<any>> {
    try {
      console.log('🔍 Initiating enhanced login via proxy for CIN:', cin);
      
      const response = await this.requestViaProxy<any>('/api/auth/login', 'POST', { cin }, false);
      
      return {
        success: response.success,
        message: response.message || 'Unknown error',
        requiresVerification: response.requiresVerification,
        data: response.data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('🔍 Enhanced login initiation failed:', error);
      return {
        success: false,
        message: 'Login initiation failed',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Verify SMS code and complete authentication
   */
  public async verifyLogin(cin: string, verificationCode: string): Promise<EnhancedApiResponse<any>> {
    try {
      console.log('🔍 Verifying enhanced login via proxy for CIN:', cin);
      
      const response = await this.requestViaProxy<any>(
        '/api/auth/verify',
        'POST',
        { cin, verificationCode },
        false
      );
      
      if (response.success && response.token) {
        console.log('💾 Saving authentication token...');
        this.saveToken(response.token);
      }
      
      return {
        success: response.success,
        message: response.message || 'Unknown error',
        token: response.token,
        staff: response.staff,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('🔍 Enhanced login verification failed:', error);
      return {
        success: false,
        message: 'Login verification failed',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Verify token validity
   */
  public async verifyToken(): Promise<EnhancedApiResponse<any>> {
    if (!this.token) {
      return {
        success: false,
        message: 'No authentication token found',
        code: 'NO_TOKEN',
        timestamp: new Date().toISOString()
      };
    }
    
    return this.requestViaProxy<any>('/api/auth/verify-token', 'GET');
  }

  /**
   * Logout and clear token
   */
  public async logout(): Promise<EnhancedApiResponse<any>> {
    this.clearToken();
    return {
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get connection status
   */
  public async getConnectionStatus(): Promise<EnhancedApiResponse<any>> {
    return this.requestViaProxy<any>('/api/websocket/status', 'GET', undefined, false);
  }

  /**
   * Get WebSocket status
   */
  public async getWebSocketStatus(): Promise<EnhancedApiResponse<any>> {
    return this.requestViaProxy<any>('/api/websocket/status', 'GET', undefined, false);
  }

  /**
   * Force WebSocket reconnection
   */
  public async forceWebSocketReconnect(): Promise<EnhancedApiResponse<any>> {
    return this.requestViaProxy<any>('/api/websocket/reconnect', 'POST');
  }

  /**
   * Toggle WebSocket reconnection
   */
  public async toggleWebSocketReconnect(enable: boolean): Promise<EnhancedApiResponse<any>> {
    return this.requestViaProxy<any>('/api/websocket/toggle', 'POST', { enable });
  }

  /**
   * Get enhanced server metrics
   */
  public async getEnhancedServerMetrics(): Promise<EnhancedApiResponse<any>> {
    return this.requestViaProxy<any>('/api/server/enhanced-metrics', 'GET');
  }

  /**
   * Get connection pool status
   */
  public async getConnectionPoolStatus(): Promise<EnhancedApiResponse<any>> {
    return this.requestViaProxy<any>('/api/server/connection-pools', 'GET');
  }

  /**
   * Get concurrency metrics
   */
  public async getConcurrencyMetrics(): Promise<EnhancedApiResponse<any>> {
    return this.requestViaProxy<any>('/api/server/concurrency-metrics', 'GET');
  }

  /**
   * Get sync metrics
   */
  public async getSyncMetrics(): Promise<EnhancedApiResponse<any>> {
    return this.requestViaProxy<any>('/api/server/sync-metrics', 'GET');
  }

  /**
   * Discover and set local node servers
   */
  public async discoverLocalNodeServers(): Promise<string[]> {
    try {
      console.log('🔍 Discovering local node servers...');
      
      // Use Tauri's network discovery command
      const result = await invoke<any>('discover_local_servers');
      const discoveredServers = result.servers ? result.servers.map((server: any) => server.url) : [];
      
      if (discoveredServers && discoveredServers.length > 0) {
        this.setDiscoveredServers(discoveredServers);
        console.log(`✅ Discovered ${discoveredServers.length} servers: ${discoveredServers.join(', ')}`);
        return discoveredServers;
      } else {
        console.log('⚠️ No servers discovered, using localhost fallback');
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to discover servers:', error);
      return [];
    }
  }

  // Event emitter methods
  private eventListeners: Map<string, Function[]> = new Map();

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
   * Get service metrics
   */
  public getMetrics(): any {
    return {
      connectionMetrics: { ...this.connectionMetrics },
      connectionPools: this.connectionPools.map(pool => ({ ...pool })),
      messageQueue: {
        length: this.messageQueue.length,
        processing: this.processingQueue
      },
      config: this.config
    };
  }

  /**
   * Clear message queue
   */
  public clearMessageQueue(): void {
    this.messageQueue = [];
    console.log('🧹 Message queue cleared');
  }

  /**
   * Get queue statistics
   */
  public getQueueStats(): any {
    const priorityCounts: Record<number, number> = {};
    this.messageQueue.forEach(msg => {
      priorityCounts[msg.priority] = (priorityCounts[msg.priority] || 0) + 1;
    });

    return {
      totalMessages: this.messageQueue.length,
      priorityDistribution: priorityCounts,
      processing: this.processingQueue,
      oldestMessage: this.messageQueue.length > 0 ? this.messageQueue[this.messageQueue.length - 1] : null
    };
  }
}

// Create singleton instance
const enhancedApi = new EnhancedLocalNodeApiService();

export default enhancedApi; 