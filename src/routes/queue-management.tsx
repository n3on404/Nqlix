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
  TrendingUp,
  X,
  MapPin,
  ArrowUp,
  Move,
  
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
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
import { usePaymentNotifications } from "../components/NotificationToast";
// TODO: Replace with MQTT integration
import { thermalPrinter } from "../services/thermalPrinterService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import api from "../lib/api";
import { useAuth } from "../context/AuthProvider";
import { dbClient } from "../services/dbClient";
import React from "react";

// Sortable queue item component
interface SortableQueueItemProps {
  queue: any;
  getStatusColor: (status: string) => string;
  formatTime: (dateString: string) => string;
  getBasePriceForDestination: (destinationName: string) => number | undefined;
  onVehicleClick: (vehicle: any) => void;
  onExitQueue: (licensePlate: string) => void;
  onEndTrip: (queueId: string, licensePlate: string, availableSeats: number, totalSeats: number) => void;
  onMoveToFront: (queueId: string, destinationId: string) => void;
  actionLoading: string | null;
}

function SortableQueueItem({ queue, getStatusColor, formatTime, getBasePriceForDestination, onVehicleClick, onExitQueue, onEndTrip, onMoveToFront, actionLoading }: SortableQueueItemProps) {
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
      className={`bg-white border-2 rounded-lg p-4 transition-all ${
        queue.status === 'WAITING' ? 'border-yellow-300' :
        queue.status === 'LOADING' ? 'border-blue-300' :
        queue.status === 'READY' ? 'border-green-300' :
        'border-gray-200'
      } ${isDragging ? 'opacity-70 shadow-lg' : 'hover:shadow-md'}`}
    >
      <div className="flex items-center justify-between">
        {/* Left: Position and Vehicle Info */}
        <div className="flex items-center gap-4 flex-1">
          {/* Position */}
          <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
            {queue.queuePosition}
          </div>
          
          {/* Vehicle Info */}
          <div 
            className="flex items-center gap-3 flex-1 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors"
            onClick={() => onVehicleClick({ 
              licensePlate: queue.licensePlate,
              // cin removed - no longer supported without driver table
              currentDestination: queue.destinationName, 
              currentDestinationId: queue.destinationId,
              queueId: queue.id 
            })}
          >
            <Car className="h-5 w-5 text-gray-600" />
            <div>
              <div className="font-semibold text-gray-900">{queue.licensePlate}</div>
                <div className="text-sm text-gray-600">Véhicule: {queue.vehicle?.licensePlate}</div>
            </div>
          </div>
        </div>
        
        {/* Center: Status and Seats */}
        <div className="flex items-center gap-6">
          {/* Status */}
          <div className="text-center">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              queue.status === 'WAITING' ? 'bg-yellow-100 text-yellow-800' :
              queue.status === 'LOADING' ? 'bg-blue-100 text-blue-800' :
              queue.status === 'READY' ? 'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {queue.status === 'WAITING' ? 'En attente' :
               queue.status === 'LOADING' ? 'En charge' :
               queue.status === 'READY' ? 'Prêt' : queue.status}
            </div>
          </div>
          
          {/* Seats */}
          <div className="text-center">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-gray-600" />
              <span className="font-medium text-gray-900">{queue.availableSeats}/{queue.totalSeats}</span>
            </div>
            <div className="text-xs text-gray-600">places</div>
          </div>
          
          {/* Price */}
          <div className="text-center">
            <div className="font-semibold text-gray-900">{formatCurrency(basePrice)}</div>
            <div className="text-xs text-gray-600">prix</div>
          </div>
        </div>
        
        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Move to Front Button */}
          <Button 
            variant="outline" 
            size="sm"
            className="text-purple-600 border-purple-300 hover:bg-purple-50"
            onClick={(e) => {
              e.stopPropagation();
              onMoveToFront(queue.id, queue.destinationId);
            }}
            disabled={actionLoading === queue.licensePlate || queue.status !== 'WAITING'}
            title="Déplacer en première position"
          >
            {actionLoading === queue.licensePlate ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>

          {/* End Trip Button - only show if vehicle has booked seats */}
          {queue.availableSeats < queue.totalSeats && (
            <Button 
              variant="outline" 
              size="sm"
              className="text-green-600 border-green-300 hover:bg-green-50"
              onClick={(e) => {
                e.stopPropagation();
                onEndTrip(queue.id, queue.licensePlate, queue.availableSeats, queue.totalSeats);
              }}
              disabled={actionLoading === queue.licensePlate}
              title={`Terminer le voyage avec ${queue.totalSeats - queue.availableSeats} sièges occupés`}
            >
              {actionLoading === queue.licensePlate ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            className="text-red-600 border-red-300 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              onExitQueue(queue.licensePlate);
            }}
            disabled={actionLoading === queue.licensePlate || queue.status !== 'WAITING'}
          >
            {actionLoading === queue.licensePlate ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            className="text-blue-600 border-blue-300 hover:bg-blue-50"
            disabled={queue.status !== 'WAITING'}
            onClick={() => onVehicleClick({ 
              licensePlate: queue.licensePlate,
              // cin removed - no longer supported without driver table
              currentDestination: queue.destinationName, 
              currentDestinationId: queue.destinationId,
              queueId: queue.id 
            })}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
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
    isConnected,
    enterQueue,
    exitQueue,
    updateVehicleStatus,
    beginOptimisticSuppression,
  } = useQueue();
  const { addNotification } = useNotifications();
  const { currentStaff } = useAuth();
  const { 
    notifyPaymentSuccess, 
    notifyPaymentFailed, 
    notifySeatUpdate, 
    notifyVehicleReady 
  } = usePaymentNotifications();
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // vehicle id or action
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTimeout, setRefreshTimeout] = useState<NodeJS.Timeout | null>(null);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  // Debounced refresh function to prevent multiple simultaneous refreshes
  const debouncedRefreshQueues = useCallback(() => {
    // Clear any existing timeout
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }

    // If already refreshing, skip this refresh
    if (isRefreshing) {
      console.log('🔄 Refresh already in progress, skipping...');
      return;
    }

    // Set refreshing state
    setIsRefreshing(true);
    console.log('🔄 Starting debounced refresh...');

    // Execute lightweight refresh (summaries only) via QueueProvider.refreshQueues
    refreshQueues();
    setLastUpdated(new Date());

    // Clear refreshing state after a short delay
    const timeout = setTimeout(() => {
      setIsRefreshing(false);
      console.log('✅ Refresh completed');
    }, 1000);

    setRefreshTimeout(timeout);
  }, [refreshQueues, isRefreshing, refreshTimeout]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [addVehicleError, setAddVehicleError] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
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

  // Day pass state
  const [showDayPassModal, setShowDayPassModal] = useState(false);
  const [dayPassLoading, setDayPassLoading] = useState(false);
  const [dayPassError, setDayPassError] = useState<string | null>(null);
  const [dayPassPrice, setDayPassPrice] = useState<number>(0);

  // Filter state
  const [governments, setGovernments] = useState<any[]>([]);
  const [selectedGovernment, setSelectedGovernment] = useState<string>('');
  const [selectedDelegation, setSelectedDelegation] = useState<string>('');
  const [availableDelegations, setAvailableDelegations] = useState<any[]>([]);

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

  // Auto-fetch detailed queue data for destinations that have vehicles but no detailed data
  useEffect(() => {
    if (queueSummaries.length > 0 && !isLoading) {
      console.log('🔍 Checking for destinations needing detailed data fetch...');
      queueSummaries.forEach(summary => {
        const normalizedDestination = normalizeDestinationName(summary.destinationName);
        const destinationQueues = queues[normalizedDestination] || [];

        console.log(`📊 ${normalizedDestination}: Summary shows ${summary.totalVehicles} vehicles, detailed data has ${destinationQueues.length} items`);

        // If summary shows vehicles but we don't have detailed data, fetch it
        if (summary.totalVehicles > 0 && destinationQueues.length === 0) {
          console.log(`🔍 Auto-fetching detailed data for ${normalizedDestination} (ID: ${summary.destinationId})`);
          fetchQueueForDestination(summary.destinationId);
        }
      });
    }
  }, [queueSummaries, queues, isLoading, fetchQueueForDestination]);

  // Fetch queues with filters when filters change
  useEffect(() => {
    const fetchQueuesWithFilters = async () => {
      try {
        const filters: { governorate?: string; delegation?: string } = {};
        if (selectedGovernment) filters.governorate = selectedGovernment;
        if (selectedDelegation) filters.delegation = selectedDelegation;
        
        console.log('🔄 Fetching queues with filters:', filters);
        const response = await api.getAvailableQueues(filters);
        
        if (response.success && response.data) {
          console.log('✅ Filtered queues loaded:', response.data);
          // Update the queue summaries with filtered data
          // Note: This would need to be integrated with the QueueProvider context
          // For now, we'll just log the filtered results
        }
      } catch (error) {
        console.error('❌ Error fetching filtered queues:', error);
      }
    };

    fetchQueuesWithFilters();
  }, [selectedGovernment, selectedDelegation]);

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
      const data = await dbClient.getVehicleAuthorizedDestinations(licensePlate);
      console.log('🎯 Vehicle authorized destinations loaded:', data);
      const mapped = (data || []).map(d => ({
        stationId: d.stationId,
        stationName: d.stationName,
        basePrice: d.basePrice,
        isDefault: d.isDefault,
        priority: d.priority,
      }));
      setVehicleDestinations(mapped);
      const def = mapped.find(d => d.isDefault) || null;
      setDefaultDestination(def);
      if (def) {
        setSelectedVehicleDestination(def.stationId);
        console.log('✅ Auto-selected default destination:', def.stationName);
      } else if (mapped.length > 0) {
        setSelectedVehicleDestination(mapped[0].stationId);
        console.log('✅ Auto-selected first destination:', mapped[0].stationName);
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
      const data = await dbClient.getVehicleAuthorizedDestinations(licensePlate);
      console.log('🔄 Authorized destinations:', data);
      const all = (data || []).map(d => ({
        stationId: d.stationId,
        stationName: d.stationName,
        basePrice: d.basePrice,
        isDefault: d.isDefault,
        priority: d.priority,
      }));
      const availableDestinations = all.filter(dest => dest.stationId !== currentDestinationId);
        setChangeQueueDestinations(availableDestinations);
        if (availableDestinations.length > 0) {
          setSelectedNewDestination(availableDestinations[0].stationId);
          console.log('✅ Auto-selected first available destination for queue change:', availableDestinations[0].stationName);
        } else {
          console.log('⚠️ No available destinations after filtering');
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

  // MQTT removed for DB-direct flow

  // Periodic refresh (light) instead of MQTT
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      // Only run a light refresh cadence; details are fetched on demand
      debouncedRefreshQueues();
    }, 20000);
    return () => clearInterval(refreshInterval);
  }, [debouncedRefreshQueues]);

  // MQTT connection is handled automatically by useMQTT hook
  // No need for manual connection management

  // Remove aggressive per-interaction refresh to reduce churn

  // Update lastUpdated timestamp when queues change
  useEffect(() => {
    setLastUpdated(new Date());
  }, [queues]);

  useEffect(() => {
    const t = setInterval(() => {
      dbClient.health().then(setDbOk).catch(() => setDbOk(false));
    }, 15000);
    return () => clearInterval(t);
  }, []);

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

  // Fetch vehicles when modal opens - using direct database access
  useEffect(() => {
    if (showAddVehicleModal) {
      setVehiclesLoading(true);
      setVehiclesError(null);
      
      const fetchVehiclesFromDB = async () => {
        try {
          console.log('🚗 [VEHICLE DEBUG] Fetching vehicles from database...');
          const vehiclesData = await dbClient.getAllVehicles();
          console.log('🚗 [VEHICLE DEBUG] Vehicles data from DB:', vehiclesData);
          
          if (Array.isArray(vehiclesData)) {
            // Batch check day pass for faster resolution
            const plates = vehiclesData.map((v: any) => v.licensePlate).filter(Boolean);
            // Set initial list with loading state
            setVehicles(vehiclesData.map((v: any) => ({ ...v, dayPassValid: undefined })));
            try {
              const map = await dbClient.hasDayPassTodayBatch(plates);
              setVehicles((prev: any[]) => prev.map((v: any) => ({
                ...v,
                dayPassValid: map?.[v.licensePlate] ?? false,
              })));
            } catch (e) {
              // Fallback: sequential checks
              const vehiclesWithDayPassStatus = await Promise.all(
                vehiclesData.map(async (vehicle: any) => {
                  try {
                    const has = await dbClient.hasDayPassToday(vehicle.licensePlate);
                    return { ...vehicle, dayPassValid: has };
                  } catch {
                    return { ...vehicle, dayPassValid: false };
                  }
                })
              );
              setVehicles(vehiclesWithDayPassStatus);
            }
          } else {
            console.error('🚗 [VEHICLE DEBUG] Vehicles data is not an array:', vehiclesData);
            setVehiclesError("Format de données de véhicules invalide");
          }
        } catch (error: any) {
          console.error('🚗 [VEHICLE DEBUG] Database call error:', error);
          setVehiclesError("Échec de la récupération des véhicules depuis la base de données");
        } finally {
          setVehiclesLoading(false);
        }
      };
      
      fetchVehiclesFromDB();
    }
  }, [showAddVehicleModal]);

  // When modal opens, clear error and reset focus state
  useEffect(() => {
    if (showAddVehicleModal) {
      setAddVehicleError(null);
      setIsInputFocused(false);
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

  // Fetch all routes on mount - using direct database access
  useEffect(() => {
    const fetchRoutesFromDB = async () => {
      try {
        console.log('📍 Fetching routes from database...');
        const routesData = await dbClient.getAvailableDestinations();
        console.log('📍 Routes loaded from DB:', routesData);
        setRoutes(routesData);
      } catch (error) {
        console.error('❌ Error loading routes from database:', error);
        setRoutes([]);
      }
    };
    
    fetchRoutesFromDB();
  }, []);

  // Fetch governments for filtering
  const fetchGovernments = async () => {
    try {
      const response = await api.getAllLocations();
      if (response.success && response.data) {
        console.log('🏛️ Governments loaded:', response.data);
        setGovernments(response.data);
      } else {
        console.warn('⚠️ Failed to load governments:', response);
        setGovernments([]);
      }
    } catch (error) {
      console.error('❌ Error loading governments:', error);
      setGovernments([]);
    }
  };

  // Handle government change
  const handleGovernmentChange = (government: string) => {
    setSelectedGovernment(government);
    setSelectedDelegation('');
    
    if (government) {
      const selectedGov = governments.find(g => g.name === government);
      setAvailableDelegations(selectedGov?.delegations || []);
    } else {
      setAvailableDelegations([]);
    }
  };

  // Handle delegation change
  const handleDelegationChange = (delegation: string) => {
    setSelectedDelegation(delegation);
  };

  // Clear filters
  const clearFilters = () => {
    setSelectedGovernment('');
    setSelectedDelegation('');
    setAvailableDelegations([]);
  };

  // Check if vehicle has valid day pass
  const checkDayPassStatus = async (licensePlate: string) => {
    try {
      const response = await api.get(`/api/day-pass/status-by-license/${licensePlate}`);
      console.log('Day pass status response for', licensePlate, ':', response);
      return response.success && (response.data as any)?.hasValidPass;
    } catch (error) {
      console.error('Error checking day pass status:', error);
      return false;
    }
  };

  // Purchase day pass for vehicle using direct database access
  const purchaseDayPass = async (licensePlate: string) => {
    console.log('🎫 [DAY PASS DEBUG] Starting day pass purchase for:', licensePlate);
    setDayPassLoading(true);
    setDayPassError(null);
    
    try {
      // Find the selected vehicle to get vehicleId
      const vehicle = selectedVehicle;
      console.log('🎫 [DAY PASS DEBUG] Vehicle data for day pass purchase:', {
        vehicle,
        hasId: !!vehicle?.id
      });
      
      if (!vehicle) {
        console.log('❌ [DAY PASS DEBUG] No vehicle selected');
        setDayPassError('Aucun véhicule sélectionné');
        return { success: false, message: 'Aucun véhicule sélectionné' };
      }
      
      if (!vehicle.id) {
        console.log('❌ [DAY PASS DEBUG] Vehicle ID missing');
        setDayPassError('ID du véhicule manquant');
        return { success: false, message: 'ID du véhicule manquant' };
      }

      console.log('🎫 [DAY PASS DEBUG] Making database call to purchase day pass...');
      const staffId = currentStaff?.id || undefined;
      const result = await dbClient.purchaseDayPass(licensePlate, vehicle.id, dayPassPrice, staffId);
      console.log('🎫 [DAY PASS DEBUG] Database response:', result);
      
      console.log('✅ [DAY PASS DEBUG] Day pass purchase successful');
      addNotification({
        type: 'success',
        title: 'Pass journalier acheté',
        message: result,
        duration: 4000
      });
      
      // Update UI state
      setSelectedVehicle((prev: any) => prev && prev.licensePlate === licensePlate ? { ...prev, dayPassValid: true } : prev);
      setVehicles((prev: any[]) => prev.map((v: any) => v.licensePlate === licensePlate ? { ...v, dayPassValid: true } : v));
      
      // Refresh destinations available for this vehicle
      try {
        await fetchVehicleDestinations(licensePlate);
      } catch {}
      
      // Refresh queue summaries in background
      try { debouncedRefreshQueues(); } catch {}
      
      console.log('✅ [DAY PASS DEBUG] Day pass purchase completed successfully');
      return { success: true };
    } catch (error: any) {
      console.error('❌ [DAY PASS DEBUG] Error purchasing day pass:', error);
      const errorMessage = error.message || 'Erreur lors de l\'achat du pass journalier';
      
      // Check if the error is because day pass already exists
      if (errorMessage.includes('déjà un pass journalier valide')) {
        console.log('ℹ️ [DAY PASS DEBUG] Day pass already exists');
        addNotification({
          type: 'info',
          title: 'Pass journalier déjà valide',
          message: `Le véhicule a déjà un pass journalier valide pour aujourd'hui`,
          duration: 4000
        });
        return { success: true }; // Treat as success since day pass is valid
      } else {
        setDayPassError(errorMessage);
        return { success: false, message: errorMessage };
      }
    } finally {
      console.log('🎫 [DAY PASS DEBUG] Day pass purchase process completed');
      setDayPassLoading(false);
    }
  };

  // Get day pass price using direct database access
  const getDayPassPrice = async () => {
    try {
      const price = await dbClient.getDayPassPrice();
      setDayPassPrice(price);
    } catch (error) {
      console.error('Error fetching day pass price:', error);
      setDayPassPrice(2.0); // Default day pass price
    }
  };

  // Handle adding vehicle to queue (extracted for keyboard shortcuts)
  const handleAddVehicleToQueue = async () => {
    console.log('🚗 [QUEUE DEBUG] Starting vehicle entry process...');
    console.log('🚗 [QUEUE DEBUG] Selected vehicle:', selectedVehicle);
    console.log('🚗 [QUEUE DEBUG] Selected destination:', selectedVehicleDestination);
    
    if (!selectedVehicle || !selectedVehicleDestination) {
      console.log('❌ [QUEUE DEBUG] Missing vehicle or destination');
      return;
    }
    
    setActionLoading(selectedVehicle.licensePlate);
    setAddVehicleError(null);
    
    try {
      // Check day pass status and handle day pass purchase in parallel with queue entry
      console.log('🚗 [QUEUE DEBUG] Checking day pass status for:', selectedVehicle.licensePlate);
      
      const [hasDayPass, destinationInfo] = await Promise.all([
        // Check day pass status
        dbClient.hasDayPassToday(selectedVehicle.licensePlate).catch(() => 
          checkDayPassStatus(selectedVehicle.licensePlate)
        ),
        // Get destination info
        Promise.resolve(vehicleDestinations.find(d => d.stationId === selectedVehicleDestination))
      ]);
      
      console.log('🚗 [QUEUE DEBUG] Day pass status:', hasDayPass);
      console.log('🚗 [QUEUE DEBUG] Destination info:', destinationInfo);
      
      // Handle day pass purchase if needed (non-blocking)
      if (!hasDayPass) {
        console.log('🚗 [QUEUE DEBUG] Vehicle has no day pass, purchasing...');
        try {
          await getDayPassPrice();
          const dayPassResult = await purchaseDayPass(selectedVehicle.licensePlate);
          
          if (!dayPassResult.success) {
            throw new Error(dayPassResult.message || 'Erreur lors de l\'achat du pass journalier');
          }
          
          // Update UI state
          setSelectedVehicle((prev: any) => prev && prev.licensePlate === selectedVehicle.licensePlate ? { ...prev, dayPassValid: true } : prev);
          setVehicles((prev: any[]) => prev.map((v: any) => v.licensePlate === selectedVehicle.licensePlate ? { ...v, dayPassValid: true } : v));
          console.log('✅ [QUEUE DEBUG] Day pass purchased successfully');
        } catch (error) {
          console.error('❌ [QUEUE DEBUG] Day pass purchase failed:', error);
          throw error;
        }
      }
      
      // Proceed with queue entry using direct database access
      console.log('🚗 [QUEUE DEBUG] Adding vehicle to queue...');
      const result = await dbClient.addVehicleToQueue(
        selectedVehicle.licensePlate, 
        selectedVehicleDestination,
        destinationInfo?.stationName
      );
      
      if (result) {
        console.log('✅ [QUEUE DEBUG] Vehicle successfully added to queue:', result);
        addNotification({
          type: 'success',
          title: 'Véhicule ajouté',
          message: result,
          duration: 4000
        });
        setShowAddVehicleModal(false);
        setSelectedVehicle(null);
        setSelectedVehicleDestination(null);
        setVehicleDestinations([]);
        setSearch("");
        setIsInputFocused(false);
        
        // Refresh queue data
        debouncedRefreshQueues();
      } else {
        throw new Error('Échec de l\'entrée en file');
      }
    } catch (error: any) {
      console.error('❌ [QUEUE DEBUG] Vehicle addition failed:', error);
      setAddVehicleError(error.message || 'Erreur lors de l\'ajout du véhicule');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle day pass purchase (extracted for keyboard shortcuts)
  const handleDayPassPurchase = async () => {
    if (!selectedVehicle) return;
    
    console.log('Selected vehicle for day pass purchase:', selectedVehicle);
    const result = await purchaseDayPass(selectedVehicle.licensePlate);
    
    if (result.success) {
      setShowDayPassModal(false);
      setDayPassError(null);
      
      // Now proceed with adding to queue
      setActionLoading(selectedVehicle.licensePlate);
      setAddVehicleError(null);
      
      const destinationInfo = vehicleDestinations.find(d => d.stationId === selectedVehicleDestination);
      
      const queueResult = await dbClient.addVehicleToQueue(
        selectedVehicle.licensePlate, 
        selectedVehicleDestination!,
        destinationInfo?.stationName
      );
      
      setActionLoading(null);
      if (queueResult) {
        addNotification({
          type: 'success',
          title: 'Véhicule ajouté',
          message: queueResult,
          duration: 4000
        });
        setShowAddVehicleModal(false);
        setSelectedVehicle(null);
        setSelectedVehicleDestination(null);
        setVehicleDestinations([]);
        setSearch("");
        setIsInputFocused(false);
        
        // Refresh queue data
        debouncedRefreshQueues();
      } else {
        setAddVehicleError('Échec de l\'entrée en file');
      }
    }
  };

  // Fetch governments on mount
  useEffect(() => {
    fetchGovernments();
  }, []);

  // Keyboard shortcuts and navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      
      // Handle Alt key to toggle between input focus and vehicle selection
      if (event.key === 'Alt' && showAddVehicleModal) {
        event.preventDefault();
        
        if (isInputFocused) {
          // Currently in input focus, switch to vehicle selection
          const allQueueItems = Object.values(queues).flat();
          const vehiclesInQueue = allQueueItems.map((q: any) => {
            return (q.licensePlate || "").toUpperCase().trim();
          });
          
          // Move focus to the first vehicle in the list
          const firstVehicle = vehicles.find(v => {
            const plate = (v.licensePlate || '').toUpperCase().trim();
            return !vehiclesInQueue.includes(plate);
          });
          if (firstVehicle) {
            setSelectedVehicle(firstVehicle);
          }
          setIsInputFocused(false);
        } else {
          // Currently in vehicle selection, switch to input focus
          setIsInputFocused(true);
          // Focus the input element
          setTimeout(() => {
            const inputElement = document.querySelector('input[placeholder*="Rechercher"]') as HTMLInputElement;
            if (inputElement) {
              inputElement.focus();
            }
          }, 0);
        }
        return;
      }
      
      // Don't trigger other shortcuts when typing in inputs (except Alt)
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[contenteditable]')
      ) {
        return;
      }

      // Open modal with Ctrl+N or F6
      if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        setShowAddVehicleModal(true);
      }
      
      if (event.key === 'F6') {
        event.preventDefault();
        setShowAddVehicleModal(true);
      }

      // Vehicle selection navigation (only when modal is open)
      if (showAddVehicleModal && vehicles.length > 0) {
        const currentIndex = selectedVehicle ? vehicles.findIndex(v => v.licensePlate === selectedVehicle.licensePlate) : -1;
        
        // Arrow keys or W/S for navigation
        if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
          event.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : vehicles.length - 1;
          setSelectedVehicle(vehicles[prevIndex]);
        }
        
        if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
          event.preventDefault();
          const nextIndex = currentIndex < vehicles.length - 1 ? currentIndex + 1 : 0;
          setSelectedVehicle(vehicles[nextIndex]);
        }
        
        // Space to select vehicle or confirm day pass purchase
        if (event.code === 'Space') {
          event.preventDefault();
          
          if (selectedVehicle && !selectedVehicleDestination) {
            // Vehicle is selected but no destination - this shouldn't happen in normal flow
            return;
          }
          
          if (selectedVehicle && selectedVehicleDestination) {
            // Both vehicle and destination selected - proceed with adding to queue
            handleAddVehicleToQueue();
          }
        }
      }

      // Day pass modal navigation and confirmation
      if (showDayPassModal && selectedVehicle) {
        // Space to confirm day pass purchase
        if (event.code === 'Space') {
          event.preventDefault();
          handleDayPassPurchase();
        }
        
        // Escape to cancel
        if (event.key === 'Escape') {
          event.preventDefault();
          setShowDayPassModal(false);
          setDayPassError(null);
        }
      }

      // Escape to close modals
      if (event.key === 'Escape') {
        if (showAddVehicleModal) {
          setShowAddVehicleModal(false);
          setSelectedVehicle(null);
          setSelectedVehicleDestination(null);
          setVehicleDestinations([]);
          setAddVehicleError(null);
          setSearch("");
        }
        if (showChangeQueueModal) {
          setShowChangeQueueModal(false);
          setSelectedVehicleForQueueChange(null);
          setSelectedNewDestination(null);
          setChangeQueueDestinations([]);
          setChangeQueueError(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddVehicleModal, showDayPassModal, vehicles, selectedVehicle, selectedVehicleDestination, showChangeQueueModal, queues, isInputFocused]);

  // Aggregate status counts across all destinations (for header summary)
  const aggregateStatusCounts = () => {
    const allItems: any[] = Object.values(queues).flat() as any[];
    const waiting = allItems.filter((q: any) => q.status === 'WAITING').length;
    const loading = allItems.filter((q: any) => q.status === 'LOADING').length;
    const ready = allItems.filter((q: any) => q.status === 'READY').length;
    const total = allItems.length;
    return { waiting, loading, ready, total };
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );


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
      // Prevent duplicate clicks
      setActionLoading(licensePlate);
      try { beginOptimisticSuppression({ licensePlate, durationMs: 2500 }); } catch {}
      
      // Enter queue
      await dbClient.enterQueueWithDestination(licensePlate, destinationId, destinationName);
      
      // Show success notification
      addNotification({
        type: 'success',
        title: 'Véhicule ajouté',
        message: `${licensePlate} ajouté à la file pour ${destinationName || 'la destination sélectionnée'}`,
        duration: 4000
      });

      // Update selected destination
      try {
        const summary = queueSummaries.find(s => s.destinationId === destinationId);
        if (summary) setSelectedDestination(summary.destinationName);
      } catch {}

      // Single refresh call instead of multiple attempts
      await fetchQueueForDestination(destinationId);
      
      setActionLoading(null);
      return { success: true };
    } catch (error: any) {
      console.error('Error entering queue with destination:', error);
      setActionLoading(null);
      addNotification({
        type: 'error',
        title: 'Échec de l\'entrée en file',
        message: error?.message || 'Échec de l\'entrée en file',
        duration: 4000
      });
      return { success: false, message: error?.message || 'Échec de l\'entrée en file' };
    }
  };
  const handleExitQueue = async (licensePlate: string) => {
    // Show confirmation dialog
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir retirer le véhicule ${licensePlate} de la file d'attente ?\n\nCette action supprimera également toutes les réservations associées.`
    );
    
    if (!confirmed) return;
    
    setActionLoading(licensePlate);
    try { beginOptimisticSuppression({ licensePlate, durationMs: 2500 }); } catch {}
    
    try {
      const result = await dbClient.removeVehicleFromQueue(licensePlate);
      setActionLoading(null);
      
      addNotification({
        type: 'success',
        title: 'Véhicule retiré',
        message: result,
        duration: 4000
      });
      
      // Refresh queue data
      debouncedRefreshQueues();
    } catch (error: any) {
      setActionLoading(null);
      addNotification({
        type: 'error',
        title: 'Échec de la sortie de la file',
        message: error?.message || 'Échec de la sortie de la file',
        duration: 4000
      });
    }
  };

  const handleEndTrip = async (queueId: string, licensePlate: string, availableSeats: number, totalSeats: number) => {
    const bookedSeats = totalSeats - availableSeats;
    
    // Show confirmation dialog with pricing info
    const confirmed = window.confirm(
      `Terminer le voyage pour ${licensePlate} ?\n\n` +
      `Sièges occupés: ${bookedSeats}/${totalSeats}\n` +
      `Sièges libres: ${availableSeats}\n\n` +
      `Cette action va:\n` +
      `• Imprimer le ticket de sortie\n` +
      `• Calculer le prix basé sur les sièges occupés\n` +
      `• Retirer le véhicule de la file d'attente`
    );
    
    if (!confirmed) return;
    
    setActionLoading(licensePlate);
    try { beginOptimisticSuppression({ licensePlate, durationMs: 2500 }); } catch {}
    
    try {
      const staffId = currentStaff?.id || undefined;
      const result = await dbClient.endTripWithPartialCapacity(queueId, staffId);
      setActionLoading(null);
      
      addNotification({
        type: 'success',
        title: 'Voyage terminé',
        message: result,
        duration: 5000
      });
      
      // Refresh the queue to show updated data
      debouncedRefreshQueues();
    } catch (error: any) {
      setActionLoading(null);
      addNotification({
        type: 'error',
        title: 'Échec de la fin du voyage',
        message: error?.message || 'Échec de la fin du voyage',
        duration: 4000
      });
    }
  };

  const handleMoveToFront = async (queueId: string, destinationId: string) => {
    setActionLoading(queueId);
    
    try {
      const result = await dbClient.moveVehicleToFront(queueId, destinationId);
      
      addNotification({
        type: 'success',
        title: 'Véhicule déplacé',
        message: 'Le véhicule a été déplacé en première position',
        duration: 3000
      });
      
      // Refresh the queue to show updated order
      debouncedRefreshQueues();
    } catch (error: any) {
      addNotification({
        type: 'error',
        title: 'Échec du déplacement',
        message: error?.message || 'Échec du déplacement du véhicule',
        duration: 4000
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    
    if (!active || !over || active.id === over.id) {
      setIsReordering(false);
      return;
    }

    const destinationName = selectedDestination;
    if (!destinationName) return;

    const destinationQueues = queues[destinationName] || [];
    const oldIndex = destinationQueues.findIndex((item: any) => item.id === active.id);
    const newIndex = destinationQueues.findIndex((item: any) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      setIsReordering(false);
      return;
    }

    // Get the actual destination ID from the queue summaries
    console.log('🔍 [DRAG DEBUG] Available queue summaries:', queueSummaries);
    console.log('🔍 [DRAG DEBUG] Looking for destination name:', destinationName);
    console.log('🔍 [DRAG DEBUG] Destination queues:', destinationQueues);
    
    const summary = queueSummaries.find(s => s.destinationName === destinationName);
    console.log('🔍 [DRAG DEBUG] Found summary:', summary);
    
    // Try to get destination ID from summary first, then from queue items
    let destinationId = summary?.destinationId;
    
    // Fallback: try to get destination ID from queue items if they have it
    if (!destinationId && destinationQueues.length > 0) {
      const firstItem = destinationQueues[0] as any;
      if (firstItem.destinationId) {
        destinationId = firstItem.destinationId;
        console.log('🔍 [DRAG DEBUG] Got destination ID from queue item:', destinationId);
      }
    }
    
    if (!destinationId) {
      console.error('❌ [DRAG DEBUG] No destination ID found for destination:', destinationName);
      console.error('❌ [DRAG DEBUG] Available summaries:', queueSummaries.map(s => ({ name: s.destinationName, id: s.destinationId })));
      console.error('❌ [DRAG DEBUG] First queue item:', destinationQueues[0]);
      setIsReordering(false);
      return;
    }
    
    console.log('✅ [DRAG DEBUG] Using destination ID:', destinationId);

    // Create new order
    const newOrder = [...destinationQueues];
    const [movedItem] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, movedItem);

    // Update positions
    const vehiclePositions = newOrder.map((item: any, index: number) => ({
      queueId: item.id,
      position: index + 1
    }));

    try {
      console.log('🔄 [FRONTEND DEBUG] Updating queue positions:', {
        destinationId,
        vehiclePositions,
        destinationName
      });
      
      await dbClient.updateQueuePositions(destinationId, vehiclePositions);
      
      addNotification({
        type: 'success',
        title: 'Ordre mis à jour',
        message: 'L\'ordre des véhicules a été mis à jour',
        duration: 2000
      });
      
      // Refresh the queue to show updated order
      debouncedRefreshQueues();
    } catch (error: any) {
      addNotification({
        type: 'error',
        title: 'Échec de la mise à jour',
        message: error?.message || 'Échec de la mise à jour de l\'ordre',
        duration: 4000
      });
    } finally {
      setIsReordering(false);
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
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestion des Files</h1>
            <p className="text-sm text-gray-600 mt-1">Ajouter ou retirer des véhicules des files d'attente</p>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
              <div className={`w-2 h-2 rounded-full ${dbOk === false ? 'bg-red-500' : 'bg-green-500'}`}></div>
              <span>DB {dbOk === false ? 'Fail' : 'OK'}</span>
              <span>•</span>
              <span>Dernière mise à jour: {lastUpdated?.toLocaleTimeString() || 'Jamais'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                console.log('🔄 Manual refresh triggered');
                debouncedRefreshQueues();
                if (selectedDestination) {
                  const summary = queueSummaries.find(s => s.destinationName === selectedDestination);
                  if (summary) {
                    fetchQueueForDestination(summary.destinationId);
                  }
                }
              }}
              disabled={isLoading || isRefreshing}
              className="flex items-center gap-2 bg-green-100 hover:bg-green-200 text-green-700 border-green-300"
              title="Refresh all queue data manually"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button 
              onClick={() => setShowAddVehicleModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-6 py-2 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
              title="Ajouter un véhicule à la file (Ctrl+N ou F6)"
              data-shortcut="add-vehicle"
            >
              <Car className="h-5 w-5" />
              + Ajouter Véhicule
              <div className="ml-2 text-xs opacity-75">
                <kbd className="px-1 py-0.5 bg-blue-500 rounded text-xs">F6</kbd>
              </div>
            </Button>
          </div>
        </div>
        
        {/* Quick Stats */}
        {(() => {
          const s = aggregateStatusCounts();
          const totalStations = queueSummaries.length;
          return (
            <div className="mt-4 flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <span className="text-gray-600">En attente: <span className="font-semibold text-gray-900">{s.waiting}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                <span className="text-gray-600">En charge: <span className="font-semibold text-gray-900">{s.loading}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <span className="text-gray-600">Prêt: <span className="font-semibold text-gray-900">{s.ready}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                <span className="text-gray-600">Total: <span className="font-semibold text-gray-900">{s.total}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-purple-600" />
                <span className="text-gray-600">Stations: <span className="font-semibold text-gray-900">{totalStations}</span></span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Simple Filter Section */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-gray-700">Filtrer par localisation:</h3>
          <select 
            className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={selectedGovernment} 
            onChange={(e) => handleGovernmentChange(e.target.value)}
          >
            <option value="">Tous les gouvernorats</option>
            {governments.map(gov => (
              <option key={gov.name} value={gov.name}>
                {gov.nameAr ? `${gov.name} - ${gov.nameAr}` : gov.name}
              </option>
            ))}
          </select>
          
          {selectedGovernment && (
            <select 
              className="px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedDelegation} 
              onChange={(e) => handleDelegationChange(e.target.value)}
            >
              <option value="">Toutes les délégations</option>
              {availableDelegations.map(delegation => (
                <option key={delegation.name} value={delegation.name}>
                  {delegation.nameAr ? `${delegation.name} - ${delegation.nameAr}` : delegation.name}
                </option>
              ))}
            </select>
          )}
          
          {(selectedGovernment || selectedDelegation) && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={clearFilters}
              className="text-gray-600 hover:bg-gray-50"
            >
              Effacer
            </Button>
          )}
        </div>
      </div>

      {/* Improved Add Vehicle Modal */}
      <Dialog open={showAddVehicleModal} onOpenChange={setShowAddVehicleModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">Ajouter un véhicule à la file</DialogTitle>
            <p className="text-sm text-gray-600">Sélectionnez un véhicule et sa destination</p>
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <div><strong>Raccourcis clavier:</strong></div>
              <div>• <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Alt</kbd> : Basculer entre recherche et sélection</div>
              <div>• <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">↑</kbd> <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">↓</kbd> ou <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">W</kbd> <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">S</kbd> : Naviguer</div>
              <div>• <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Espace</kbd> : Sélectionner/Confirmer</div>
              <div>• <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Échap</kbd> : Annuler</div>
            </div>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Step 1: Vehicle Selection */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">1. Choisir le véhicule</h3>
              <div className="mb-4">
                <Input
                  placeholder="Rechercher par plaque ou nom du conducteur..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full"
                />
                <div className="mt-1 text-xs text-gray-500">
                  Appuyez sur <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Alt</kbd> pour basculer entre la recherche et la sélection
                </div>
              </div>
              
              {vehiclesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin mr-3 h-5 w-5" />
                  <span className="text-gray-600">Chargement des véhicules...</span>
                </div>
              ) : vehiclesError ? (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200">
                  {vehiclesError}
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                  {vehicles.filter(v => {
                    // Filter out banned vehicles
                    if (v.isBanned) return false;
                    const plate = (v.licensePlate || '').toUpperCase().trim();
                    if (vehiclesInAnyQueue.includes(plate)) return false;
                    const q = search.toLowerCase();
                    return (
                      v.licensePlate?.toLowerCase().includes(q)
                      // Driver CIN removed - no longer supported
                    );
                  }).map((v, index) => (
                    <div
                      key={v.id || v.licensePlate}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                        selectedVehicle?.licensePlate === v.licensePlate ? 'bg-blue-50 border-l-4 border-l-blue-500 ring-2 ring-blue-200' : ''
                      }`}
                      onClick={() => setSelectedVehicle(v)}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <Car className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-gray-900">{v.licensePlate}</div>
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                              v.dayPassValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {v.dayPassValid ? 'Pass OK' : 'Pas de pass'}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600">Véhicule: {v.licensePlate}</div>
                        </div>
                      </div>
                      {selectedVehicle?.licensePlate === v.licensePlate && (
                        <CheckCircle className="text-blue-600 h-5 w-5" />
                      )}
                    </div>
                  ))}
                  {vehicles.filter(v => {
                    const plate = (v.licensePlate || '').toUpperCase().trim();
                    return !vehiclesInAnyQueue.includes(plate);
                  }).length === 0 && (
                    <div className="text-gray-500 text-center py-8">
                      <Car className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p>Aucun véhicule disponible</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Step 2: Destination Selection */}
            {selectedVehicle && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  2. Choisir la destination pour <span className="font-semibold text-blue-600">{selectedVehicle.licensePlate}</span>
                </h3>
                
                {destinationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    <span className="text-gray-600">Chargement des destinations...</span>
                  </div>
                ) : vehicleDestinations.length > 0 ? (
                  <div className="space-y-3">
                    {/* Header with count */}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <MapPin className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">
                          {vehicleDestinations.length} destination{vehicleDestinations.length > 1 ? 's' : ''} disponible{vehicleDestinations.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Cliquez pour sélectionner
                      </div>
                    </div>
                    
                    {/* Destinations Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                      {vehicleDestinations.map((dest: any, index: number) => (
                        <div
                          key={dest.stationId}
                          className={`group relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                            selectedVehicleDestination === dest.stationId 
                              ? 'border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-200' 
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md'
                          }`}
                          onClick={() => setSelectedVehicleDestination(dest.stationId)}
                        >
                          {/* Selection indicator */}
                          <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedVehicleDestination === dest.stationId 
                              ? 'border-blue-500 bg-blue-500' 
                              : 'border-gray-300 group-hover:border-blue-400'
                          }`}>
                            {selectedVehicleDestination === dest.stationId && (
                              <CheckCircle className="w-3 h-3 text-white" />
                            )}
                          </div>
                          
                          {/* Station info */}
                          <div className="pr-8">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                                  {dest.stationName}
                                </h4>
                                {dest.isDefault && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                                    <Star className="w-3 h-3 mr-1" />
                                    Défaut
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Price and status */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-600">
                                  Prix: <span className="font-bold text-green-600">{formatCurrency(dest.basePrice)}</span>
                                </span>
                              </div>
                              {/* Availability badge removed as requested */}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <div className="text-gray-600 text-sm">
                      Aucune destination autorisée pour ce véhicule
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Error Display */}
            {addVehicleError && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-sm">{addVehicleError}</span>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddVehicleModal(false);
                setSelectedVehicle(null);
                setSelectedVehicleDestination(null);
                setVehicleDestinations([]);
                setAddVehicleError(null);
                setSearch("");
                setIsInputFocused(false);
              }}
              data-shortcut="close-modal"
            >
              Annuler
            </Button>
            <Button
              onClick={handleAddVehicleToQueue}
              disabled={!selectedVehicle || !selectedVehicleDestination || !!actionLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  Ajout en cours...
                </>
              ) : (
                <>
                  <Car className="h-4 w-4 mr-2" />
                  Ajouter à la file
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Improved Change Queue Modal */}
      <Dialog open={showChangeQueueModal} onOpenChange={setShowChangeQueueModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">Changer la destination</DialogTitle>
            <p className="text-sm text-gray-600">Sélectionnez une nouvelle destination pour ce véhicule</p>
          </DialogHeader>
          
          {selectedVehicleForQueueChange && (
            <div className="space-y-6">
              {/* Vehicle Info */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Car className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{selectedVehicleForQueueChange.licensePlate}</div>
                    <div className="text-sm text-gray-600">
                      Véhicule: {selectedVehicleForQueueChange.licensePlate}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Actuellement: <span className="font-medium text-blue-600">{selectedVehicleForQueueChange.currentDestination}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Destination Selection */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Nouvelle destination</h3>
                
                {changeQueueLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    <span className="text-gray-600">Chargement des destinations...</span>
                  </div>
                ) : changeQueueDestinations.length > 0 ? (
                  <div className="space-y-3">
                    {/* Header with count */}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <MapPin className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">
                          {changeQueueDestinations.length} destination{changeQueueDestinations.length > 1 ? 's' : ''} disponible{changeQueueDestinations.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Cliquez pour changer
                      </div>
                    </div>
                    
                    {/* Destinations List */}
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {changeQueueDestinations.map((dest: any, index: number) => (
                        <div
                          key={dest.stationId}
                          className={`group relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                            selectedNewDestination === dest.stationId 
                              ? 'border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-200' 
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-md'
                          }`}
                          onClick={() => setSelectedNewDestination(dest.stationId)}
                        >
                          {/* Selection indicator */}
                          <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedNewDestination === dest.stationId 
                              ? 'border-blue-500 bg-blue-500' 
                              : 'border-gray-300 group-hover:border-blue-400'
                          }`}>
                            {selectedNewDestination === dest.stationId && (
                              <CheckCircle className="w-3 h-3 text-white" />
                            )}
                          </div>
                          
                          {/* Station info */}
                          <div className="pr-8">
                            <div className="flex items-center space-x-3 mb-2">
                              <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                                  {dest.stationName}
                                </h4>
                                {dest.isDefault && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                                    <Star className="w-3 h-3 mr-1" />
                                    Défaut
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Price and status */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-600">
                                  Prix: <span className="font-bold text-green-600">{formatCurrency(dest.basePrice)}</span>
                                </span>
                              </div>
                              {/* Availability badge removed as requested */}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <div className="text-gray-600 text-sm">
                      Aucune autre destination disponible
                    </div>
                  </div>
                )}
              </div>
              
              {/* Error Display */}
              {changeQueueError && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-sm">{changeQueueError}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowChangeQueueModal(false);
                setSelectedVehicleForQueueChange(null);
                setSelectedNewDestination(null);
                setChangeQueueDestinations([]);
                setChangeQueueError(null);
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={async () => {
                if (!selectedVehicleForQueueChange || !selectedNewDestination) return;
                
                setChangeQueueLoading(true);
                setChangeQueueError(null);
                
                const destinationInfo = changeQueueDestinations.find(d => d.stationId === selectedNewDestination);
                
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
                  debouncedRefreshQueues();
                } else if (result?.message) {
                  setChangeQueueError(result.message);
                }
              }}
              disabled={!selectedVehicleForQueueChange || !selectedNewDestination || changeQueueLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {changeQueueLoading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  Changement en cours...
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4 mr-2" />
                  Changer la destination
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day Pass Purchase Modal */}
      <Dialog open={showDayPassModal} onOpenChange={setShowDayPassModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">Pass Journalier Requis</DialogTitle>
            <p className="text-sm text-gray-600">Ce véhicule n'a pas de pass journalier valide</p>
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <div><strong>Raccourcis clavier:</strong></div>
              <div>• <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Espace</kbd> : Acheter et ajouter à la file</div>
              <div>• <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Échap</kbd> : Annuler</div>
            </div>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Vehicle Info */}
            {selectedVehicle && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Car className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{selectedVehicle.licensePlate}</div>
                    <div className="text-sm text-gray-600">
                      Conducteur: {selectedVehicle.driver ? `${selectedVehicle.driver.firstName} ${selectedVehicle.driver.lastName}` : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Day Pass Info */}
            <div className="text-center">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm font-medium text-yellow-800">Pass journalier requis</span>
                </div>
                <p className="text-sm text-yellow-700">
                  Pour ajouter ce véhicule à la file, un pass journalier valide est nécessaire.
                </p>
              </div>
              
              {dayPassPrice > 0 && (
                <div className="text-center">
                  <p className="text-sm text-gray-600">Prix du pass journalier</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(dayPassPrice)}</p>
                </div>
              )}
            </div>
            
            {/* Error Display */}
            {dayPassError && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-sm">{dayPassError}</span>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-6">
            <div className="flex justify-between w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDayPassModal(false);
                  setDayPassError(null);
                }}
              >
                Annuler
              </Button>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await thermalPrinter.reprintLastDayPass();
                      addNotification({
                        type: 'success',
                        title: 'Réimpression réussie',
                        message: 'Le dernier pass journalier a été réimprimé',
                        duration: 3000
                      });
                    } catch (error) {
                      addNotification({
                        type: 'error',
                        title: 'Erreur de réimpression',
                        message: 'Impossible de réimprimer le dernier pass journalier',
                        duration: 3000
                      });
                    }
                  }}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Réimprimer
                </Button>
                
                <Button
                  onClick={handleDayPassPurchase}
                  disabled={!selectedVehicle || dayPassLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {dayPassLoading ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Achat en cours...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Acheter et ajouter à la file
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Simple Destination Cards */}
      <div className="p-6">
        {queueSummaries.length === 0 && !isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Car className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune file d'attente active</h3>
            <p className="text-gray-600">Aucune file d'attente active pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {queueSummaries.map((summary) => {
              const destinationQueues = queues[summary.destinationName] || [];
              const waitingCount = destinationQueues.filter((q: any) => q.status === 'WAITING').length;
              const loadingCount = destinationQueues.filter((q: any) => q.status === 'LOADING').length;
              const readyCount = destinationQueues.filter((q: any) => q.status === 'READY').length;
              const route = getRouteForDestination(summary.destinationName);
              
              return (
                <div
                  key={summary.destinationId}
                  className={`bg-white rounded-lg border-2 p-4 cursor-pointer transition-all ${
                    selectedDestination === summary.destinationName 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedDestination(prev => prev === summary.destinationName ? null : summary.destinationName)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{summary.destinationName}</h3>
                    {route && (
                      <span className="text-sm font-medium text-green-600">{formatCurrency(route.basePrice)}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                    <span>Véhicules: <span className="font-semibold text-gray-900">{summary.totalVehicles}</span></span>
                    {(summary.governorate || summary.delegation) && (
                      <span className="text-xs">
                        {summary.governorate && summary.delegation 
                          ? `${summary.governorate} • ${summary.delegation}`
                          : summary.governorate || summary.delegation
                        }
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                      <span className="text-gray-600">Attente: <span className="font-medium text-gray-900">{waitingCount}</span></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                      <span className="text-gray-600">Charge: <span className="font-medium text-gray-900">{loadingCount}</span></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-green-400"></div>
                      <span className="text-gray-600">Prêt: <span className="font-medium text-gray-900">{readyCount}</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg p-4 border border-gray-200 animate-pulse">
                <div className="h-4 w-1/3 bg-gray-200 rounded mb-3"></div>
                <div className="h-3 w-2/3 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 w-1/2 bg-gray-200 rounded mb-4"></div>
                <div className="h-8 w-full bg-gray-100 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-6">
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="font-medium">Erreur:</span>
              <span>{error}</span>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Lists */}
      <div className="p-6">
        {queueSummaries.length === 0 && !isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Car className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Aucune file d'attente active</h3>
            <p className="text-gray-600 mb-6">Aucune file d'attente active pour le moment.</p>
            <Button 
              onClick={() => setShowAddVehicleModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-6 py-3 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
              data-shortcut="add-item"
            >
              <Car className="h-5 w-5" />
              + Ajouter le premier véhicule
            </Button>
          </div>
        ) : (
          <>
            {(selectedDestination ? [normalizeDestinationName(selectedDestination)] : destinations).map((destination) => {
              const summary = queueSummaries.find(s => normalizeDestinationName(s.destinationName) === destination);
              const destinationQueues = queues[destination] || [];
              
              return (
                <div key={destination} className="bg-white rounded-lg border border-gray-200 mb-6">
                  {/* Destination Header */}
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">{destination}</h2>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>Véhicules: <span className="font-semibold text-gray-900">{summary?.totalVehicles || 0}</span></span>
                        {isConnected && (
                          <div className="flex items-center gap-1 text-green-600">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span>Live</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Vehicle List */}
                  <div className="p-6">
                    {summary && summary.totalVehicles > 0 ? (
                      destinationQueues.length > 0 ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragStart={() => setIsReordering(true)}
                          onDragEnd={(event) => handleDragEnd(event)}
                        >
                          <SortableContext
                            items={destinationQueues.map(q => q.id) || []}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className={`space-y-3 ${isReordering ? 'opacity-75' : ''}`}>
                              {isReordering && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center text-blue-700 text-sm">
                                  <Move className="h-4 w-4 inline mr-2" />
                                  Glissez-déposez pour réorganiser les véhicules
                                </div>
                              )}
                              {destinationQueues.map((queue) => (
                                <SortableQueueItem
                                  key={queue.id}
                                  queue={queue}
                                  getStatusColor={getStatusColor}
                                  formatTime={formatTime}
                                  getBasePriceForDestination={getBasePriceForDestination}
                                  onVehicleClick={handleVehicleClick}
                                  onExitQueue={handleExitQueue}
                                  onEndTrip={handleEndTrip}
                                  onMoveToFront={handleMoveToFront}
                                  actionLoading={actionLoading}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <div className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-gray-400" />
                          <p className="text-gray-600">Chargement des véhicules...</p>
                        </div>
                      )
                    ) : (
                      <div className="text-center py-8">
                        <Car className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun véhicule</h3>
                        <p className="text-gray-600 mb-6">Aucun véhicule dans cette file d'attente.</p>
                        <Button 
                          onClick={() => setShowAddVehicleModal(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-4 py-2 text-sm font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                          data-shortcut="add-item"
                        >
                          <Car className="h-4 w-4" />
                          + Ajouter un véhicule
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-20 right-6 z-50">
        <Button
          onClick={() => setShowAddVehicleModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-110"
          size="icon"
          title="Ajouter un véhicule (Ctrl+N)"
          data-shortcut="add-item"
        >
          <Car className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
} 