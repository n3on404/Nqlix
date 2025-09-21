import { invoke } from '@tauri-apps/api/tauri';
import { getLocalStorage, setLocalStorage } from './storage';

// Default API configuration
const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:3001/api',
  timeout: 10000,
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
   * Get vehicles with optional filters
   */
  public async getVehicles(filters?: any): Promise<ApiResponse<any>> {
    const queryParams = filters ? `?${new URLSearchParams(filters).toString()}` : '';
    return this.requestViaProxy<any>(`/api/vehicles${queryParams}`, 'GET');
  }

  /**
   * Get vehicle by ID
   */
  public async getVehicleById(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${id}`, 'GET');
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue/stats', 'GET');
  }

  /**
   * Get available queues with optional filtering
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
   * Get available locations for queue filtering
   */
  public async getQueueLocations(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue/locations', 'GET');
  }

  /**
   * Get available destinations for booking (only destinations with available seats)
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
   * Get available locations (governments and delegations) for filtering
   */
  public async getAvailableLocations(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue-booking/locations', 'GET');
  }

  /**
   * Get queue by destination
   */
  public async getQueueByDestination(destinationId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/queue/${destinationId}`, 'GET');
  }

  /**
   * Update vehicle status
   */
  public async updateVehicleStatus(licensePlate: string, status: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/vehicles/${licensePlate}/status`, 'PUT', { status });
  }

  /**
   * Create cash booking
   */
  public async createCashBooking(bookingData: any): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/cash-booking/book', 'POST', bookingData);
  }

  /**
   * List cash bookings
   */
  public async listCashBookings(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/cash-booking/stats', 'GET');
  }

  /**
   * Generate cash booking receipt
   */
  public async generateCashBookingReceipt(bookingId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/cash-booking/${bookingId}/receipt`, 'GET');
  }

  /**
   * Create queue booking
   */
  public async createQueueBooking(bookingData: any): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue-booking/book', 'POST', bookingData);
  }

  /**
   * Cancel queue booking completely or remove specific number of seats
   */
  public async cancelQueueBooking(bookingId: string, seatsToCancel?: number): Promise<ApiResponse<any>> {
    const data = seatsToCancel ? { seatsToCancel } : undefined;
    return this.requestViaProxy<any>(`/api/queue-booking/cancel/${bookingId}`, 'DELETE', data);
  }

  /**
   * List queue bookings
   */
  public async listQueueBookings(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/queue-booking/stats', 'GET');
  }

  /**
   * Assign booking to vehicle
   */
  public async assignBookingToVehicle(bookingId: string, vehicleId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/bookings/${bookingId}/assign`, 'POST', { vehicleId });
  }

  /**
   * Verify booking
   */
  public async verifyBooking(bookingId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/bookings/${bookingId}/verify`, 'POST');
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
    return this.get<any>('/api/dashboard/all');
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
  public async getOvernightQueues(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/overnight-queue/all', 'GET');
  }

  public async getOvernightQueueByDestination(destinationId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/overnight-queue/${destinationId}`, 'GET');
  }

  public async addVehicleToOvernightQueue(licensePlate: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/overnight-queue/add', 'POST', { licensePlate });
  }

  public async removeVehicleFromOvernightQueue(licensePlate: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/overnight-queue/remove', 'POST', { licensePlate });
  }

  public async transferOvernightToRegular(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/overnight-queue/transfer', 'POST');
  }

  public async getOvernightQueueStats(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/overnight-queue/stats', 'GET');
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
  public async getStaffMembers(filters?: any): Promise<ApiResponse<any>> {
    const queryParams = new URLSearchParams();
    if (filters?.role) queryParams.append('role', filters.role);
    if (filters?.status) queryParams.append('status', filters.status);
    
    const endpoint = queryParams.toString() ? `/api/staff?${queryParams.toString()}` : '/api/staff';
    return this.get(endpoint);
  }

  public async getStaffMember(id: string): Promise<ApiResponse<any>> {
    return this.get(`/api/staff/${id}`);
  }

  public async createStaffMember(staffData: any): Promise<ApiResponse<any>> {
    return this.post('/api/staff', staffData);
  }

  public async updateStaffMember(id: string, staffData: any): Promise<ApiResponse<any>> {
    return this.put(`/api/staff/${id}`, staffData);
  }

  public async toggleStaffStatus(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy(`/api/staff/${id}/toggle-status`, 'PATCH');
  }

  public async deleteStaffMember(id: string): Promise<ApiResponse<any>> {
    return this.delete(`/api/staff/${id}`);
  }

  public async getStaffTransactions(id: string, date?: string): Promise<ApiResponse<any>> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.get(`/api/staff/${id}/transactions${query}`);
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

  /**
   * Get full booking details by verification code
   */
  public async getBookingByVerificationCode(verificationCode: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/queue-booking/verify/${verificationCode}`, 'GET');
  }

  // Routes Management API methods
  /**
   * Get all routes
   */
  public async getAllRoutes(): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>('/api/routes', 'GET');
  }

  /**
   * Get route by ID
   */
  public async getRouteById(id: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/routes/${id}`, 'GET');
  }

  /**
   * Update route price (SUPERVISOR only)
   */
  public async updateRoutePrice(id: string, basePrice: number): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/routes/${id}`, 'PUT', { basePrice });
  }

  /**
   * Get routes by station ID
   */
  public async getRoutesByStation(stationId: string): Promise<ApiResponse<any>> {
    return this.requestViaProxy<any>(`/api/routes/station/${stationId}`, 'GET');
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
    return this.post(`/api/vehicles/${id}/ban`);
  }

  // Vehicle trips report
  public async getVehicleTrips(id: string, date?: string): Promise<ApiResponse<any>> {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.get(`/api/vehicles/${id}/trips${q}`);
  }

  // Staff daily report (all staff)
  public async getAllStaffDailyReport(date?: string): Promise<ApiResponse<any>> {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.get(`/api/staff/report/daily${q}`);
  }
}

// Create singleton instance
const api = new ApiService();

export default api; 