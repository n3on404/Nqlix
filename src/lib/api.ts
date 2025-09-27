import { invoke } from '@tauri-apps/api/tauri';
import { getLocalStorage, setLocalStorage } from './storage';
import { SERVER_CONFIG } from '../config/server';

// Default API configuration - Using server IP
const DEFAULT_CONFIG = {
  baseUrl: SERVER_CONFIG.API.BASE_URL,
  timeout: SERVER_CONFIG.API.TIMEOUT,
};

// API Configuration interface
interface ApiConfig {
  baseUrl: string;
  timeout: number;
}

// API response interface
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  token?: string;
  staff?: any;
  requiresVerification?: boolean;
}

// Authentication interfaces
interface LoginRequest {
  cin: string;
}

interface VerifyRequest {
  cin: string;
  verificationCode: string;
}

interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  staff?: any;
  requiresVerification?: boolean;
  data?: any;
}

// Connection status interface
interface ConnectionStatus {
  status: string;
  isConnected: boolean;
  isAuthenticated: boolean;
  reconnectEnabled: boolean;
  timestamp: string;
}

class ApiService {
  private config: ApiConfig;
  private token: string | null = null;
  private requestCache: Map<string, { data: any; timestamp: number }> = new Map();
  private pendingRequests: Map<string, Promise<any>> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(config?: Partial<ApiConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadToken();
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
  public setConfig(config: Partial<ApiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current API configuration
   */
  public getConfig(): ApiConfig {
    return { ...this.config };
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(endpoint: string, method: string, data?: any): string {
    const dataStr = data ? JSON.stringify(data) : '';
    return `${method}:${endpoint}:${dataStr}`;
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_TTL;
  }

  /**
   * Get cached response if available
   */
  private getCachedResponse(cacheKey: string): any | null {
    const cached = this.requestCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      console.log(`📦 Using cached response for ${cacheKey}`);
      return cached.data;
    }
    return null;
  }

  /**
   * Cache response data
   */
  private setCachedResponse(cacheKey: string, data: any): void {
    this.requestCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear expired cache entries
   */
  private clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.requestCache.entries()) {
      if (now - value.timestamp >= this.CACHE_TTL) {
        this.requestCache.delete(key);
      }
    }
  }

  /**
   * Clear cache for specific endpoint patterns
   */
  public clearCache(pattern?: string): void {
    if (pattern) {
      for (const key of this.requestCache.keys()) {
        if (key.includes(pattern)) {
          this.requestCache.delete(key);
        }
      }
      console.log(`🗑️ Cleared cache for pattern: ${pattern}`);
    } else {
      this.requestCache.clear();
      console.log(`🗑️ Cleared all cache`);
    }
  }

  /**
   * Make API request using Rust proxy (bypasses browser restrictions)
   */
  private async requestViaProxy<T>(
    endpoint: string,
    method: string = 'GET',
    data?: any,
    requiresAuth: boolean = true,
    serverUrl?: string
  ): Promise<ApiResponse<T>> {
    try {
      // Generate cache key for GET requests
      const cacheKey = this.getCacheKey(endpoint, method, data);
      
      // Check cache for GET requests
      if (method === 'GET') {
        const cachedResponse = this.getCachedResponse(cacheKey);
        if (cachedResponse) {
          return cachedResponse;
        }
      }

      // Check for pending identical requests (deduplication)
      if (this.pendingRequests.has(cacheKey)) {
        console.log(`🔄 Deduplicating request: ${method} ${endpoint}`);
        return await this.pendingRequests.get(cacheKey)!;
      }

      // Create the request promise
      const requestPromise = this.executeRequest<T>(endpoint, method, data, requiresAuth, serverUrl);
      
      // Store pending request for deduplication
      this.pendingRequests.set(cacheKey, requestPromise);

      try {
        const response = await requestPromise;
        
        // Cache successful GET responses
        if (method === 'GET' && response.success) {
          this.setCachedResponse(cacheKey, response);
        }
        
        return response;
      } finally {
        // Remove from pending requests
        this.pendingRequests.delete(cacheKey);
      }
    } catch (error: any) {
      console.error(`🔍 Proxy Request Error:`, error);
      
      return {
        success: false,
        message: error.message || 'Network error via proxy',
        code: 'PROXY_ERROR',
      };
    }
  }

  /**
   * Execute the actual request
   */
  private async executeRequest<T>(
    endpoint: string,
    method: string,
    data?: any,
    requiresAuth: boolean = true,
    serverUrl?: string
  ): Promise<ApiResponse<T>> {
    // Determine the server URL to use
    let targetServerUrl = serverUrl;
    if (!targetServerUrl) {
      // Extract server URL from current API config
      const baseUrl = this.config.baseUrl;
      targetServerUrl = baseUrl.replace('/api', '');
    }
    
    console.log(`🔍 Proxy Request: ${method} ${endpoint}`);
    console.log(`🔍 Server URL:`, targetServerUrl);
    console.log(`🔍 Body:`, data);
    console.log(`🔍 Auth Token:`, this.token ? 'Present' : 'Missing');

    // Prepare headers and body for proxy
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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
      headers // <-- pass headers to Rust
    });

