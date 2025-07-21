import { Button } from "../components/ui/button";
import { 
  Car, 
  Clock, 
  Users, 
  Star, 
  ArrowRight,
  GripVertical,
  RefreshCw,
  CheckCircle,
  SignalHigh,
  WifiOff,
  Activity,
  Loader2,
  Edit,
  UserCheck,
  AlertCircle,
  TrendingUp
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQueue } from "../context/QueueProvider";
import { formatCurrency } from "../utils/formatters";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useNotifications } from "../context/NotificationProvider";
import { getWebSocketClient, initializeWebSocket } from "../lib/websocket";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import api from "../lib/api";

// Sortable queue item component
interface SortableQueueItemProps {
  queue: any;
  getStatusColor: (status: string) => string;
  formatTime: (dateString: string) => string;
  getBasePriceForDestination: (destinationName: string) => number | undefined;
  onVehicleClick: (vehicle: any) => void;
}

function SortableQueueItem({ queue, getStatusColor, formatTime, getBasePriceForDestination, onVehicleClick }: SortableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: queue.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const basePrice = getBasePriceForDestination(queue.destinationName) ?? queue.basePrice;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-gradient-to-br from-card to-muted border border-primary/30 rounded-2xl shadow-lg transition-all duration-200 ${
        isDragging ? 'opacity-70 shadow-2xl scale-105 border-primary' : 'hover:shadow-xl hover:border-primary/60'
      }`}
    >
      {/* Left: Drag Handle, Position, Vehicle Info */}
      <div className="flex items-center gap-6 flex-1 w-full">
        {/* Drag Handle */}
        <div className="flex flex-col items-center mr-2">
          <GripVertical className="h-6 w-6 text-white opacity-60 mb-2 cursor-grab" {...attributes} {...listeners} />
          {/* Position Badge */}
          <div className="bg-gradient-to-br from-primary to-primary/80 text-white rounded-full w-14 h-14 flex items-center justify-center font-extrabold text-2xl shadow-lg border-4 border-white/20">
            {queue.queuePosition}
          </div>
        </div>
        {/* Vehicle Info - Now Clickable */}
        <div 
          className="flex items-center gap-4 flex-1 cursor-pointer hover:bg-primary/10 p-3 rounded-lg transition-colors group"
          onClick={() => onVehicleClick({ 
            licensePlate: queue.licensePlate,
            firstName: queue.vehicle?.driver?.firstName,
            lastName: queue.vehicle?.driver?.lastName,
            currentDestination: queue.destinationName, 
            currentDestinationId: queue.destinationId,
            queueId: queue.id 
          })}
        >
          <div className="p-3 bg-accent rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Car className="h-7 w-7 text-primary-foreground" />
          </div>
                      <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-bold text-white text-lg tracking-wide">{queue.licensePlate}</p>
                <Edit className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">{queue.vehicle?.driver?.firstName} {queue.vehicle?.driver?.lastName}</p>
              <p className="text-xs text-blue-400 group-hover:text-blue-300">Cliquez pour changer la destination</p>
            </div>
        </div>
      </div>
      {/* Divider for wide screens */}
      <div className="hidden md:block h-16 w-px bg-primary/20 mx-4" />
              {/* Right: Status & Actions */}
        <div className="flex flex-col md:flex-row items-center gap-6 flex-shrink-0">
          {/* Enhanced Seat Booking Display */}
          <div className="text-center">
            {(() => {
              const bookedSeats = queue.totalSeats - queue.availableSeats;
              const bookingPercentage = (bookedSeats / queue.totalSeats) * 100;
              const isFullyBooked = queue.availableSeats === 0 || queue.status === 'READY';
              
              return (
                <div className="space-y-2">
                  {/* Seat Count */}
                  <div className="flex items-center justify-center gap-2">
                    <Users className={`h-5 w-5 ${isFullyBooked ? 'text-red-400' : 'text-white'}`} />
                    <span className={`font-bold text-lg ${isFullyBooked ? 'text-red-400' : 'text-white'}`}>
                      {queue.availableSeats}/{queue.totalSeats}
                    </span>
                  </div>
                  
                  {/* Booking Status */}
                  <div className="text-xs">
                    {isFullyBooked ? (
                      <div className="bg-red-500 text-white px-2 py-1 rounded-full font-semibold flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        COMPLET
                      </div>
                    ) : bookedSeats > 0 ? (
                      <div className="bg-orange-500 text-white px-2 py-1 rounded-full flex items-center gap-1">
                        <UserCheck className="h-3 w-3" />
                        {bookedSeats} réservé{bookedSeats > 1 ? 's' : ''}
                      </div>
                    ) : (
                      <div className="text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        places libres
                      </div>
                    )}
                  </div>
                  
                  {/* Booking Progress Bar */}
                  <div className="w-16 h-2 bg-gray-300 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        isFullyBooked ? 'bg-red-500' : 
                        bookingPercentage > 75 ? 'bg-orange-500' : 
                        bookingPercentage > 50 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${bookingPercentage}%` }}
                    />
                  </div>
                  
                  {/* Booking Percentage */}
                  <div className="text-xs text-muted-foreground">
                    {Math.round(bookingPercentage)}% réservé
                  </div>
                </div>
              );
            })()}
          </div>
        {/* Departure */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <Clock className="h-5 w-5 text-white" />
            <span className="text-base font-semibold text-white">
              {queue.estimatedDeparture ? formatTime(queue.estimatedDeparture) : 'TBD'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">départ estimé</p>
        </div>
        {/* Price */}
        <div className="text-center">
          <p className="text-xl font-bold text-primary-foreground bg-primary/80 px-3 py-1 rounded-lg shadow">{formatCurrency(basePrice)}</p>
          <p className="text-xs text-muted-foreground">prix de base</p>
        </div>
        {/* Action */}
        <Button variant="default" size="icon" className="ml-2 bg-primary text-white shadow-lg hover:bg-primary/90">
          <ArrowRight className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}

// Utility to normalize destination names for better matching
function normalizeDestinationName(name: string) {
  return name.replace(/^STATION /i, "").toUpperCase().trim();
}

// Utility to match station names more robustly
function normalizeStationName(name: string) {
  return name.toUpperCase().trim();
}

export default function QueueManagement() {
  const {
    queues,
    queueSummaries,
    isLoading,
    error,
    refreshQueues,
    fetchQueueForDestination,
    isWebSocketConnected,
    enterQueue,
    exitQueue,
    updateVehicleStatus,
  } = useQueue();
  const { addNotification } = useNotifications();
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // vehicle id or action
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [addVehicleError, setAddVehicleError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  
  // Vehicle destination selection state
  const [vehicleDestinations, setVehicleDestinations] = useState<any[]>([]);
  const [selectedVehicleDestination, setSelectedVehicleDestination] = useState<string | null>(null);
  const [destinationsLoading, setDestinationsLoading] = useState(false);
  const [defaultDestination, setDefaultDestination] = useState<any | null>(null);

  // Change queue modal state
  const [showChangeQueueModal, setShowChangeQueueModal] = useState(false);
  const [selectedVehicleForQueueChange, setSelectedVehicleForQueueChange] = useState<any | null>(null);
  const [changeQueueDestinations, setChangeQueueDestinations] = useState<any[]>([]);
  const [selectedNewDestination, setSelectedNewDestination] = useState<string | null>(null);
  const [changeQueueLoading, setChangeQueueLoading] = useState(false);
  const [changeQueueError, setChangeQueueError] = useState<string | null>(null);

  // Helper to get base price for a destination - updated to work with route table
  function getBasePriceForDestination(destinationName: string) {
    // Try exact match first
    let route = routes.find(r => 
      normalizeStationName(r.stationName) === normalizeStationName(destinationName)
    );
    
    // If no exact match, try with normalized names (remove common prefixes/suffixes)
    if (!route) {
      const normalizedDestination = normalizeDestinationName(destinationName);
      route = routes.find(r => 
        normalizeDestinationName(r.stationName) === normalizedDestination
      );
    }
    
    // If still no match, try partial matching
    if (!route) {
      route = routes.find(r => 
        normalizeStationName(r.stationName).includes(normalizeStationName(destinationName)) ||
        normalizeStationName(destinationName).includes(normalizeStationName(r.stationName))
      );
    }
    
    return route?.basePrice;
  }

  // Enhanced function to get route info for a destination
  function getRouteForDestination(destinationName: string) {
    // Try exact match first
    let route = routes.find(r => 
      normalizeStationName(r.stationName) === normalizeStationName(destinationName)
    );
    
    // If no exact match, try with normalized names
    if (!route) {
      const normalizedDestination = normalizeDestinationName(destinationName);
      route = routes.find(r => 
        normalizeDestinationName(r.stationName) === normalizedDestination
      );
    }
    
    // If still no match, try partial matching
    if (!route) {
      route = routes.find(r => 
        normalizeStationName(r.stationName).includes(normalizeStationName(destinationName)) ||
        normalizeStationName(destinationName).includes(normalizeStationName(r.stationName))
      );
    }
    
    return route;
  }

  // Fetch available destinations for a vehicle
  const fetchVehicleDestinations = async (licensePlate: string) => {
    setDestinationsLoading(true);
    setVehicleDestinations([]);
    setSelectedVehicleDestination(null);
    setDefaultDestination(null);
    
    try {
      const response = await api.get(`/api/queue/vehicle/${licensePlate}/destinations`);
      
      if (response.success && response.data) {
        const data = response.data as any;
        console.log('🎯 Vehicle destinations loaded:', data);
        setVehicleDestinations(data.destinations || []);
        setDefaultDestination(data.defaultDestination);
        
        // Auto-select default destination if available
        if (data.defaultDestination) {
          setSelectedVehicleDestination(data.defaultDestination.stationId);
          console.log('✅ Auto-selected default destination:', data.defaultDestination.stationName);
        } else if (data.destinations && data.destinations.length > 0) {
          // Auto-select first destination if no default
          setSelectedVehicleDestination(data.destinations[0].stationId);
          console.log('✅ Auto-selected first destination:', data.destinations[0].stationName);
        }
      } else {
        console.warn('⚠️ Failed to load destinations:', response);
      }
    } catch (error: any) {
      console.error('Error fetching vehicle destinations:', error);
      setAddVehicleError('Impossible de charger les destinations autorisées pour ce véhicule');
    } finally {
      setDestinationsLoading(false);
    }
  };

  // Fetch available destinations for queue change
  const fetchChangeQueueDestinations = async (licensePlate: string, currentDestinationId?: string) => {
    console.log('🔄 Fetching destinations for vehicle:', licensePlate);
    setChangeQueueLoading(true);
    setChangeQueueDestinations([]);
    setSelectedNewDestination(null);
    setChangeQueueError(null);
    
    try {
      const response = await api.get(`/api/queue/vehicle/${licensePlate}/destinations`);
      console.log('🔄 Raw API response for destinations:', response);
      
      if (response.success && response.data) {
        const data = response.data as any;
        console.log('🔄 Change queue destinations loaded:', data);
        console.log('🔄 All destinations:', data.destinations);
        console.log('🔄 Current destination ID:', currentDestinationId);
        
        // Filter out current destination if vehicle is already in a queue
        const availableDestinations = (data.destinations || []).filter((dest: any) => {
          console.log(`🔄 Checking destination ${dest.stationName} (${dest.stationId}) vs current ${currentDestinationId}`);
          return dest.stationId !== currentDestinationId;
        });
        
        console.log('🔄 Available destinations after filtering:', availableDestinations);
        setChangeQueueDestinations(availableDestinations);
        
        // Auto-select first available destination
        if (availableDestinations.length > 0) {
          setSelectedNewDestination(availableDestinations[0].stationId);
          console.log('✅ Auto-selected first available destination for queue change:', availableDestinations[0].stationName);
        } else {
          console.log('⚠️ No available destinations after filtering');
        }
      } else {
        console.warn('⚠️ Failed to load destinations for queue change:', response);
        setChangeQueueError('Impossible de charger les destinations disponibles');
      }
    } catch (error: any) {
      console.error('❌ Error fetching destinations for queue change:', error);
      setChangeQueueError('Erreur lors du chargement des destinations');
    } finally {
      setChangeQueueLoading(false);
    }
  };

  // Handle vehicle click to change queue
  const handleVehicleClick = (vehicle: any) => {
    console.log('🖱️ Vehicle clicked for queue change:', vehicle);
    setSelectedVehicleForQueueChange(vehicle);
    setShowChangeQueueModal(true);
    setChangeQueueError(null);
    
    // Fetch available destinations for this vehicle
    if (vehicle.licensePlate) {
      fetchChangeQueueDestinations(vehicle.licensePlate, vehicle.currentDestinationId);
    }
  };

  // Real-time notifications for queue/vehicle events
  useEffect(() => {
    if (!isWebSocketConnected) return;
    const wsClient = getWebSocketClient();
    
    const queueHandler = (msg: any) => {
      console.log('🔄 Queue update received:', msg);
      
      // Refresh queue data when update received
      refreshQueues();
      
      if (msg?.payload?.queue) {
        addNotification({
          type: 'info',
          title: 'Queue Update',
          message: `Véhicule ${msg.payload.queue.vehicle?.licensePlate || ''} mis à jour dans la file d'attente ${msg.payload.queue.destinationName}`,
          duration: 4000
        });
      }
    };
    
    const bookingHandler = (msg: any) => {
      console.log('🎯 Booking update received:', msg);
      
      // Refresh queue data when booking update received
      refreshQueues();
      
      if (msg?.payload) {
        const booking = msg.payload;
        const bookedSeats = booking.seatsBooked || booking.seats;
        const vehiclePlate = booking.vehicleLicensePlate || booking.licensePlate;
        const destination = booking.destinationName || booking.destination;
        
        if (vehiclePlate && destination) {
          addNotification({
            type: 'success',
            title: 'Nouvelle Réservation',
            message: `${bookedSeats} place${bookedSeats > 1 ? 's' : ''} réservée${bookedSeats > 1 ? 's' : ''} sur ${vehiclePlate} → ${destination}`,
            duration: 5000
          });
        }
      }
    };
    
    const queueUpdatedHandler = (msg: any) => {
      console.log('🔄 Queue updated event received:', msg);
      // Force refresh queue data when queue_updated event received
      setTimeout(() => {
        console.log('🔄 Force refreshing queues after queue update...');
        refreshQueues();
      }, 100); // Small delay to ensure backend has processed the update
    };
    
    const bookingCreatedHandler = (msg: any) => {
      console.log('🎯 Booking created event received:', msg);
      // Force refresh queue data when booking_created event received
      setTimeout(() => {
        console.log('🔄 Force refreshing queues after booking created...');
        refreshQueues();
      }, 100);
      
      if (msg?.payload || msg) {
        const booking = msg.payload || msg;
        const seatsBooked = booking.seatsBooked || booking.seats || 1;
        addNotification({
          type: 'success',
          title: 'Nouvelle Réservation',
          message: `Réservation créée - ${seatsBooked} place${seatsBooked > 1 ? 's' : ''}`,
          duration: 5000
        });
      }
    };
    
    const vehicleStatusHandler = (msg: any) => {
      console.log('🚗 Vehicle status update received:', msg);
      
      // Refresh queue data when vehicle status changes
      refreshQueues();
      
      if (msg?.payload?.vehicle && msg?.payload?.status) {
        const vehicle = msg.payload.vehicle;
        const status = msg.payload.status;
        
        if (status === 'READY') {
          addNotification({
            type: 'warning',
            title: 'Véhicule Complet',
            message: `Véhicule ${vehicle.licensePlate} est maintenant complet et prêt au départ`,
            duration: 6000
          });
        }
      }
    };
    
    // Listen for multiple event types that could indicate queue/booking changes
    wsClient.on('queue_update', queueHandler);
    wsClient.on('booking_update', bookingHandler);
    wsClient.on('vehicle_status_update', vehicleStatusHandler);
    wsClient.on('queue_updated', queueUpdatedHandler);
    wsClient.on('booking_created', bookingCreatedHandler);
    wsClient.on('cash_booking_updated', queueUpdatedHandler);
    wsClient.on('financial_update', queueUpdatedHandler);
    
    return () => {
      wsClient.removeListener('queue_update', queueHandler);
      wsClient.removeListener('booking_update', bookingHandler);
      wsClient.removeListener('vehicle_status_update', vehicleStatusHandler);
      wsClient.removeListener('queue_updated', queueUpdatedHandler);
      wsClient.removeListener('booking_created', bookingCreatedHandler);
      wsClient.removeListener('cash_booking_updated', queueUpdatedHandler);
      wsClient.removeListener('financial_update', queueUpdatedHandler);
    };
  }, [isWebSocketConnected, addNotification, refreshQueues]);

  // Initialize WebSocket connection for real-time updates
  useEffect(() => {
    console.log('🔌 Queue Management: Initializing WebSocket connection...');
    const wsClient = initializeWebSocket();
    
    // Ensure we're connected for real-time updates
    if (!wsClient.isConnected()) {
      console.log('🔌 Queue Management: WebSocket not connected, connecting...');
      wsClient.connect();
    }
  }, []);

  // Update lastUpdated timestamp when queues change
  useEffect(() => {
    setLastUpdated(new Date());
  }, [queues]);

  // Fetch queue data for selected destination
  useEffect(() => {
    if (selectedDestination) {
      // Find the destination ID from the summaries
      const summary = queueSummaries.find(s => s.destinationName === selectedDestination);
      if (summary) {
        fetchQueueForDestination(summary.destinationId);
      }
    }
  }, [selectedDestination, queueSummaries, fetchQueueForDestination]);

  // Fetch vehicles when modal opens
  useEffect(() => {
    if (showAddVehicleModal) {
      setVehiclesLoading(true);
      setVehiclesError(null);
      import("../lib/api").then(({ default: api }) => {
        api.getVehicles().then(res => {
          if (res.success && res.data) {
            setVehicles(res.data);
          } else {
            setVehiclesError(res.message || "Échec de la récupération des véhicules");
          }
          setVehiclesLoading(false);
        }).catch(err => {
          setVehiclesError("Échec de la récupération des véhicules");
          setVehiclesLoading(false);
        });
      });
    }
  }, [showAddVehicleModal]);

  // When modal opens, clear error
  useEffect(() => {
    if (showAddVehicleModal) {
      setAddVehicleError(null);
    }
  }, [showAddVehicleModal]);

  // Fetch destinations when vehicle is selected
  useEffect(() => {
    if (selectedVehicle && selectedVehicle.licensePlate) {
      fetchVehicleDestinations(selectedVehicle.licensePlate);
    } else {
      setVehicleDestinations([]);
      setSelectedVehicleDestination(null);
      setDefaultDestination(null);
    }
  }, [selectedVehicle]);

  // Fetch all routes on mount
  useEffect(() => {
    api.get("/api/routes").then(res => {
      if (res.success && Array.isArray(res.data)) {
        console.log('📍 Routes loaded:', res.data);
        setRoutes(res.data);
      } else {
        console.warn('⚠️ Failed to load routes:', res);
        setRoutes([]);
      }
    }).catch(error => {
      console.error('❌ Error loading routes:', error);
      setRoutes([]);
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent, destination: string) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const currentQueues = queues[destination] || [];
    const oldIndex = currentQueues.findIndex(q => q.id === active.id);
    const newIndex = currentQueues.findIndex(q => q.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      console.log(`🔄 Reordering queue for ${destination} from ${oldIndex} to ${newIndex}`);
      // In a real app, you would call an API to update the queue positions
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'LOADING': return 'text-primary bg-accent';
      case 'WAITING': return 'text-yellow-700 bg-muted';
      case 'READY': return 'text-green-700 bg-accent';
      case 'DEPARTED': return 'text-muted-foreground bg-muted';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get list of destinations from summaries if queues object is empty
  const destinations = queueSummaries.map(summary => normalizeDestinationName(summary.destinationName));

  // Get licensePlates already in any queue (robust extraction)
  const allQueueItems = Object.values(queues).flat();
  console.log("Sample queue item for vehiclesInAnyQueue:", allQueueItems[0]);
  const vehiclesInAnyQueue = allQueueItems.map((q: any) => {
    // Use the correct property path - licensePlate is directly on the queue object
    return (q.licensePlate || "").toUpperCase().trim();
  });

  // Debug logging
  console.log('queues', queues);
  console.log('vehiclesInAnyQueue', vehiclesInAnyQueue);
  console.log('vehicles', vehicles);
  
  // Log booking status for debugging
  console.log('🎯 Booking Status Debug:');
  Object.entries(queues).forEach(([dest, queueItems]: [string, any[]]) => {
    queueItems.forEach((item: any) => {
      const bookedSeats = (item.totalSeats || 0) - (item.availableSeats || 0);
      console.log(`  ${item.licensePlate}: ${item.availableSeats}/${item.totalSeats} (${bookedSeats} booked, ${item.status})`);
    });
  });

  // Optimistic UI for queue actions
  const handleEnterQueue = async (licensePlate: string) => {
    setActionLoading(licensePlate);
    // Optionally update UI optimistically here
    const result = await enterQueue(licensePlate);
    setActionLoading(null);
    if (!result.success) {
      addNotification({
        type: 'error',
        title: 'Échec de l\'entrée en file',
        message: result.message || 'Échec de l\'entrée en file',
        duration: 4000
      });
    }
    return result; // Return the result for optimistic update
  };

  // Enter queue with specific destination
  const handleEnterQueueWithDestination = async (licensePlate: string, destinationId: string, destinationName?: string) => {
    try {
      const response = await api.post('/api/queue/enter', { 
        licensePlate, 
        destinationId, 
        destinationName 
      });
      
      if (response.success) {
        const data = response.data as any;
        if (data?.movedFromQueue && data?.previousDestination) {
          addNotification({
            type: 'info',
            title: 'Véhicule déplacé',
            message: `${licensePlate} déplacé de ${data.previousDestination} vers ${destinationName || 'la destination sélectionnée'}`,
            duration: 5000
          });
        } else {
          addNotification({
            type: 'success',
            title: 'Véhicule ajouté',
            message: `${licensePlate} ajouté à la file pour ${destinationName || 'la destination sélectionnée'}`,
            duration: 4000
          });
        }
        refreshQueues(); // Refresh the queue data
      }
      
      return response;
    } catch (error: any) {
      console.error('Error entering queue with destination:', error);
      return { success: false, message: error.message || 'Échec de l\'entrée en file' };
    }
  };
  const handleExitQueue = async (licensePlate: string) => {
    setActionLoading(licensePlate);
    const result = await exitQueue(licensePlate);
    setActionLoading(null);
    if (!result.success) {
      addNotification({
        type: 'error',
        title: 'Échec de la sortie de la file',
        message: result.message || 'Échec de la sortie de la file',
        duration: 4000
      });
    }
  };
  const handleUpdateVehicleStatus = async (licensePlate: string, status: string) => {
    setActionLoading(licensePlate + status);
    const result = await updateVehicleStatus(licensePlate, status);
    setActionLoading(null);
    if (!result.success) {
      addNotification({
        type: 'error',
        title: 'Échec de la mise à jour du statut',
        message: result.message || 'Échec de la mise à jour du statut',
        duration: 4000
      });
    }
  };

  return (
    <div className="flex flex-col h-full w-full p-6 space-y-8 bg-muted">
      {/* Enhanced Header */}
      <div className="bg-card rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-3xl font-bold text-primary">Gestion de la file d'attente</h1>
              {isWebSocketConnected && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                  <Activity className="h-3 w-3 animate-pulse" />
                  <span>Live</span>
                </Badge>
              )}
            </div>
            <div className="flex items-center space-x-6">
              <p className="text-muted-foreground">Gérer les files d'attente par destination</p>
            {lastUpdated && (
              <div className="flex items-center space-x-1 text-sm text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span>Mis à jour {lastUpdated.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>
          
          <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => refreshQueues()}
            disabled={isLoading}
              className="border-gray-300 hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Actualisation...' : 'Actualiser'}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              console.log('🔄 Manual queue refresh triggered');
              refreshQueues();
            }}
            className="border-blue-300 hover:bg-blue-50 text-blue-600"
          >
            <Activity className="h-4 w-4 mr-2" />
            Test Refresh
          </Button>
            <Button 
              variant="default" 
              onClick={() => setShowAddVehicleModal(true)}
              className="bg-primary hover:bg-primary/80"
            >
              + Ajouter un véhicule à la file
            </Button>
          </div>
        </div>
      </div>

      {/* Enhanced Add Vehicle Modal */}
      <Dialog open={showAddVehicleModal} onOpenChange={setShowAddVehicleModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Ajouter un véhicule enregistré à la file d'attente</DialogTitle>
          </DialogHeader>
          <div className="mb-4">
            <Input
              placeholder="Rechercher par plaque d'immatriculation ou nom de conducteur..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border-gray-300 focus:border-blue-500"
            />
          </div>
          {vehiclesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin mr-3 h-5 w-5" />
              <span>Chargement des véhicules...</span>
            </div>
          ) : vehiclesError ? (
            <div className="text-destructive bg-destructive/10 p-3 rounded-lg">{vehiclesError}</div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y border border-gray-200 rounded-lg">
              {vehicles.filter(v => {
                const plate = (v.licensePlate || '').toUpperCase().trim();
                if (vehiclesInAnyQueue.includes(plate)) return false;
                const q = search.toLowerCase();
                return (
                  v.licensePlate?.toLowerCase().includes(q) ||
                  v.driver?.firstName?.toLowerCase().includes(q) ||
                  v.driver?.lastName?.toLowerCase().includes(q)
                );
              }).map(v => (
                <div
                  key={v.id || v.licensePlate}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted transition-colors ${selectedVehicle?.licensePlate === v.licensePlate ? 'bg-primary/10 border-l-4 border-l-primary' : ''}`}
                  onClick={() => setSelectedVehicle(v)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-accent rounded-lg">
                      <Car className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-primary">{v.licensePlate}</div>
                      <div className="text-sm text-muted-foreground">{v.driver?.firstName} {v.driver?.lastName}</div>
                    </div>
                  </div>
                  {selectedVehicle?.licensePlate === v.licensePlate && <CheckCircle className="text-green-600 h-5 w-5" />}
                </div>
              ))}
              {vehicles.filter(v => {
                const plate = (v.licensePlate || '').toUpperCase().trim();
                return !vehiclesInAnyQueue.includes(plate);
              }).length === 0 && (
                <div className="text-muted-foreground text-center py-8">
                  <Car className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p>Aucun véhicule disponible à ajouter.</p>
                </div>
              )}
            </div>
          )}
          
          {/* Destination Selection */}
          {selectedVehicle && (
            <div className="mt-4 space-y-3">
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-foreground mb-3">
                  Choisir la destination pour {selectedVehicle.licensePlate}
                </h3>
                
                {destinationsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    <span className="text-sm text-muted-foreground">Chargement des destinations...</span>
                  </div>
                ) : vehicleDestinations.length > 0 ? (
                  <div className="space-y-2">
                    {vehicleDestinations.map((dest: any) => (
                      <div
                        key={dest.stationId}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedVehicleDestination === dest.stationId 
                            ? 'border-primary bg-primary/10' 
                            : 'border-gray-200 hover:border-gray-300 hover:bg-muted'
                        }`}
                        onClick={() => setSelectedVehicleDestination(dest.stationId)}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            selectedVehicleDestination === dest.stationId 
                              ? 'border-primary bg-primary' 
                              : 'border-gray-300'
                          }`} />
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-foreground">{dest.stationName}</span>
                              {dest.isDefault && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                  Par défaut
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Priorité: {dest.priority} • Prix: {formatCurrency(dest.basePrice)}
                              {/* Show route info if available */}
                              {(() => {
                                const route = getRouteForDestination(dest.stationName);
                                return route ? (
                                  <span className="text-green-600 ml-1">✓ Route disponible</span>
                                ) : (
                                  <span className="text-orange-600 ml-1">⚠ Pas de route</span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-muted-foreground text-sm">
                      Aucune destination autorisée disponible pour ce véhicule
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {addVehicleError && (
            <div className="text-destructive text-sm mt-3 bg-destructive/10 p-3 rounded-lg border border-destructive/30">
              {addVehicleError}
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button
              onClick={async () => {
                if (!selectedVehicle || !selectedVehicleDestination) return;
                setActionLoading(selectedVehicle.licensePlate);
                setAddVehicleError(null);
                
                // Find the selected destination info
                const destinationInfo = vehicleDestinations.find(d => d.stationId === selectedVehicleDestination);
                
                console.log('🚗 Adding vehicle to queue:', {
                  licensePlate: selectedVehicle.licensePlate,
                  destinationId: selectedVehicleDestination,
                  destinationName: destinationInfo?.stationName,
                  routePrice: getBasePriceForDestination(destinationInfo?.stationName || ''),
                  destinationInfo
                });
                
                // Call handleEnterQueue with destination info
                const result = await handleEnterQueueWithDestination(
                  selectedVehicle.licensePlate, 
                  selectedVehicleDestination,
                  destinationInfo?.stationName
                );
                
                setActionLoading(null);
                if (result?.success) {
                  setShowAddVehicleModal(false);
                  setSelectedVehicle(null);
                  setSelectedVehicleDestination(null);
                  setVehicleDestinations([]);
                } else if (result?.message) {
                  setAddVehicleError(result.message);
                }
              }}
              disabled={!selectedVehicle || !selectedVehicleDestination || !!actionLoading}
              className="bg-primary hover:bg-primary/80"
            >
              {actionLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Ajouter à la file
            </Button>
            <Button variant="ghost" onClick={() => setShowAddVehicleModal(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Queue Modal */}
      <Dialog open={showChangeQueueModal} onOpenChange={setShowChangeQueueModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Changer la destination - {selectedVehicleForQueueChange?.licensePlate}
            </DialogTitle>
          </DialogHeader>
          
          {selectedVehicleForQueueChange && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Car className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-blue-900">{selectedVehicleForQueueChange.licensePlate}</div>
                    <div className="text-sm text-blue-700">
                      {selectedVehicleForQueueChange.firstName} {selectedVehicleForQueueChange.lastName}
                    </div>
                    <div className="text-xs text-blue-600">
                      Actuellement en file pour: <span className="font-medium">{selectedVehicleForQueueChange.currentDestination}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">
                  Choisir une nouvelle destination
                </h3>
                
                {changeQueueLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    <span className="text-sm text-muted-foreground">Chargement des destinations...</span>
                  </div>
                ) : changeQueueDestinations.length > 0 ? (
                  <div className="space-y-2">
                    {changeQueueDestinations.map((dest: any) => (
                      <div
                        key={dest.stationId}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedNewDestination === dest.stationId 
                            ? 'border-primary bg-primary/10' 
                            : 'border-gray-200 hover:border-gray-300 hover:bg-muted'
                        }`}
                        onClick={() => setSelectedNewDestination(dest.stationId)}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            selectedNewDestination === dest.stationId 
                              ? 'border-primary bg-primary' 
                              : 'border-gray-300'
                          }`} />
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-foreground">{dest.stationName}</span>
                              {dest.isDefault && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                  Par défaut
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Priorité: {dest.priority} • Prix: {formatCurrency(dest.basePrice)}
                              {/* Show route info if available */}
                              {(() => {
                                const route = getRouteForDestination(dest.stationName);
                                return route ? (
                                  <span className="text-green-600 ml-1">✓ Route disponible</span>
                                ) : (
                                  <span className="text-orange-600 ml-1">⚠ Pas de route</span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-muted-foreground text-sm">
                      Aucune autre destination autorisée disponible pour ce véhicule
                    </div>
                  </div>
                )}
              </div>
              
              {changeQueueError && (
                <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg border border-destructive/30">
                  {changeQueueError}
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="mt-6">
            <Button
              onClick={async () => {
                if (!selectedVehicleForQueueChange || !selectedNewDestination) return;
                
                setChangeQueueLoading(true);
                setChangeQueueError(null);
                
                // Find the selected destination info
                const destinationInfo = changeQueueDestinations.find(d => d.stationId === selectedNewDestination);
                
                console.log('🔄 Changing vehicle queue:', {
                  licensePlate: selectedVehicleForQueueChange.licensePlate,
                  from: selectedVehicleForQueueChange.currentDestination,
                  to: destinationInfo?.stationName,
                  destinationId: selectedNewDestination
                });
                
                // Call the API to change queue
                const result = await handleEnterQueueWithDestination(
                  selectedVehicleForQueueChange.licensePlate, 
                  selectedNewDestination,
                  destinationInfo?.stationName
                );
                
                setChangeQueueLoading(false);
                
                if (result?.success) {
                  setShowChangeQueueModal(false);
                  setSelectedVehicleForQueueChange(null);
                  setSelectedNewDestination(null);
                  setChangeQueueDestinations([]);
                  
                  // Refresh queues to show updated data
                  refreshQueues();
                } else if (result?.message) {
                  setChangeQueueError(result.message);
                }
              }}
              disabled={!selectedVehicleForQueueChange || !selectedNewDestination || changeQueueLoading}
              className="bg-primary hover:bg-primary/80"
            >
              {changeQueueLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
              Changer la destination
            </Button>
            <Button variant="ghost" onClick={() => setShowChangeQueueModal(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhanced Queue Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {queueSummaries.length === 0 && !isLoading ? (
          <div className="col-span-full bg-accent text-primary px-6 py-8 rounded-xl border border-accent text-center">
            <Car className="h-12 w-12 mx-auto mb-4 text-blue-400" />
            <h3 className="text-lg font-semibold mb-2">Aucune file d'attente active</h3>
            <p className="text-primary">Aucune file d'attente active pour le moment.</p>
          </div>
        ) : (
          queueSummaries.map((summary) => (
            <Card 
              key={summary.destinationId} 
              className={`cursor-pointer hover:shadow-lg transition-all duration-200 border-2 ${
                selectedDestination === summary.destinationName 
                  ? 'border-blue-500 shadow-lg bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              onClick={() => setSelectedDestination(prev => prev === summary.destinationName ? null : summary.destinationName)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-gray-900">{summary.destinationName}</CardTitle>
                  {(() => {
                    const route = getRouteForDestination(summary.destinationName);
                    return route ? (
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">{formatCurrency(route.basePrice)}</p>
                        <p className="text-xs text-muted-foreground">Prix route</p>
                      </div>
                    ) : null;
                  })()}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Car className="h-5 w-5 text-blue-600" />
                      </div>
                      <span className="text-2xl font-bold text-gray-900">{summary.totalVehicles}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Total des véhicules</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-yellow-50 rounded-lg">
                      <p className="text-lg font-semibold text-yellow-700">{summary.waitingVehicles}</p>
                      <p className="text-xs text-yellow-600">En attente</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-lg font-semibold text-blue-700">{summary.loadingVehicles}</p>
                      <p className="text-xs text-blue-600">En charge</p>
                    </div>
                  </div>
                  
                  {/* Booking Summary */}
                  {(() => {
                    const destinationQueues = queues[summary.destinationName] || [];
                    const totalSeats = destinationQueues.reduce((sum, q: any) => sum + (q.totalSeats || 0), 0);
                    const availableSeats = destinationQueues.reduce((sum, q: any) => sum + (q.availableSeats || 0), 0);
                    const bookedSeats = totalSeats - availableSeats;
                    const bookingPercentage = totalSeats > 0 ? (bookedSeats / totalSeats) * 100 : 0;
                    const fullyBookedVehicles = destinationQueues.filter((q: any) => (q.availableSeats === 0 || q.status === 'READY')).length;
                    
                    return totalSeats > 0 ? (
                      <div className="border-t pt-3 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            Réservations
                          </span>
                          <span className="font-semibold text-gray-900">
                            {bookedSeats}/{totalSeats}
                          </span>
                        </div>
                        
                        {/* Booking Progress */}
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${
                              bookingPercentage === 100 ? 'bg-red-500' : 
                              bookingPercentage > 75 ? 'bg-orange-500' : 
                              bookingPercentage > 50 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${bookingPercentage}%` }}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{Math.round(bookingPercentage)}% réservé</span>
                          {fullyBookedVehicles > 0 && (
                            <span className="text-red-600 font-medium">
                              {fullyBookedVehicles} complet{fullyBookedVehicles > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Enhanced Loading indicator */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-gray-600">Chargement des données de la file...</p>
          </div>
        </div>
      )}

      {/* Enhanced Error display */}
      {error && (
        <div className="bg-red-50 text-red-700 px-6 py-4 rounded-xl border border-red-200">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="font-medium">Erreur:</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Enhanced Destination Queue Lists */}
      <div className="space-y-8">
        {queueSummaries.length === 0 && !isLoading ? (
          <div className="bg-blue-50 text-blue-700 px-6 py-8 rounded-xl border border-blue-200 text-center">
            <Car className="h-12 w-12 mx-auto mb-4 text-blue-400" />
            <h3 className="text-lg font-semibold mb-2">Aucune file d'attente active</h3>
            <p className="text-blue-600">Aucune file d'attente active pour le moment.</p>
          </div>
        ) : (
          <>
            {(selectedDestination ? [normalizeDestinationName(selectedDestination)] : destinations).map((destination) => {
              const summary = queueSummaries.find(s => normalizeDestinationName(s.destinationName) === destination);
              const destinationQueues = queues[destination] || [];
              
              return (
                <div key={destination} className="bg-card rounded-xl p-6 shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center space-x-3">
                      <h2 className="text-2xl dark:text-white font-bold text-gray-900">{destination}</h2>
                    {isWebSocketConnected && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                        <Activity className="h-3 w-3 animate-pulse" />
                        <span>Live</span>
                      </Badge>
                      )}
                    </div>
                    {summary && (
                      <div className="text-right">
                        <p className="text-sm dark:text-white text-gray-500">Total des véhicules</p>
                        <p className="text-2xl font-bold dark:text-white text-gray-900">{summary.totalVehicles}</p>
                      </div>
                    )}
                  </div>
                  
                  {summary && summary.totalVehicles > 0 ? (
                    destinationQueues.length > 0 ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEnd(event, destination)}
                      >
                        <SortableContext
                          items={destinationQueues.map(q => q.id) || []}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-3">
                            {destinationQueues.map((queue) => (
                                                              <SortableQueueItem
                                  key={queue.id}
                                  queue={queue}
                                  getStatusColor={getStatusColor}
                                  formatTime={formatTime}
                                  getBasePriceForDestination={getBasePriceForDestination}
                                  onVehicleClick={handleVehicleClick}
                                />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="bg-yellow-50 text-yellow-700 px-6 py-8 rounded-xl border border-yellow-200 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin mr-3" />
                        <span>Chargement des détails du véhicule pour {destination}...</span>
                      </div>
                    )
                  ) : (
                    <div className="bg-blue-50 text-blue-700 px-6 py-8 rounded-xl border border-blue-200 text-center">
                      <Car className="h-12 w-12 mx-auto mb-4 text-blue-400" />
                      <h3 className="text-lg font-semibold mb-2">Aucun véhicule dans la file</h3>
                      <p className="text-blue-600">Aucun véhicule actuellement dans la file pour {destination}.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
} 