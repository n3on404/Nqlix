import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getWebSocketClient } from '../lib/websocket';
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
  const { isAuthenticated } = useAuth();
  const { addNotification } = useNotifications();
  
  // Memoize refreshQueues to prevent unnecessary re-renders
  const refreshQueues = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Try WebSocket first if real-time is enabled
      if (isWebSocketConnected) {
        const wsClient = getWebSocketClient();
        
        if (wsClient.isConnected() && isAuthenticated) {
          try {
            // Request queue data via WebSocket
            const message = {
              type: 'queue_data_request',
            };
            wsClient.sendMessage(message);
            // Note: The response will be handled by the WebSocket event listeners
            return;
          } catch (wsError) {
            console.error('WebSocket data fetch failed, falling back to REST API', wsError);
            // Continue to REST API fallback
          }
        }
      }
      
      // Fallback to REST API
      const availableQueuesResponse = await api.getAvailableQueues();
      
      if (availableQueuesResponse.success && availableQueuesResponse.data) {
        // Normalize queueSummaries
        const normalizedSummaries = availableQueuesResponse.data.map((summary: any) => ({
          ...summary,
          destinationName: summary.destinationName?.toUpperCase() || summary.destinationName
        }));
        setQueueSummaries(normalizedSummaries);
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
                }));
              } else {
                queueDetails[summary.destinationName] = [];
              }
            } catch (error) {
              queueDetails[summary.destinationName] = [];
            }
          } else {
            queueDetails[summary.destinationName] = [];
          }
        }
        console.log('REST queueSummaries (normalized):', normalizedSummaries);
        console.log('REST queueDetails (normalized):', queueDetails);
        setQueues(queueDetails);
      } else {
        setError(availableQueuesResponse.message || 'Failed to fetch queue data');
        console.error('Failed to fetch queue data:', availableQueuesResponse.message);
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred while fetching queue data');
      console.error('Queue data fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isWebSocketConnected]);
  
  // Initialize WebSocket connection
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const wsClient = getWebSocketClient();
    
    const handleConnect = () => {
      console.log('WebSocket connected');
      setIsWebSocketConnected(true);
      
      // Immediately request queue data upon connection
      wsClient.sendMessage({
        type: 'queue_data_request',
      });
    };
    
    const handleDisconnect = () => {
      console.log('WebSocket disconnected');
      setIsWebSocketConnected(false);
      
      // Try to reconnect after a short delay if real-time is still enabled
      if (isWebSocketConnected) {
        setTimeout(() => {
          if (isWebSocketConnected) {
            console.log('Attempting to reconnect WebSocket...');
            wsClient.connect();
          }
        }, 3000);
      }
    };
    
    const handleAuthenticated = () => {
      console.log('WebSocket authenticated');
      // Subscribe to queue updates
      wsClient.subscribe(['queues', 'vehicles'])
        .then(() => {
          console.log('Subscribed to queue updates');
          // Immediately request queue data upon authentication
          wsClient.sendMessage({
            type: 'queue_data_request',
          });
        })
        .catch(err => console.error('Failed to subscribe:', err));
    };
    
    const handleQueueData = (data: any) => {
      console.log('Received queue data', data);
      
      // Process queue summaries
      if (data.summaries && Array.isArray(data.summaries)) {
        // Convert raw database objects to proper QueueSummary objects
        const processedSummaries = data.summaries.map((summary: any) => ({
          destinationId: summary.destinationId,
          destinationName: summary.destinationName,
          totalVehicles: Number(summary.totalVehicles) || 0,
          waitingVehicles: Number(summary.waitingVehicles) || 0,
          loadingVehicles: Number(summary.loadingVehicles) || 0,
          readyVehicles: Number(summary.readyVehicles) || 0,
          estimatedNextDeparture: summary.estimatedNextDeparture
        }));
        
        console.log('Setting queue summaries:', processedSummaries);
        setQueueSummaries(processedSummaries);
      }
      
      // Process queue details
      if (data.queues) {
        // Normalize destinationName keys to uppercase
        const newQueues: Record<string, any[]> = {};
        
        // Process each destination's queue
        Object.entries(data.queues).forEach(([destinationName, queueItems]) => {
          const key = destinationName.toUpperCase();
          // Ensure queueItems is an array
          if (Array.isArray(queueItems)) {
            // Convert each queue item to the expected format
            newQueues[key] = (queueItems as any[]).map(item => ({
              ...item,
              destinationName: item.destinationName?.toUpperCase() || key
            }));
          } else {
            // If not an array, initialize as empty array
            newQueues[key] = [];
          }
        });
        
        // Make sure all destinations from summaries have an entry in queues
        if (data.summaries && Array.isArray(data.summaries)) {
          for (const summary of data.summaries) {
            const key = summary.destinationName.toUpperCase();
            if (!newQueues[key]) {
              newQueues[key] = [];
            }
          }
        }
        
        console.log('Setting queues (normalized):', newQueues);
        setQueues(newQueues);
      }
      
      setIsLoading(false);
    };
    
    const handleQueueUpdate = (data: any) => {
      console.log('Received queue update');
      addNotification && addNotification({
        type: 'info',
        title: 'Queue Updated',
        message: 'A real-time queue update was received.',
        duration: 3000
      });
      // Update queue summaries if provided
      if (data.summaries) {
        setQueueSummaries(data.summaries);
      }
      // Update queues if provided
      if (data.queue) {
        const queue = data.queue;
        const destination = queue.destinationName;
        setQueues(prev => {
          const newQueues = { ...prev };
          if (!newQueues[destination]) {
            newQueues[destination] = [];
          }
          // Find and update or add the queue
          const index = newQueues[destination].findIndex(q => q.id === queue.id);
          if (index >= 0) {
            newQueues[destination][index] = queue;
          } else {
            newQueues[destination].push(queue);
          }
          // Sort by queue position
          newQueues[destination].sort((a, b) => a.queuePosition - b.queuePosition);
          return newQueues;
        });
      }
    };
    
    // Register event listeners
    wsClient.on('connected', handleConnect);
    wsClient.on('disconnected', handleDisconnect);
    wsClient.on('authenticated', handleAuthenticated);
    wsClient.on('queue_data', handleQueueData);
    wsClient.on('queue_update', handleQueueUpdate);
    
    // Connect to WebSocket server
    wsClient.connect();
    
    // Cleanup function
    return () => {
      wsClient.removeListener('connected', handleConnect);
      wsClient.removeListener('disconnected', handleDisconnect);
      wsClient.removeListener('authenticated', handleAuthenticated);
      wsClient.removeListener('queue_data', handleQueueData);
      wsClient.removeListener('queue_update', handleQueueUpdate);
    };
  }, [isAuthenticated, isWebSocketConnected, addNotification]);
  
  // Always fetch from API on mount and on disconnect
  useEffect(() => {
    if (!isAuthenticated) return;
    refreshQueues(); // Fetch from API on mount
  }, [isAuthenticated]);

  // On WebSocket disconnect, fetch from API
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!isWebSocketConnected) {
        refreshQueues();
    }
  }, [isAuthenticated, isWebSocketConnected, refreshQueues]);
  
  const enterQueue = async (licensePlate: string) => {
    try {
      const response = await api.post('/api/queue/enter', { licensePlate });
      if (response.success) {
        refreshQueues();
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
        refreshQueues();
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
        refreshQueues();
      }
      return response;
    } catch (error) {
      console.error('Error updating vehicle status:', error);
      return { success: false, message: 'Failed to update vehicle status' };
    }
  };
  
  // Function to fetch queue data for a specific destination
  const fetchQueueForDestination = async (destinationId: string) => {
    if (!isAuthenticated) return;
    
    try {
      const response = await api.getQueueByDestination(destinationId);
      
      if (response.success && response.data) {
        // Find the destination name from the summaries
        const summary = queueSummaries.find(s => s.destinationId === destinationId);
        
        if (summary) {
          setQueues(prev => ({
            ...prev,
            [summary.destinationName]: response.data
          }));
          console.log(`Fetched queue data for ${summary.destinationName}: ${response.data.length} vehicles`);
        }
      } else {
        console.error(`Failed to fetch queue for destination ${destinationId}:`, response.message);
      }
    } catch (error) {
      console.error(`Error fetching queue for destination ${destinationId}:`, error);
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