    console.log(`🔍 Proxy Response:`, responseText);

    // Parse response
    const responseData = JSON.parse(responseText);
    
    console.log(`🔍 Parsed Response:`, responseData);
    
    if (!responseData.success && responseData.message) {
      // Handle authentication errors
      if (responseData.code === 'UNAUTHORIZED') {
        this.clearToken();
      }
      
      return {
        success: false,
        message: responseData.message || 'Request failed',
        code: responseData.code || 'UNKNOWN_ERROR',
      };
    }
    
    return responseData;
  }

  /**
   * GET request helper
   */
  public async get<T>(endpoint: string, requiresAuth: boolean = true): Promise<ApiResponse<T>> {
    return this.requestViaProxy<T>(endpoint, 'GET', undefined, requiresAuth);
  }

  /**
   * POST request helper
   */
  public async post<T>(endpoint: string, data?: any, requiresAuth: boolean = true): Promise<ApiResponse<T>> {
    return this.requestViaProxy<T>(endpoint, 'POST', data, requiresAuth);
  }

  /**
   * PUT request helper
   */
  public async put<T>(endpoint: string, data?: any, requiresAuth: boolean = true): Promise<ApiResponse<T>> {
    return this.requestViaProxy<T>(endpoint, 'PUT', data, requiresAuth);
  }

  /**
   * DELETE request helper
   */
  public async delete<T>(endpoint: string, requiresAuth: boolean = true): Promise<ApiResponse<T>> {
    return this.requestViaProxy<T>(endpoint, 'DELETE', undefined, requiresAuth);
  }

  /**
   * Check connection to local server using Rust proxy
   */
  public async checkConnectionViaProxy(serverUrl?: string): Promise<boolean> {
    try {
      // Determine the server URL to use
      let targetServerUrl = serverUrl;
      if (!targetServerUrl) {
        // Extract server URL from current API config
        const baseUrl = this.config.baseUrl;
        targetServerUrl = baseUrl.replace('/api', '');
      }
      
      console.log('🔍 Checking connection via proxy to /health');
      console.log('🔍 Server URL:', targetServerUrl);
      
      const responseText = await invoke<string>('proxy_localnode', {
        method: 'GET',
        endpoint: '/health',
        body: null,
        serverUrl: targetServerUrl
      });
      
      console.log('🔍 Proxy health check response:', responseText);
      
      const data = JSON.parse(responseText);
      console.log('🔍 Parsed health data:', data);
      
      return data.status === 'ok';
    } catch (error) {
      console.error('🔍 Proxy connection check failed:', error);
      if (error instanceof Error) {
        console.error('🔍 Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
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
   * Login with CIN and password
   */
  public async login(cin: string, password: string): Promise<AuthResponse> {
    try {
      console.log('🔍 Logging in via proxy for CIN:', cin);
      
      const response = await this.requestViaProxy<any>(
        '/api/auth/login',
        'POST',
        { cin, password },
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
      };
    } catch (error) {
      console.error('🔍 Login failed:', error);
      return {
        success: false,
        message: 'Login failed',
      };
    }
  }

  /**
   * Create initial admin account for system setup
   */
  public async createAdmin(adminData: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    cin: string;
    password: string;
  }): Promise<AuthResponse> {
    try {
      console.log('🔍 Creating admin account via proxy');
      
      const response = await this.requestViaProxy<any>(
        '/api/auth/create-admin',
        'POST',
        adminData,
        false
      );
      
      return {
        success: response.success,
        message: response.message || 'Unknown error',
        data: response.data,
      };
    } catch (error) {
      console.error('🔍 Create admin failed:', error);
      return {
        success: false,
        message: 'Create admin failed',
      };
    }
  }

  /**
   * Verify token validity
   */
  public async verifyToken(): Promise<ApiResponse<any>> {
    if (!this.token) {
      return {
        success: false,
        message: 'No authentication token found',
        code: 'NO_TOKEN',
      };
    }
    
    return this.requestViaProxy<any>('/api/auth/verify-token', 'GET');
  }

  /**
   * Logout and clear token
   */
  public async logout(): Promise<ApiResponse<any>> {
    this.clearToken();
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * Get connection status
   */
  public async getConnectionStatus(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/websocket/status', 'GET', undefined, false);
  }

  /**
   * Get WebSocket status
   */
  public async getWebSocketStatus(): Promise<ApiResponse<ConnectionStatus>> {
    return this.requestViaProxy<ConnectionStatus>('/api/websocket/status', 'GET', undefined, false);
  }

  /**
   * Force WebSocket reconnection
   */
  public async forceWebSocketReconnect(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/websocket/reconnect', 'POST');
  }

  /**
   * Toggle WebSocket reconnection
   */
  public async toggleWebSocketReconnect(enable: boolean): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/websocket/toggle', 'POST', { enable });
  }

  /**
   * Get station configuration
   */
  public async getStationConfig(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/station/config', 'GET');
  }

  /**
   * Update station configuration
   */
  public async updateStationConfig(config: any): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/station/config', 'PUT', config);
  }

  /**
   * Get available destinations
   */
  public async getDestinations(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/station/destinations', 'GET');
  }

  /**
   * Get all vehicles with their queue status
   */
  public async getVehicles(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/vehicles', 'GET', undefined, false);
  }

  /**
   * Create new vehicle (SUPERVISOR, ADMIN)
   */
  public async createVehicle(vehicleData: {
    licensePlate: string;
    capacity: number;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/vehicles', 'POST', vehicleData);
  }

  /**
   * Get vehicle by ID
   */
  public async getVehicleById(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${id}`, 'GET', undefined, false);
  }

  /**
   * Update vehicle information (SUPERVISOR, ADMIN)
   */
  public async updateVehicle(id: string, vehicleData: {
    licensePlate?: string;
    capacity?: number;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${id}`, 'PUT', vehicleData);
  }

  /**
   * Delete vehicle (ADMIN only)
   */
  public async deleteVehicle(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${id}`, 'DELETE');
  }


  /**
   * Remove vehicle authorization for a station (SUPERVISOR, ADMIN)
   */
  public async removeVehicleStationAuthorization(vehicleId: string, stationData: {
    stationId: string;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${vehicleId}/authorize-station`, 'DELETE', stationData);
  }

  /**
   * Enter vehicle into queue for a destination
   */
  public async enterQueue(queueData: {
    licensePlate: string;
    destinationId: string;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue/enter', 'POST', queueData, false);
  }

  /**
   * Remove vehicle from queue
   */
  public async exitQueue(queueData: {
    licensePlate: string;
  }): Promise<ApiResponse<any>> {
    const response = await this.requestViaProxy<any>('/api/queue/exit', 'POST', queueData, false);
    
    // Clear frontend cache on successful exit to ensure immediate UI update
    if (response.success) {
      this.clearCache('queue');
      console.log('🗑️ Cleared frontend cache after vehicle exit');
    }
    
    return response;
  }

  /**
   * Get all available destination queues with summary (SUPERVISOR, ADMIN)
   */
  public async getAvailableQueues(filters?: {
    governorate?: string;
    delegation?: string;
  }): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    if (filters?.governorate) {
      params.append('governorate', filters.governorate);
    }
    if (filters?.delegation) {
      params.append('delegation', filters.delegation);
    }
    const queryString = params.toString();
    const url = queryString ? `/api/queue/available?${queryString}` : '/api/queue/available';
    return this.requestViaProxy<any>(url, 'GET');
  }

  /**
   * Get comprehensive queue statistics (SUPERVISOR, ADMIN)
   */
  public async getQueueStats(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue/stats', 'GET');
  }

  /**
   * Get detailed queue for specific destination (SUPERVISOR, ADMIN)
   */
  public async getQueueByDestination(destinationId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/queue/${destinationId}`, 'GET');
  }

  /**
   * Update vehicle queue status (SUPERVISOR, ADMIN)
   */
  public async updateQueueStatus(statusData: {
    licensePlate: string;
    status: string;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue/status', 'PUT', statusData);
  }

  /**
   * Get all available destinations with seat counts (SUPERVISOR, ADMIN)
   */
  public async getAvailableDestinationsForBooking(filters?: {
    governorate?: string;
    delegation?: string;
  }): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    if (filters?.governorate) {
      params.append('governorate', filters.governorate);
    }
    if (filters?.delegation) {
      params.append('delegation', filters.delegation);
    }
    
    const queryString = params.toString();
    const url = queryString ? `/api/queue-booking/destinations?${queryString}` : '/api/queue-booking/destinations';
    
    return this.requestViaProxy<any>(url, 'GET');
  }

  /**
   * Create new cash booking (SUPERVISOR, ADMIN)
   */
  public async createQueueBooking(bookingData: {
    destinationId: string;
    seatsRequested: number;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue-booking/book', 'POST', bookingData);
  }

  /**
   * Get booking details by verification code (SUPERVISOR, ADMIN)
   */
  public async getBookingByVerificationCode(verificationCode: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/queue-booking/verify/${verificationCode}`, 'GET');
  }

  /**
   * Verify and mark ticket as used (SUPERVISOR, ADMIN)
   */
  public async verifyBooking(verificationCode: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue-booking/verify', 'POST', { verificationCode });
  }

  /**
   * Cancel specific number of seats from booking (SUPERVISOR, ADMIN)
   */
  public async cancelQueueBookingSeats(bookingId: string, seatsToCancel: number): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/queue-booking/cancel/${bookingId}`, 'PUT', { seatsToCancel });
  }

  /**
   * Cancel entire booking (SUPERVISOR, ADMIN)
   */
  public async cancelQueueBooking(bookingId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/queue-booking/cancel/${bookingId}`, 'DELETE');
  }

  /**
   * Get booking statistics for today (SUPERVISOR, ADMIN)
   */
  public async getQueueBookingStats(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue-booking/stats', 'GET');
  }

  /**
   * Get dashboard statistics
   */
  public async getDashboardStats(): Promise<ApiResponse<any>> {
    return this.get<any>('/api/dashboard/stats');
  }

  /**
   * Get dashboard queues
   */
  public async getDashboardQueues(): Promise<ApiResponse<any>> {
    return this.get<any>('/api/dashboard/queues');
  }

  /**
   * Get dashboard vehicles
   */
  public async getDashboardVehicles(): Promise<ApiResponse<any>> {
    return this.get<any>('/api/dashboard/vehicles');
  }

  /**
   * Get dashboard bookings
   */
  public async getDashboardBookings(): Promise<ApiResponse<any>> {
    return this.get<any>('/api/dashboard/bookings');
  }

  /**
   * Get all dashboard data
   */
  public async getDashboardAll(): Promise<ApiResponse<any>> {
    // Endpoint not available on server; keeping method for backward-compat.
    // Prefer calling getDashboardStats/Queues/Vehicles/Bookings individually.
    return this.requestViaProxy<any>('/api/dashboard/all', 'GET');
  }

  /**
   * Get financial statistics for supervisor dashboard
   */
  public async getFinancialStats(): Promise<ApiResponse<any>> {
    return this.get<any>('/api/dashboard/financial');
  }

  /**
   * Get transaction history for supervisor dashboard
   */
  public async getTransactionHistory(limit?: number): Promise<ApiResponse<any>> {
    const params = limit ? `?limit=${limit}` : '';
    return this.get<any>(`/api/dashboard/transactions${params}`);
  }

  /**
   * Get comprehensive supervisor dashboard data
   */
  public async getSupervisorDashboard(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/dashboard/supervisor', 'GET');
  }

  /**
   * Get activity log for dashboard
   */
  public async getActivityLog(limit?: number): Promise<ApiResponse<any>> {
    const params = limit ? `?limit=${limit}` : '';
    return this.get<any>(`/api/dashboard/activity${params}`);
  }

  // Overnight Queue Management
  /**
   * Add vehicle to overnight queue (SUPERVISOR, ADMIN)
   */
  public async addVehicleToOvernightQueue(overnightData: {
    licensePlate: string;
    destinationId?: string;
    departureTime?: string;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/overnight-queue/add', 'POST', overnightData);
  }

  /**
   * Remove vehicle from overnight queue (SUPERVISOR, ADMIN)
   */
  public async removeVehicleFromOvernightQueue(queueData: {
    licensePlate: string;
  }): Promise<ApiResponse<any>> {
    const response = await this.requestViaProxy<any>('/api/overnight-queue/remove', 'POST', queueData);
    
    // Clear frontend cache on successful removal to ensure immediate UI update
    if (response.success) {
      this.clearCache('queue');
      console.log('🗑️ Cleared frontend cache after overnight vehicle removal');
    }
    
    return response;
  }

  /**
   * Get all overnight queue entries (SUPERVISOR, ADMIN)
   */
  public async getOvernightQueues(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/overnight-queue/all', 'GET');
  }

  /**
   * Transfer vehicle from overnight queue to regular queue (SUPERVISOR, ADMIN)
   */
  public async transferOvernightToRegular(transferData: {
    licensePlate: string;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/overnight-queue/transfer', 'POST', transferData);
  }

  // Vehicle Management by CIN
  public async getVehicleByDriverCIN(cin: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/driver/${cin}`, 'GET');
  }

  public async addVehicleToOvernightQueueByCIN(cin: string): Promise<ApiResponse<any>> {
    // First get the vehicle by CIN, then add to overnight queue
    const vehicleResponse = await this.getVehicleByDriverCIN(cin);
    if (!vehicleResponse.success || !vehicleResponse.data) {
      return {
        success: false,
        message: `No vehicle found for driver with CIN: ${cin}`,
        code: 'VEHICLE_NOT_FOUND'
      };
    }
    
    const licensePlate = vehicleResponse.data.licensePlate;
    return this.addVehicleToOvernightQueue(licensePlate);
  }

  // Staff Management API methods
  /**
   * Get all staff members with optional filtering
   */
  public async getStaffMembers(filters?: {
    role?: string;
    status?: string;
  }): Promise<ApiResponse<any>> {
    const queryParams = new URLSearchParams();
    if (filters?.role) queryParams.append('role', filters.role);
    if (filters?.status) queryParams.append('status', filters.status);
    
    const endpoint = queryParams.toString() ? `/api/staff?${queryParams.toString()}` : '/api/staff';
    return this.requestViaProxy<any>(endpoint, 'GET');
  }

  /**
   * Get specific staff member by ID
   */
  public async getStaffMember(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/staff/${id}`, 'GET');
  }

  /**
   * Create new staff member
   */
  public async createStaffMember(staffData: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    cin: string;
    password: string;
    role: 'ADMIN' | 'SUPERVISOR' | 'WORKER';
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/staff', 'POST', staffData);
  }

  /**
   * Update staff member information
   */
  public async updateStaffMember(id: string, staffData: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    isActive?: boolean;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/staff/${id}`, 'PUT', staffData);
  }

  /**
   * Deactivate staff member (soft delete)
   */
  public async deleteStaffMember(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/staff/${id}`, 'DELETE');
  }

  // Tunisia location data API methods
  public async getGovernorates(): Promise<ApiResponse<string[]>> {
    return this.requestViaProxy<string[]>('/api/station/governorates', 'GET', undefined, false);
  }

  public async getDelegationsByGovernorate(governorate: string): Promise<ApiResponse<string[]>> {
    return this.requestViaProxy<string[]>(`/api/station/delegations/${encodeURIComponent(governorate)}`, 'GET', undefined, false);
  }

  public async getAllLocations(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/station/locations', 'GET', undefined, false);
  }

  public async getAvailableSeatsForDestination(destinationId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/queue-booking/destinations/${destinationId}/seats`, 'GET');
  }

  public async bookCashTickets(destinationId: string, seatsRequested: number): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/cash-booking/book', 'POST', { destinationId, seatsRequested });
  }

  public async verifyOnlineTicket(code: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue-booking/verify', 'POST', { verificationCode: code });
  }

  // Routes Management API methods
  /**
   * Get all routes
   */
  public async getAllRoutes(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/routes', 'GET', undefined, false);
  }

  /**
   * Create new route (ADMIN only)
   */
  public async createRoute(routeData: {
    stationId: string;
    stationName: string;
    basePrice: number;
    governorate: string;
    delegation: string;
  }): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/routes', 'POST', routeData);
  }

  /**
   * Get route by ID
   */
  public async getRouteById(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/routes/${id}`, 'GET', undefined, false);
  }

  /**
   * Update route price (SUPERVISOR, ADMIN)
   */
  public async updateRoutePrice(id: string, basePrice: number): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/routes/${id}`, 'PUT', { basePrice });
  }

  /**
   * Delete route (ADMIN only)
   */
  public async deleteRoute(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/routes/${id}`, 'DELETE');
  }

  /**
   * Get routes by station ID
   */
  public async getRoutesByStation(stationId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/routes/station/${stationId}`, 'GET', undefined, false);
  }

  // Driver Tickets API methods
  public async getVehiclesInQueue(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/driver-tickets/queue/vehicles', 'GET');
  }

  public async getVehiclesForExit(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/driver-tickets/exit/vehicles', 'GET');
  }

  public async searchVehicleByCIN(cin: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/driver-tickets/search/cin/${cin}`, 'GET');
  }

  /**
   * Ban a vehicle by ID
   */
  public async banVehicle(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${id}`, 'PUT', { isBanned: true });
  }

  /**
   * Unban a vehicle by ID
   */
  public async unbanVehicle(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${id}`, 'PUT', { isBanned: false });
  }

  /**
   * Authorize vehicle for a station
   */
  public async authorizeVehicleStation(vehicleId: string, stationId: string, stationName: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${vehicleId}/authorize-station`, 'POST', {
      stationId,
      stationName
    });
  }

  // Vehicle trips report
  public async getVehicleTrips(id: string, date?: string): Promise<ApiResponse<any>> {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.requestViaProxy<any>(`/api/vehicles/${id}/trips${q}`, 'GET');
  }

  // Staff daily report (all staff)
  public async getAllStaffDailyReport(date?: string): Promise<ApiResponse<any>> {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.get(`/api/staff/report/daily${q}`);
  }

  // Public Endpoints
  /**
   * Get public queue information for a destination
   */
  public async getPublicQueue(destinationId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/public/queue/${destinationId}`, 'GET', undefined, false);
  }

  /**
   * Get all available destinations (public)
   */
  public async getPublicDestinations(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/public/destinations', 'GET', undefined, false);
  }

  /**
   * Get staff transactions (SUPERVISOR, ADMIN)
   */
  public async getStaffTransactions(staffId: string, date: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/staff/${staffId}/transactions?date=${date}`, 'GET');
  }

  /**
   * Get driver income (SUPERVISOR, ADMIN)
   * Note: This endpoint doesn't exist in the backend yet
   */
  public async getDriverIncome(licensePlate: string, date: string): Promise<ApiResponse<any>> {
    // TODO: Implement this endpoint in the backend
    return Promise.resolve({
      success: false,
      message: 'Driver income endpoint not implemented yet',
      data: null
    });
  }

  /**
   * Toggle staff status (ADMIN)
   */
  public async toggleStaffStatus(staffId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/staff/${staffId}/toggle-status`, 'PATCH');
  }
}

// Create singleton instance
const api = new ApiService();

export default api; 