import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useEnhancedMqtt } from './EnhancedMqttProvider';
import api from '../lib/api';
import { useAuth } from './AuthProvider';
import { useNotifications } from './NotificationProvider';

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
  const { mqttClient, isConnected: mqttConnected, isAuthenticated: mqttAuthenticated } = useEnhancedMqtt();
  const [lastManualRefresh, setLastManualRefresh] = useState<number>(0);
  const { isAuthenticated } = useAuth();
  const { addNotification } = useNotifications();
  
  // Memoize refreshQueues to prevent unnecessary re-renders
  const refreshQueues = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    setError(null);

        try {
      console.log('🔄 Manual queue refresh requested...');
      const refreshTime = Date.now();
      setLastManualRefresh(refreshTime);

      // Always use REST API for manual refresh to ensure fresh data
      const availableQueuesResponse = await api.getAvailableQueues();

      if (availableQueuesResponse.success && availableQueuesResponse.data) {
        // Normalize queueSummaries
        const normalizedSummaries = availableQueuesResponse.data.map((summary: any) => ({
          ...summary,
          destinationName: summary.destinationName?.toUpperCase() || summary.destinationName
        }));
        setQueueSummaries(normalizedSummaries);
        console.log('✅ Queue summaries updated:', normalizedSummaries.length, 'destinations');

        // Fetch detailed queue data for each destination
        const queueDetails: Record<string, any[]> = {};
        for (const summary of normalizedSummaries) {
          if (summary.totalVehicles > 0) {
            try {
              const detailResponse = await api.getQueueByDestination(summary.destinationId);
              if (detailResponse.success && detailResponse.data) {
                queueDetails[summary.destinationName] = detailResponse.data.map((item: any) => ({
                  ...item,
                  destinationName: item.destinationName?.toUpperCase() || summary.destinationName
                })).sort((a: any, b: any) => a.queuePosition - b.queuePosition); // Ensure proper sorting
              } else {
                queueDetails[summary.destinationName] = [];
                console.log(`⚠️ No queue details for ${summary.destinationName}`);
              }
            } catch (error) {
              console.error(`❌ Error fetching queue for ${summary.destinationName}:`, error);
              queueDetails[summary.destinationName] = [];
            }
          } else {
            queueDetails[summary.destinationName] = [];
          }
        }
        console.log('✅ Queue details updated:', Object.keys(queueDetails).length, 'destinations');
        setQueues(queueDetails);

        // Show success feedback
        if (addNotification) {
          addNotification({
            type: 'success',
            title: 'Données actualisées',
            message: `${normalizedSummaries.length} destinations mises à jour`,
            duration: 3000
          });
        }
      } else {
        const errorMsg = availableQueuesResponse.message || 'Failed to fetch queue data';
        setError(errorMsg);
        console.error('❌ Failed to fetch queue data:', errorMsg);

        if (addNotification) {
          addNotification({
            type: 'error',
            title: 'Erreur de mise à jour',
            message: errorMsg,
            duration: 5000
          });
        }
      }
    } catch (error: any) {
      const errorMsg = error.message || 'An error occurred while fetching queue data';
      setError(errorMsg);
      console.error('❌ Queue data fetch error:', error);

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
  }, [isAuthenticated, addNotification]);
  
  // Initialize MQTT connection and set up event handlers
  useEffect(() => {
    if (!isAuthenticated || !mqttConnected) {
      console.log('👤 Not authenticated or MQTT not connected, skipping queue updates setup');
      return;
    }
    
    console.log('🔌 Setting up MQTT connection for queue updates...');
    
    // Set connection state based on MQTT status
    setIsConnected(mqttConnected && mqttAuthenticated);
    
    // Subscribe to queue updates via MQTT
    if (mqttClient) {
      mqttClient.subscribeToUpdates(['queue_update', 'vehicle_queue_updated', 'seat_availability_changed'])
        .then(() => {
          console.log('✅ Subscribed to MQTT queue updates');
          setIsConnected(true);
        })
        .catch((err: any) => console.error('❌ Failed to subscribe to queue updates:', err));
      
      // Listen for queue data updates
      const handleQueueUpdate = (data: any) => {
        console.log('� Received MQTT queue data:', data);
        
        // Check if we recently had a manual refresh - if so, be more conservative with MQTT updates
        const now = Date.now();
        const timeSinceRefresh = now - lastManualRefresh;
        
        if (timeSinceRefresh < 2000) { // 2 seconds
          console.log('🔄 Skipping MQTT queue data due to recent manual refresh');
          return;
        }
        
        // Process queue data from MQTT
        if (data && data.queues) {
          console.log('📋 Processing queue data from MQTT');
          setQueues(data.queues);
          setIsLoading(false);
          setLastManualRefresh(now);
        }
      };
      
      mqttClient.on('queue_update', handleQueueUpdate);
      mqttClient.on('vehicle_queue_updated', handleQueueUpdate);
      
      return () => {
        mqttClient.off('queue_update', handleQueueUpdate);
        mqttClient.off('vehicle_queue_updated', handleQueueUpdate);
      };
    }
  }, [isAuthenticated, mqttConnected, mqttAuthenticated, mqttClient]);
  
  // Initial data load when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('👤 User authenticated, loading initial queue data');
      refreshQueues();
    }
  }, [isAuthenticated, refreshQueues]);

  // Fallback refresh when WebSocket is not connected
  useEffect(() => {
    if (!isAuthenticated || isConnected) return;
    
    console.log('⏰ WebSocket not connected, setting up fallback refresh');
    const intervalId = setInterval(() => {
      refreshQueues();
    }, 30000); // Refresh every 30 seconds when WebSocket is not available
    
    return () => clearInterval(intervalId);
  }, [isAuthenticated, isConnected, refreshQueues]);
  
  const enterQueue = async (licensePlate: string) => {
    try {
      const response = await api.post('/api/queue/enter', { licensePlate });
      if (response.success) {
        const data = response.data as any;
        
        // Provide specific feedback for queue moves
        if (data?.movedFromQueue && data?.previousDestination) {
          addNotification({
            type: 'info',
            title: 'Véhicule déplacé',
            message: `${licensePlate} déplacé de ${data.previousDestination} vers une nouvelle destination`,
            duration: 5000
          });
        } else if (data?.queueEntry) {
          addNotification({
            type: 'success',
            title: 'Véhicule ajouté',
            message: `${licensePlate} ajouté à la file pour ${data.queueEntry.destinationName}`,
            duration: 4000
          });
        }
        
        // Don't refresh immediately if MQTT is connected (it will update automatically)
        if (!isConnected) {
          refreshQueues();
        }
      }
      return response;
    } catch (error) {
      console.error('Error entering queue:', error);
      return { success: false, message: 'Failed to enter queue' };
    }
  };
  
  const exitQueue = async (licensePlate: string) => {
    try {
      const response = await api.post('/api/queue/exit', { licensePlate });
      if (response.success) {
        // Don't refresh immediately if MQTT is connected
        if (!isConnected) {
          refreshQueues();
        }
      }
      return response;
    } catch (error) {
      console.error('Error exiting queue:', error);
      return { success: false, message: 'Failed to exit queue' };
    }
  };
  
  const updateVehicleStatus = async (licensePlate: string, status: string) => {
    try {
      const response = await api.put('/queue/status', { licensePlate, status });
      if (response.success) {
        // Don't refresh immediately if MQTT is connected
        if (!isConnected) {
          refreshQueues();
        }
      }
      return response;
    } catch (error) {
      console.error('Error updating vehicle status:', error);
      return { success: false, message: 'Failed to update vehicle status' };
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
      const response = await api.getQueueByDestination(destinationId);
      console.log(`📡 Response for ${destinationId}:`, response);

      if (response.success && response.data) {
        // Find the destination name from the summaries
        const summary = queueSummaries.find(s => s.destinationId === destinationId);

        if (summary) {
          setQueues(prev => ({
            ...prev,
            [summary.destinationName]: response.data
          }));
          console.log(`✅ Fetched queue data for ${summary.destinationName}: ${response.data.length} vehicles`);
        } else {
          console.error(`❌ Could not find summary for destination ID ${destinationId}`);
        }
      } else {
        console.error(`❌ Failed to fetch queue for destination ${destinationId}:`, response.message);
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
      }}
    >
      {children}
    </QueueContext.Provider>
  );
}; 