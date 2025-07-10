import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getWebSocketClient } from '../lib/websocket';
import api from '../lib/api';
import { useAuth } from './AuthProvider';

interface DashboardStatistics {
  queues: number;
  vehicles: {
    total: number;
    active: number;
  };
  bookings: {
    today: number;
    revenue: number;
  };
}

interface QueueItem {
  id: string;
  destinationName: string;
  queuePosition: number;
  availableSeats: number;
  basePrice: number;
  estimatedDeparture: string | null;
  vehicle: {
    licensePlate: string;
    driver: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
    };
  };
}

interface Booking {
  id: string;
  seatsBooked: number;
  totalAmount: number;
  bookingSource: string;
  bookingType: string;
  customerPhone: string | null;
  paymentStatus: string;
  paymentMethod: string;
  isVerified: boolean;
  createdAt: string;
  queue: {
    destinationName: string;
    vehicle: {
      licensePlate: string;
    };
  };
}

interface DashboardData {
  statistics: DashboardStatistics;
  queues: Record<string, QueueItem[]>;
  recentBookings: Booking[];
  timestamp: string;
}

interface DashboardContextType {
  dashboardData: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  isWebSocketConnected: boolean;
  isRealTimeEnabled: boolean;
  toggleRealTime: () => void;
}

const defaultDashboardData: DashboardData = {
  statistics: {
    queues: 0,
    vehicles: {
      total: 0,
      active: 0,
    },
    bookings: {
      today: 0,
      revenue: 0,
    },
  },
  queues: {},
  recentBookings: [],
  timestamp: new Date().toISOString(),
};

const DashboardContext = createContext<DashboardContextType>({
  dashboardData: defaultDashboardData,
  isLoading: false,
  error: null,
  refreshData: async () => {},
  isWebSocketConnected: false,
  isRealTimeEnabled: true,
  toggleRealTime: () => {},
});

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};

interface DashboardProviderProps {
  children: ReactNode;
}

