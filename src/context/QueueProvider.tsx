import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import api from '../lib/api';
import { dbClient } from '../services/dbClient';
import { useAuth } from './AuthProvider';
import { useNotifications } from './NotificationProvider';
import { useMQTT } from '../lib/useMQTT';

interface QueueItem {
  id: string;
  destinationName: string;
  queuePosition: number;
  availableSeats: number;
  basePrice: number;
  estimatedDeparture: string | null;
  // Extended fields used by UI
  licensePlate?: string;
  totalSeats?: number;
  status?: string;
  vehicle: {
    licensePlate: string;
    driver: {
      cin: string;
    };
  };
}

interface QueueSummary {
  destinationId: string;
  destinationName: string;
  totalVehicles: number;
  waitingVehicles: number;
  loadingVehicles: number;
  readyVehicles: number;
  estimatedNextDeparture?: string;
  governorate?: string | undefined;
  governorateAr?: string | undefined;
  delegation?: string | undefined;
  delegationAr?: string | undefined;
}

interface QueueContextType {
  queues: Record<string, QueueItem[]>;
  queueSummaries: QueueSummary[];
  isLoading: boolean;
  error: string | null;
  refreshQueues: () => Promise<void>;
  fetchQueueForDestination: (destinationId: string) => Promise<void>;
  isConnected: boolean;
  isRealTimeEnabled: boolean;
  toggleRealTime: () => void;
  enterQueue: (licensePlate: string) => Promise<any>;
  exitQueue: (licensePlate: string) => Promise<any>;
  updateVehicleStatus: (licensePlate: string, status: string) => Promise<any>;
  beginOptimisticSuppression: (opts: { licensePlate: string; durationMs?: number }) => void;
}

const QueueContext = createContext<QueueContextType>({
  queues: {},
  queueSummaries: [],
  isLoading: false,
  error: null,
  refreshQueues: async () => {},
  fetchQueueForDestination: async () => {},
  isConnected: false,
  isRealTimeEnabled: true,
  toggleRealTime: () => {},
  enterQueue: async () => ({}),
  exitQueue: async () => ({}),
  updateVehicleStatus: async () => ({}),
  beginOptimisticSuppression: () => {},
});

export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
};

interface QueueProviderProps {
  children: ReactNode;
}

