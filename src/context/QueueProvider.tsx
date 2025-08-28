import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getWebSocketClient, initializeWebSocket } from '../lib/websocket';
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
      firstName: string;
      lastName: string;
      phoneNumber: string;
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
}

interface QueueContextType {
  queues: Record<string, QueueItem[]>;
  queueSummaries: QueueSummary[];
  isLoading: boolean;
  error: string | null;
  refreshQueues: () => Promise<void>;
  fetchQueueForDestination: (destinationId: string) => Promise<void>;
  isWebSocketConnected: boolean;
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
  isWebSocketConnected: false,
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
  const [isWebSocketConnected, setIsWebSocketConnected] = useState<boolean>(false);
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
  
  // Initialize WebSocket connection and set up event handlers
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('👤 Not authenticated, skipping WebSocket setup');
      return;
    }
    
    console.log('🔌 Setting up WebSocket connection for queue updates...');
    const wsClient = initializeWebSocket(); // Use the new initialization function
    
    const handleConnect = () => {
      console.log('✅ WebSocket connected for queue updates');
      setIsWebSocketConnected(true);
    };
    
    const handleDisconnect = () => {
      console.log('❌ WebSocket disconnected for queue updates');
      setIsWebSocketConnected(false);
    };
    
    const handleAuthenticated = () => {
      console.log('🔐 WebSocket authenticated for queue updates');
      setIsWebSocketConnected(true);
      
      // Subscribe to queue updates
      wsClient.subscribe(['queues', 'dashboard', 'bookings'])
        .then(() => {
          console.log('📡 Subscribed to queue updates');
          // Request initial queue data
          return wsClient.requestQueueData();
        })
        .catch(err => console.error('❌ Failed to subscribe to queue updates:', err));
    };
    
    const handleQueueData = (data: any) => {
      console.log('📊 Received WebSocket queue data:', data);

      // Check if we recently had a manual refresh - if so, be more conservative with WebSocket updates
      const timeSinceManualRefresh = Date.now() - lastManualRefresh;
      const isRecentManualRefresh = timeSinceManualRefresh < 5000; // 5 seconds

      if (isRecentManualRefresh) {
        console.log('🔄 Skipping WebSocket queue data due to recent manual refresh');
        return;
      }

      try {
        // Process queue data if present - handle both formats (array and object)
        if (data && data.queues) {
          console.log('📋 Processing queue data from WebSocket');

          const summaries: QueueSummary[] = [];
          const queueDetails: Record<string, QueueItem[]> = {};

          // Handle array format (from dashboard_data)
          if (Array.isArray(data.queues)) {
            console.log('📋 Processing array format queue data');

            data.queues.forEach((queueItem: any) => {
              if (queueItem && queueItem.destinationName) {
                const destinationName = queueItem.destinationName.toUpperCase();

                // Create summary from queue item
                const summary: QueueSummary = {
                  destinationId: queueItem.destinationId || destinationName,
                  destinationName: destinationName,
                  totalVehicles: queueItem.vehicleCount || 0,
                  waitingVehicles: queueItem.waitingVehicles || 0,
                  loadingVehicles: queueItem.loadingVehicles || 0,
                  readyVehicles: queueItem.readyVehicles || 0,
                  estimatedNextDeparture: queueItem.estimatedNextDeparture
                };

                summaries.push(summary);
                // Initialize empty array for this destination (will be filled by API if needed)
                queueDetails[destinationName] = [];
              }
            });
          }
          // Handle object format (from direct queue data)
          else if (typeof data.queues === 'object') {
            console.log('📋 Processing object format queue data');

            Object.entries(data.queues).forEach(([destinationName, queueItems]: [string, any]) => {
              // Skip numeric keys (array indices)
              if (!isNaN(Number(destinationName))) return;

              const items = Array.isArray(queueItems) ? queueItems : [];
              const normalizedDestination = destinationName.toUpperCase();

              // Create summary
              const summary: QueueSummary = {
                destinationId: items[0]?.destinationId || destinationName,
                destinationName: normalizedDestination,
                totalVehicles: items.length,
                waitingVehicles: items.filter(item => item.status === 'WAITING').length,
                loadingVehicles: items.filter(item => item.status === 'LOADING').length,
                readyVehicles: items.filter(item => item.status === 'READY').length,
                estimatedNextDeparture: items[0]?.estimatedDeparture
              };

              summaries.push(summary);
              queueDetails[normalizedDestination] = items.map((item: any) => ({
                ...item,
                destinationName: normalizedDestination
              }));
            });
          }

          console.log('✅ WebSocket queue data processed:', summaries.length, 'destinations');
          if (summaries.length > 0) {
            setQueueSummaries(summaries);

            // Only update queue details if we actually have detailed data
            // Don't overwrite existing detailed data with empty arrays from dashboard_data
            const hasDetailedData = Object.values(queueDetails).some(items => items.length > 0);
            if (hasDetailedData) {
              setQueues(queueDetails);
            } else {
              console.log('📋 Dashboard data received, summaries updated but keeping existing detailed data');
            }
          }
          setIsLoading(false);
        }
        
        // Handle direct summaries if provided (fallback format)
        if (data && data.summaries && Array.isArray(data.summaries)) {
          console.log('📋 Processing queue summaries (legacy format)');
          const processedSummaries = data.summaries.map((summary: any) => ({
            destinationId: summary.destinationId,
            destinationName: summary.destinationName?.toUpperCase() || summary.destinationName,
            totalVehicles: Number(summary.totalVehicles) || 0,
            waitingVehicles: Number(summary.waitingVehicles) || 0,
            loadingVehicles: Number(summary.loadingVehicles) || 0,
            readyVehicles: Number(summary.readyVehicles) || 0,
            estimatedNextDeparture: summary.estimatedNextDeparture
          }));
          
          setQueueSummaries(processedSummaries);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('❌ Error processing WebSocket queue data:', error);
      }
    };
    
    const handleQueueUpdate = (data: any) => {
      console.log('🚗 Received real-time queue update:', data);

      // Check if we recently had a manual refresh - if so, be more conservative with updates
      const timeSinceManualRefresh = Date.now() - lastManualRefresh;
      const isRecentManualRefresh = timeSinceManualRefresh < 3000; // 3 seconds

      if (isRecentManualRefresh) {
        console.log('🔄 Skipping WebSocket update due to recent manual refresh');
        return;
      }

      // Handle individual queue entry updates
      if (data && data.queue) {
        const queue = data.queue;
        const destination = queue.destinationName?.toUpperCase() || queue.destinationName;

        setQueues(prev => {
          const newQueues = { ...prev };
          if (!newQueues[destination]) {
            newQueues[destination] = [];
          }

          // Find and update or add the queue item
          const index = newQueues[destination].findIndex(q => q.id === queue.id);
          if (index >= 0) {
            newQueues[destination][index] = {
              ...queue,
              destinationName: destination
            };
          } else {
            newQueues[destination].push({
              ...queue,
              destinationName: destination
            });
          }

          // Sort by queue position
          newQueues[destination].sort((a, b) => a.queuePosition - b.queuePosition);
          return newQueues;
        });

        // Show notification only for significant updates
        if (addNotification && (queue.status === 'DEPARTED' || queue.status === 'READY')) {
          addNotification({
            type: 'info',
            title: 'Queue Updated',
            message: `Vehicle ${queue.licensePlate} status: ${queue.status}`,
            duration: 3000
          });
        }
      }

      // Handle full queue data updates (like from refresh)
      if (data && data.queues && typeof data.queues === 'object') {
        console.log('📋 Processing full queue data update from WebSocket');
        const processedQueues: Record<string, any[]> = {};

        Object.entries(data.queues).forEach(([destinationName, queueItems]: [string, any]) => {
          const items = Array.isArray(queueItems) ? queueItems : [];
          const normalizedDestination = destinationName.toUpperCase();

          processedQueues[normalizedDestination] = items.map((item: any) => ({
            ...item,
            destinationName: normalizedDestination
          })).sort((a, b) => a.queuePosition - b.queuePosition);
        });

        setQueues(processedQueues);
        console.log('✅ WebSocket queue data updated:', Object.keys(processedQueues).length, 'destinations');
      }

      // Update summaries if provided
      if (data && data.summaries && Array.isArray(data.summaries)) {
        console.log('📋 Updating queue summaries from WebSocket');
        const processedSummaries = data.summaries.map((summary: any) => ({
          destinationId: summary.destinationId,
          destinationName: summary.destinationName?.toUpperCase() || summary.destinationName,
          totalVehicles: Number(summary.totalVehicles) || 0,
          waitingVehicles: Number(summary.waitingVehicles) || 0,
          loadingVehicles: Number(summary.loadingVehicles) || 0,
          readyVehicles: Number(summary.readyVehicles) || 0,
          estimatedNextDeparture: summary.estimatedNextDeparture
        }));
        setQueueSummaries(processedSummaries);
      }
    };
    
    const handleError = (error: any) => {
      console.error('❌ WebSocket error:', error);
      setError(error?.message || 'WebSocket connection error');
    };
    
    // Register event listeners
    wsClient.on('connected', handleConnect);
    wsClient.on('disconnected', handleDisconnect);
    wsClient.on('authenticated', handleAuthenticated);
    wsClient.on('queue_data', handleQueueData);
    wsClient.on('dashboard_data', handleQueueData); // Handle both event types
    wsClient.on('initial_data', handleQueueData); // Handle initial data
    wsClient.on('queue_update', handleQueueUpdate);
    wsClient.on('error', handleError);
    
    // Check current connection state
    if (wsClient.isAuthenticated()) {
      setIsWebSocketConnected(true);
      // Subscribe and request data if already authenticated
      wsClient.subscribe(['queues', 'dashboard', 'bookings'])
        .then(() => wsClient.requestQueueData())
        .catch(err => console.error('❌ Failed to subscribe on mount:', err));
    } else if (wsClient.isConnected()) {
      setIsWebSocketConnected(true);
    }
    
    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up WebSocket queue listeners');
      wsClient.removeListener('connected', handleConnect);
      wsClient.removeListener('disconnected', handleDisconnect);
      wsClient.removeListener('authenticated', handleAuthenticated);
      wsClient.removeListener('queue_data', handleQueueData);
      wsClient.removeListener('dashboard_data', handleQueueData);
      wsClient.removeListener('initial_data', handleQueueData);
      wsClient.removeListener('queue_update', handleQueueUpdate);
      wsClient.removeListener('error', handleError);
    };
  }, [isAuthenticated, addNotification, lastManualRefresh]); // Include lastManualRefresh to handle updates
  
  // Initial data load when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('👤 User authenticated, loading initial queue data');
      refreshQueues();
    }
  }, [isAuthenticated, refreshQueues]);

  // Fallback refresh when WebSocket is not connected
  useEffect(() => {
    if (!isAuthenticated || isWebSocketConnected) return;
    
    console.log('⏰ WebSocket not connected, setting up fallback refresh');
    const intervalId = setInterval(() => {
      refreshQueues();
    }, 30000); // Refresh every 30 seconds when WebSocket is not available
    
    return () => clearInterval(intervalId);
  }, [isAuthenticated, isWebSocketConnected, refreshQueues]);
  
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
        
        // Don't refresh immediately if WebSocket is connected (it will update automatically)
        if (!isWebSocketConnected) {
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
        // Don't refresh immediately if WebSocket is connected
        if (!isWebSocketConnected) {
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
        // Don't refresh immediately if WebSocket is connected
        if (!isWebSocketConnected) {
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
        isWebSocketConnected,
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