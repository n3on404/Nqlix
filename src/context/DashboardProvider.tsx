import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
// Socket.IO will be implemented for real-time updates
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
      cin: string;
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
  isSocketConnected: boolean;
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
  isSocketConnected: false,
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
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState<boolean>(false);
  const { isAuthenticated } = useAuth();
  
  // Memoize refreshData to prevent unnecessary re-renders
  const refreshData = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Fallback to individual endpoints since /api/dashboard/all is not available
      const [statsRes, queuesRes, vehiclesRes, bookingsRes] = await Promise.all([
        api.getDashboardStats(),
        api.getDashboardQueues(),
        api.getDashboardVehicles(),
        api.getDashboardBookings(),
      ]);

      const ok = (r: any) => r && r.success && r.data;
      if (ok(statsRes) || ok(queuesRes) || ok(vehiclesRes) || ok(bookingsRes)) {
        setDashboardData({
          statistics: ok(statsRes) ? statsRes.data : undefined,
          queues: ok(queuesRes) ? queuesRes.data : undefined,
          recentBookings: ok(bookingsRes) ? bookingsRes.data : undefined,
          timestamp: new Date().toISOString()
        });
      } else {
        setError('Failed to fetch dashboard data');
        console.error('Failed to fetch dashboard data:', { statsRes, queuesRes, vehiclesRes, bookingsRes });
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred while fetching dashboard data');
      console.error('Dashboard data fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isRealTimeEnabled]);
  
  // Real-time disabled
  useEffect(() => {}, [isAuthenticated, isRealTimeEnabled]);
  
  // Initial data load and periodic refresh if WebSocket is not available
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Initial data load
    refreshData();
    
    // Set up periodic refresh (real-time disabled)
    let intervalId: number | null = null;
    
    if (true) {
      intervalId = window.setInterval(() => {
        refreshData();
      }, 10000);
    }
    
    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [isAuthenticated, isRealTimeEnabled, isSocketConnected, refreshData]);
  
  const toggleRealTime = () => {
    setIsRealTimeEnabled(false);
  };
  
  return (
    <DashboardContext.Provider
      value={{
        dashboardData,
        isLoading,
        error,
        refreshData,
        isSocketConnected,
        isRealTimeEnabled,
        toggleRealTime,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}; 