export const DashboardProvider: React.FC<DashboardProviderProps> = ({ children }) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState<boolean>(false);
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState<boolean>(true);
  const { isAuthenticated } = useAuth();
  
  // Memoize refreshData to prevent unnecessary re-renders
  const refreshData = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Try WebSocket first if real-time is enabled
      if (isRealTimeEnabled) {
        const wsClient = getWebSocketClient();
        
        if (wsClient.isConnected() && isAuthenticated) {
          try {
            const data = await wsClient.getDashboardData();
            setDashboardData(data);
            setIsLoading(false);
            return;
          } catch (wsError) {
            console.error('WebSocket data fetch failed, falling back to REST API', wsError);
            // Continue to REST API fallback
          }
        }
      }
      
      // Fallback to REST API
      const response = await api.getDashboardAll();
      
      if (response.success && response.data) {
        setDashboardData(response.data);
      } else {
        setError(response.message || 'Failed to fetch dashboard data');
        console.error('Failed to fetch dashboard data:', response.message);
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred while fetching dashboard data');
      console.error('Dashboard data fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isRealTimeEnabled]);
  
  // Initialize WebSocket connection
  useEffect(() => {
    if (!isAuthenticated || !isRealTimeEnabled) return;
    
    const wsClient = getWebSocketClient();
    
    const handleConnect = () => {
      console.log('WebSocket connected');
      setIsWebSocketConnected(true);
      
      // Immediately request dashboard data upon connection
      wsClient.getDashboardData()
        .then(data => {
          setDashboardData(data);
          setIsLoading(false);
        })
        .catch(err => console.error('Failed to get initial dashboard data:', err));
    };
    
    const handleDisconnect = () => {
      console.log('WebSocket disconnected');
      setIsWebSocketConnected(false);
      
      // Try to reconnect after a short delay if real-time is still enabled
      if (isRealTimeEnabled) {
        setTimeout(() => {
          if (isRealTimeEnabled) {
            console.log('Attempting to reconnect WebSocket...');
            wsClient.connect();
          }
        }, 3000);
      }
    };
    
    const handleAuthenticated = () => {
      console.log('WebSocket authenticated');
      // Subscribe to dashboard updates
      wsClient.subscribe(['dashboard', 'queues', 'bookings', 'vehicles'])
        .then(() => {
          console.log('Subscribed to dashboard updates');
          // Immediately request dashboard data upon authentication
          return wsClient.getDashboardData();
        })
        .then(data => {
          setDashboardData(data);
          setIsLoading(false);
        })
        .catch(err => console.error('Failed to subscribe or get data:', err));
    };
    
    const handleDashboardData = (data: any) => {
      console.log('Received dashboard data');
      setDashboardData(data);
      setIsLoading(false);
    };
    
    const handleQueueUpdate = (data: any) => {
      console.log('Received queue update');
      setDashboardData(prev => {
        if (!prev) return prev;
        
        // Deep clone the previous state
        const newState = JSON.parse(JSON.stringify(prev));
        
        // Update statistics
        if (data.statistics) {
          newState.statistics = {
            ...newState.statistics,
            ...data.statistics
          };
        }
        
        // Update queues if provided
        if (data.queue) {
          const queue = data.queue;
          const destination = queue.destinationName;
          
          if (!newState.queues[destination]) {
            newState.queues[destination] = [];
          }
          
          // Find and update or add the queue
          const index = newState.queues[destination].findIndex((q: QueueItem) => q.id === queue.id);
          
          if (index >= 0) {
            newState.queues[destination][index] = queue;
          } else {
            newState.queues[destination].push(queue);
          }
          
          // Sort by queue position
          newState.queues[destination].sort((a: QueueItem, b: QueueItem) => a.queuePosition - b.queuePosition);
        }
        
        // Update timestamp
        newState.timestamp = new Date().toISOString();
        
        return newState;
      });
    };
    
    const handleBookingUpdate = (data: any) => {
      console.log('Received booking update');
      setDashboardData(prev => {
        if (!prev) return prev;
        
        // Deep clone the previous state
        const newState = JSON.parse(JSON.stringify(prev));
        
        // Update statistics if provided
        if (data.statistics) {
          newState.statistics = {
            ...newState.statistics,
            ...data.statistics
          };
        }
        
        // Add new booking to recent bookings if provided
        if (data.booking) {
          // Add to the beginning of the array
          newState.recentBookings.unshift(data.booking);
          
          // Keep only the most recent 10 bookings
          if (newState.recentBookings.length > 10) {
            newState.recentBookings = newState.recentBookings.slice(0, 10);
          }
        }
        
        // Update timestamp
        newState.timestamp = new Date().toISOString();
        
        return newState;
      });
    };
    
    // Register event listeners
    wsClient.on('connected', handleConnect);
    wsClient.on('disconnected', handleDisconnect);
    wsClient.on('authenticated', handleAuthenticated);
    wsClient.on('dashboard_data', handleDashboardData);
    wsClient.on('initial_data', handleDashboardData);
    wsClient.on('queue_update', handleQueueUpdate);
    wsClient.on('booking_update', handleBookingUpdate);
    
    // Connect to WebSocket server
    wsClient.connect();
    
    // Cleanup function
    return () => {
      wsClient.removeListener('connected', handleConnect);
      wsClient.removeListener('disconnected', handleDisconnect);
      wsClient.removeListener('authenticated', handleAuthenticated);
      wsClient.removeListener('dashboard_data', handleDashboardData);
      wsClient.removeListener('initial_data', handleDashboardData);
      wsClient.removeListener('queue_update', handleQueueUpdate);
      wsClient.removeListener('booking_update', handleBookingUpdate);
    };
  }, [isAuthenticated, isRealTimeEnabled]);
  
  // Initial data load and periodic refresh if WebSocket is not available
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Initial data load
    refreshData();
    
    // Set up periodic refresh only if real-time updates are disabled or WebSocket is not connected
    let intervalId: number | null = null;
    
    if (!isRealTimeEnabled || !isWebSocketConnected) {
      intervalId = window.setInterval(() => {
        refreshData();
      }, 10000); // Refresh every 10 seconds if not using WebSocket
    }
    
    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [isAuthenticated, isRealTimeEnabled, isWebSocketConnected, refreshData]);
  
  const toggleRealTime = () => {
    setIsRealTimeEnabled(prev => {
      const newValue = !prev;
      
      const wsClient = getWebSocketClient();
      
      if (newValue) {
        // Enable real-time updates
        wsClient.connect();
      } else {
        // Disable real-time updates
        wsClient.disconnect();
        setIsWebSocketConnected(false);
      }
      
      return newValue;
    });
  };
  
  return (
    <DashboardContext.Provider
      value={{
        dashboardData,
        isLoading,
        error,
        refreshData,
        isWebSocketConnected,
        isRealTimeEnabled,
        toggleRealTime,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}; 