export const QueueProvider: React.FC<QueueProviderProps> = ({ children }) => {
  const [queues, setQueues] = useState<Record<string, QueueItem[]>>({});
  const [queueSummaries, setQueueSummaries] = useState<QueueSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastManualRefresh, setLastManualRefresh] = useState<number>(0);
  const { isAuthenticated, selectedRoute } = useAuth();
  const { addNotification } = useNotifications();
  const [suppressedPlates, setSuppressedPlates] = useState<Record<string, number>>({});
  
  // Test function to check data availability
  const testDataAvailability = useCallback(async () => {
    console.log('🧪 [TEST] Testing data availability...');
    
    try {
      // Test API endpoints
      const [statsRes, queuesRes, vehiclesRes] = await Promise.all([
        api.getDashboardStats(),
        api.getDashboardQueues(),
        api.getDashboardVehicles()
      ]);
      
      console.log('🧪 [TEST] API Stats:', statsRes);
      console.log('🧪 [TEST] API Queues:', queuesRes);
      console.log('🧪 [TEST] API Vehicles:', vehiclesRes);
      
      return {
        stats: statsRes.success ? statsRes.data : null,
        queues: queuesRes.success ? queuesRes.data : null,
        vehicles: vehiclesRes.success ? vehiclesRes.data : null
      };
    } catch (error) {
      console.error('🧪 [TEST] API test failed:', error);
      return null;
    }
  }, []);

  // Memoize refreshQueues to prevent unnecessary re-renders
  const refreshQueues = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 Manual queue refresh requested (DB)...');
      const refreshTime = Date.now();
      setLastManualRefresh(refreshTime);

      // Test data availability first
      await testDataAvailability();

      // Check database health first with timeout
      console.log('🔍 [QUEUE DEBUG] Checking database health...');
      let dbHealthy = false;
      
      try {
        const dbHealthPromise = dbClient.health();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database health check timeout')), 5000)
        );
        
        dbHealthy = await Promise.race([dbHealthPromise, timeoutPromise]) as boolean;
        console.log('🔍 [QUEUE DEBUG] Database health:', dbHealthy);
      } catch (error) {
        console.warn('⚠️ [QUEUE DEBUG] Database health check failed or timed out:', error);
        console.log('🔄 [QUEUE DEBUG] Proceeding without health check...');
        dbHealthy = true; // Assume healthy and try to fetch data
      }
      
      if (!dbHealthy) {
        throw new Error('Database connection is not healthy');
      }

      // Load summaries directly from DB via Tauri with timeout
      console.log('🔍 [QUEUE DEBUG] Calling dbClient.getQueueSummaries()...');
      let summaries: any[] = [];
      
      try {
        const summariesPromise = dbClient.getQueueSummaries(selectedRoute || undefined);
        const summariesTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Queue summaries fetch timeout')), 10000)
        );
        
        summaries = await Promise.race([summariesPromise, summariesTimeoutPromise]) as any[];
        console.log('🔍 [QUEUE DEBUG] Raw summaries from DB:', summaries);
        console.log('🔍 [QUEUE DEBUG] Summaries length:', summaries?.length || 0);
      } catch (error) {
        console.warn('⚠️ [QUEUE DEBUG] Database fetch failed, trying API fallback:', error);
        
        // Fallback to API
        try {
          const apiResponse = await api.getDashboardQueues();
          if (apiResponse.success && apiResponse.data) {
            summaries = apiResponse.data;
            console.log('🔄 [QUEUE DEBUG] Using API fallback, summaries:', summaries);
          } else {
            console.warn('⚠️ [QUEUE DEBUG] API fallback also failed');
            summaries = [];
          }
        } catch (apiError) {
          console.error('❌ [QUEUE DEBUG] Both DB and API failed:', apiError);
          summaries = [];
        }
      }
      const normalizedSummaries = summaries.map((s: any) => ({
        ...s,
        destinationName: (s.destinationName || '').toUpperCase(),
      }));
      console.log('🔍 [QUEUE DEBUG] Normalized summaries:', normalizedSummaries);
      setQueueSummaries(normalizedSummaries);

      // Fetch details for all destinations with vehicles in parallel (only 4 destinations total)
      const queueDetails: Record<string, QueueItem[]> = {};
      const destinationsWithVehicles = normalizedSummaries
        .filter(s => (s.totalVehicles || 0) > 0);
      
      console.log('🔍 [QUEUE DEBUG] Destinations with vehicles:', destinationsWithVehicles);
      
      const queuePromises = destinationsWithVehicles.map(async (summary) => {
        try {
          const items = await dbClient.getQueueByDestination(summary.destinationId);
          return {
            destinationName: summary.destinationName,
            items: (items || [])
              .map((it) => ({
                id: it.id,
                destinationName: (it.destinationName || summary.destinationName).toUpperCase(),
                queuePosition: it.queuePosition,
                availableSeats: it.availableSeats,
                basePrice: it.basePrice,
                estimatedDeparture: null,
                licensePlate: it.licensePlate,
                totalSeats: it.totalSeats,
                status: it.status,
                vehicle: {
                  licensePlate: it.licensePlate,
                  driver: { cin: '' },
                },
              }))
              .sort((a, b) => a.queuePosition - b.queuePosition)
          };
        } catch (e) {
          console.error(`❌ Error fetching queue for ${summary.destinationName}:`, e);
          return {
            destinationName: summary.destinationName,
            items: []
          };
        }
      });
      
      // Wait for all queue details to load in parallel
      const queueResults = await Promise.all(queuePromises);
      queueResults.forEach(({ destinationName, items }) => {
        queueDetails[destinationName] = items;
      });
      
      // Initialize empty arrays for destinations without vehicles
      normalizedSummaries.forEach(summary => {
        if (!queueDetails[summary.destinationName]) {
          queueDetails[summary.destinationName] = [];
        }
      });
      
      console.log('🔍 [QUEUE DEBUG] Final queue details:', queueDetails);
      console.log('🔍 [QUEUE DEBUG] Number of destinations with data:', Object.keys(queueDetails).length);
      setQueues(queueDetails);
    } catch (error: any) {
      const errorMsg = error.message || 'An error occurred while fetching queue data';
      setError(errorMsg);
      console.error('❌ Queue data fetch error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });

      if (addNotification) {
        addNotification({
          type: 'error',
          title: 'Erreur de connexion',
          message: errorMsg,
          duration: 5000
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, selectedRoute, addNotification]);
  
  // MQTT integration for real-time updates
  const { isConnected: mqttConnected, subscribe, unsubscribe } = useMQTT();

  // Normalize destination names consistently
  const normalizeDestinationName = (name: string) => (name || '').replace(/^STATION /i, '').toUpperCase().trim();

  // Removed local optimistic updates

  // Start temporary suppression for a vehicle to ignore incoming updates that may cause flicker
  const beginOptimisticSuppression = useCallback((opts: { licensePlate: string; durationMs?: number }) => {
    const plate = (opts.licensePlate || '').toUpperCase().trim();
    const duration = Math.max(500, opts.durationMs ?? 2500);
    const expiry = Date.now() + duration;
    setSuppressedPlates(prev => ({ ...prev, [plate]: expiry }));
  }, []);

  // Periodically prune expired suppressions
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setSuppressedPlates(prev => {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v > now) next[k] = v;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);
  
  // Initial data load when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('👤 User authenticated, loading initial queue data');
      refreshQueues();
    }
  }, [isAuthenticated, selectedRoute, refreshQueues]);

  // MQTT event handlers for real-time updates
  useEffect(() => {
    if (!mqttConnected) return;
    setIsConnected(true);

    const handleQueueUpdate = (data: any) => {
      try {
        if (!data || !data.vehicle || !data.vehicle.destinationName) {
          refreshQueues();
          return;
        }

        // Always refresh to get server-truth
        refreshQueues();
      } catch (e) {
        console.warn('⚠️ Incremental queue update failed, falling back to refresh:', e);
        refreshQueues();
      }
    };
    
    const handleVehicleAddedToQueue = (data: any, topic: string) => {
      console.log('🚗 QueueProvider: Vehicle added to queue:', data);
      refreshQueues(); // Refresh all queue data
    };
    
    const handleVehicleRemovedFromQueue = (data: any, topic: string) => {
      console.log('🚗 QueueProvider: Vehicle removed from queue:', data);
      refreshQueues(); // Refresh all queue data
    };
    
    const handleVehicleTransferred = (data: any, topic: string) => {
      console.log('🔄 QueueProvider: Vehicle transferred:', data);
      refreshQueues(); // Refresh all queue data
    };
    
    // Subscribe to MQTT topics
    // Seat availability updates: adjust summaries only
    const handleSeatAvailability = (data: any) => {
      if (!data || !data.destinationId) return;
      setQueueSummaries(prev => prev.map(s =>
        s.destinationId === data.destinationId
          ? { ...s, // keep counts; this topic doesn't include vehicles count
              destinationName: normalizeDestinationName(data.destinationName || s.destinationName)
            }
          : s
      ));
    };

    // Destinations list update: replace summaries where possible
    const handleDestinationsUpdate = (data: any) => {
      if (!data || !Array.isArray(data.destinations)) return;
      const mapped = data.destinations.map((d: any) => ({
        destinationId: d.destinationId,
        destinationName: normalizeDestinationName(d.destinationName),
        totalVehicles: d.vehicleCount || 0,
        waitingVehicles: 0,
        loadingVehicles: 0,
        readyVehicles: 0,
      }));
      setQueueSummaries(mapped);
    };

    subscribe('transport/station/+/queue', handleQueueUpdate);
    subscribe('transport/route/+/seats', handleSeatAvailability);
    subscribe('transport/destinations/update', handleDestinationsUpdate);
    
    return () => {
      // Clean up MQTT subscriptions
      unsubscribe('transport/station/+/queue', handleQueueUpdate);
      unsubscribe('transport/route/+/seats', handleSeatAvailability);
      unsubscribe('transport/destinations/update', handleDestinationsUpdate);
    };
  }, [mqttConnected, subscribe, unsubscribe, refreshQueues, suppressedPlates]);

  // Mirror MQTT connectivity to context flag
  useEffect(() => {
    setIsConnected(!!mqttConnected);
  }, [mqttConnected]);

  // Fallback refresh when MQTT is not connected
  useEffect(() => {
    if (!isAuthenticated || mqttConnected) return;
    
    console.log('⏰ MQTT not connected, setting up fallback refresh');
    const intervalId = setInterval(() => {
      refreshQueues();
    }, 30000); // Refresh every 30 seconds when MQTT is not available
    
    return () => clearInterval(intervalId);
  }, [isAuthenticated, mqttConnected, refreshQueues]);
  
  const enterQueue = async (licensePlate: string) => {
    try {
      // Without a destination, just refresh; UI flow uses destination-specific entry
      await refreshQueues();
      return { success: true } as any;
    } catch (error) {
      console.error('Error entering queue:', error);
      return { success: false, message: 'Failed to enter queue' } as any;
    }
  };
  
  const exitQueue = async (licensePlate: string) => {
    try {
      await dbClient.exitQueue(licensePlate);
      if (!isConnected) {
        refreshQueues();
      }
      return { success: true } as any;
    } catch (error) {
      console.error('Error exiting queue:', error);
      return { success: false, message: 'Failed to exit queue' } as any;
    }
  };
  
  const updateVehicleStatus = async (licensePlate: string, status: string) => {
    try {
      await dbClient.updateVehicleStatus(licensePlate, status);
      if (!isConnected) {
        refreshQueues();
      }
      return { success: true } as any;
    } catch (error) {
      console.error('Error updating vehicle status:', error);
      return { success: false, message: 'Failed to update vehicle status' } as any;
    }
  };
  
  // Function to fetch queue data for a specific destination
  const fetchQueueForDestination = async (destinationId: string) => {
    if (!isAuthenticated) {
      console.log('🔒 Not authenticated, skipping fetchQueueForDestination');
      return;
    }

    console.log(`🔍 Fetching detailed queue data for destination ID: ${destinationId}`);

    try {
      const items = await dbClient.getQueueByDestination(destinationId);
      // Find the destination name from the summaries
      const summary = queueSummaries.find(s => s.destinationId === destinationId);

      if (summary) {
        const mapped: QueueItem[] = (items || []).map((it) => ({
          id: it.id,
          destinationName: (it.destinationName || summary.destinationName).toUpperCase(),
          queuePosition: it.queuePosition,
          availableSeats: it.availableSeats,
          basePrice: it.basePrice,
          estimatedDeparture: null,
          licensePlate: it.licensePlate,
          totalSeats: it.totalSeats,
          status: it.status,
          vehicle: {
            licensePlate: it.licensePlate,
            driver: { cin: '' },
          },
        }));
        setQueues(prev => ({
          ...prev,
          [summary.destinationName]: mapped,
        }));
        console.log(`✅ Fetched queue data for ${summary.destinationName}: ${items.length} vehicles`);
      } else {
        console.error(`❌ Could not find summary for destination ID ${destinationId}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching queue for destination ${destinationId}:`, error);
    }
  };
  
  return (
    <QueueContext.Provider
      value={{
        queues,
        queueSummaries,
        isLoading,
        error,
        refreshQueues,
        fetchQueueForDestination,
        isConnected,
        isRealTimeEnabled: true,
        toggleRealTime: () => {},
        enterQueue,
        exitQueue,
        updateVehicleStatus,
        beginOptimisticSuppression,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
}; 