import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useInit } from '../context/InitProvider';
import { useQueue } from '../context/QueueProvider';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { 
  MapPin, 
  Plus,
  Minus,
  Ticket,
  CheckCircle,
  Loader2,
  X,
  PrinterIcon,
  AlertTriangle,
  Printer,
  Car,
  Clock,
  Users,
  ArrowRight,
  GripVertical,
  RefreshCw,
  SignalHigh,
  WifiOff,
  Activity,
  Edit,
  UserCheck,
  TrendingUp,
  Keyboard
} from 'lucide-react';
import api from '../lib/api';
import { dbClient, BookingUpdateEvent, QueueUpdateEvent } from '../services/dbClient';
import { websocketDbClient } from '../services/websocketRealtimeService';
import { useMQTT } from '../lib/useMQTT';
import { usePaymentNotifications } from '../components/NotificationToast';
import { TicketPrintout } from '../components/TicketPrintout';
import { renderToString } from 'react-dom/server';
import { thermalPrinter } from '../services/thermalPrinterService';
import { Settings } from 'lucide-react';
import ExitPassConfirmationModal from '../components/ExitPassConfirmationModal';

interface Destination {
  destinationId: string;
  destinationName: string;
  totalAvailableSeats: number;
  vehicleCount: number;
  governorate?: string;
  governorateAr?: string;
  delegation?: string;
  delegationAr?: string;
  subRouteName?: string;
  baseDestinationName?: string;
}

interface Government {
  name: string;
  nameAr?: string;
  delegations: Array<{
    name: string;
    nameAr?: string;
  }>;
}

export default function MainBooking() {
  const { currentStaff, selectedRoute } = useAuth();
  const { systemStatus } = useInit();
  const { 
    notifyPaymentSuccess, 
    notifyPaymentFailed, 
    notifySeatUpdate, 
    notifyVehicleReady 
  } = usePaymentNotifications();
  
  // Queue management integration
  const {
    queues,
    queueSummaries,
    isLoading: queueLoading,
    error: queueError,
    refreshQueues,
    fetchQueueForDestination,
    isConnected: queueConnected,
    enterQueue,
    exitQueue,
    updateVehicleStatus,
    beginOptimisticSuppression,
  } = useQueue();
  
  // Thermal printer integration removed - keeping console logging
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [availableSeats, setAvailableSeats] = useState<number>(1);
  const [bookingData, setBookingData] = useState<{ seats: number }>({ seats: 1 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [ticketsPrinted, setTicketsPrinted] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [basePrice, setBasePrice] = useState<number>(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [websocketConnected, setWebsocketConnected] = useState(false);
  const [discoveredApps, setDiscoveredApps] = useState(0);
  const [bestServer, setBestServer] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');
  
  // Track current destination ID to maintain focus after refresh
  const [currentDestinationId, setCurrentDestinationId] = useState<string | null>(null);
  
  // Persistent selection state keys
  const SELECTED_DESTINATION_KEY = 'mainBooking_selectedDestination';
  const SELECTED_VEHICLE_KEY = 'mainBooking_selectedVehicle';

  // Save selection state to localStorage
  const saveSelectionState = (destination: Destination | null, vehicle: any | null) => {
    try {
      if (destination) {
        localStorage.setItem(SELECTED_DESTINATION_KEY, JSON.stringify({
          destinationId: destination.destinationId,
          destinationName: destination.destinationName,
          baseDestinationName: destination.baseDestinationName,
          subRouteName: destination.subRouteName,
          totalAvailableSeats: destination.totalAvailableSeats
        }));
      } else {
        localStorage.removeItem(SELECTED_DESTINATION_KEY);
      }

      if (vehicle) {
        localStorage.setItem(SELECTED_VEHICLE_KEY, JSON.stringify({
          queueId: vehicle.queueId,
          licensePlate: vehicle.licensePlate,
          availableSeats: vehicle.availableSeats,
          totalSeats: vehicle.totalSeats,
          queuePosition: vehicle.queuePosition
        }));
      } else {
        localStorage.removeItem(SELECTED_VEHICLE_KEY);
      }
      
      console.log('💾 Selection state saved to localStorage');
    } catch (error) {
      console.warn('⚠️ Failed to save selection state:', error);
    }
  };

  // Restore selection state from localStorage
  const restoreSelectionState = () => {
    try {
      const savedDestination = localStorage.getItem(SELECTED_DESTINATION_KEY);
      const savedVehicle = localStorage.getItem(SELECTED_VEHICLE_KEY);
      
      if (savedDestination) {
        const destinationData = JSON.parse(savedDestination);
        console.log('🔄 Restoring destination from localStorage:', destinationData);
        setCurrentDestinationId(destinationData.destinationId);
      }
      
      if (savedVehicle) {
        const vehicleData = JSON.parse(savedVehicle);
        console.log('🔄 Restoring vehicle from localStorage:', vehicleData);
        setSelectedVehicle(vehicleData);
      }
      
      return { destinationData: savedDestination ? JSON.parse(savedDestination) : null, vehicleData: savedVehicle ? JSON.parse(savedVehicle) : null };
    } catch (error) {
      console.warn('⚠️ Failed to restore selection state:', error);
      return { destinationData: null, vehicleData: null };
    }
  };
  
  // Debounced fetch destinations to prevent excessive calls
  const [fetchDestinationsTimeout, setFetchDestinationsTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Prevent multiple simultaneous fetch calls
  const [isFetchingDestinations, setIsFetchingDestinations] = useState(false);
  
  // Last booking data for cancel functionality
  const [lastBookingData, setLastBookingData] = useState<{
    bookings: any[];
    totalSeats: number;
    totalAmount: number;
  } | null>(null);
  // Transform/cancel action panel state
  const [showTransformPanel, setShowTransformPanel] = useState(false);
  const [transformQuery, setTransformQuery] = useState<string>("");
  const [transformSelectedPlates, setTransformSelectedPlates] = useState<Set<string>>(new Set());
  const [transformTargetQueueId, setTransformTargetQueueId] = useState<string | null>(null);
  
  // Seat cancellation state
  const [isCancelingSeat, setIsCancelingSeat] = useState(false);
  
  // Filter states
  const [governments, setGovernments] = useState<Government[]>([]);
  const [selectedGovernment, setSelectedGovernment] = useState<string>('');
  const [selectedDelegation, setSelectedDelegation] = useState<string>('');
  const [availableDelegations, setAvailableDelegations] = useState<Array<{ name: string; nameAr?: string; }>>([]);
  
  // Keyboard shortcuts state
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // Tab state for thermal printer settings
  const [activeTab, setActiveTab] = useState<'bookings' | 'printers'>('bookings');
  
  // Queue management state
  const [selectedQueueDestination, setSelectedQueueDestination] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  
  // Vehicle selection for queue reordering
  const [selectedVehicle, setSelectedVehicle] = useState<{
    queueId: string;
    licensePlate: string;
    availableSeats: number;
    totalSeats: number;
    queuePosition: number;
  } | null>(null);
  
  // Exit pass confirmation modal state
  const [showExitPassModal, setShowExitPassModal] = useState(false);
  const [exitPassVehicleData, setExitPassVehicleData] = useState<{
    licensePlate: string;
    destinationName: string;
    totalSeats: number;
    bookedSeats: number;
    previousVehicle?: {
      licensePlate: string;
      exitTime: string;
    } | null;
  } | null>(null);
  const [isReprinting, setIsReprinting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  
  // Track vehicles that need exit pass confirmation
  const [vehiclesPendingExitConfirmation, setVehiclesPendingExitConfirmation] = useState<Set<string>>(new Set());
  
  // Test exit pass state
  const [showTestExitPass, setShowTestExitPass] = useState(false);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  
  // Helper functions
  const normalizeStationName = (name: string) => {
    return name.toUpperCase().trim();
  };

  const normalizeDestinationName = (name: string) => {
    return name.replace(/^STATION /i, "").toUpperCase().trim();
  };
  
  // Vehicle selection handler
  const handleVehicleSelect = (queue: any) => {
    const vehicleData = {
      queueId: queue.id,
      licensePlate: queue.licensePlate,
      availableSeats: queue.availableSeats,
      totalSeats: queue.totalSeats,
      queuePosition: queue.queuePosition
    };
    
    setSelectedVehicle(vehicleData);
    // Set the available seats to the vehicle's actual available seats
    setAvailableSeats(queue.availableSeats);
    setBookingData({ seats: 1 }); // Start with 1 seat selected by default
    
    // Save selection state
    saveSelectionState(selectedDestination, vehicleData);
    
    console.log('🚗 Vehicle selected and saved:', vehicleData.licensePlate);
  };

  // Clear vehicle selection
  const clearVehicleSelection = () => {
    setSelectedVehicle(null);
    // Reset to destination's total available seats or 1 if no destination selected
    if (selectedDestination) {
      setAvailableSeats(selectedDestination.totalAvailableSeats);
    } else {
      setAvailableSeats(1);
    }
    setBookingData({ seats: 1 });
    
    // Save selection state (clear vehicle)
    saveSelectionState(selectedDestination, null);
    
    console.log('🚗 Vehicle selection cleared and saved');
  };

  // Validate and restore vehicle selection after queue updates
  const validateVehicleSelection = () => {
    if (selectedVehicle && selectedDestination) {
      const baseDestinationName = selectedDestination.baseDestinationName || selectedDestination.destinationName;
      const normalizedDestination = normalizeDestinationName(baseDestinationName);
      const destinationQueues = queues[normalizedDestination] || [];
      
      // Filter by sub-route if needed
      let filteredQueues = destinationQueues;
      if (selectedDestination.subRouteName) {
        filteredQueues = destinationQueues.filter((q: any) => {
          const queueSubRoute = (q.subRouteName || q.subRoute || '').toString().toUpperCase().trim();
          return queueSubRoute === selectedDestination.subRouteName!.toUpperCase();
        });
      }
      
      const vehicleStillExists = filteredQueues.some((q: any) => q.id === selectedVehicle.queueId);
      
      if (!vehicleStillExists) {
        console.log('🚗 Selected vehicle no longer exists, clearing selection');
        setSelectedVehicle(null);
        // Reset available seats to destination total
        setAvailableSeats(selectedDestination.totalAvailableSeats);
        setBookingData({ seats: 1 });
        
        // Save cleared vehicle selection
        saveSelectionState(selectedDestination, null);
      } else {
        console.log('🚗 Vehicle selection validated and maintained:', selectedVehicle.licensePlate);
        // Update vehicle data with latest information
        const updatedVehicle = filteredQueues.find((q: any) => q.id === selectedVehicle.queueId);
        if (updatedVehicle && updatedVehicle.licensePlate && updatedVehicle.availableSeats !== undefined && updatedVehicle.totalSeats !== undefined && updatedVehicle.queuePosition !== undefined) {
          const updatedVehicleData = {
            queueId: updatedVehicle.id,
            licensePlate: updatedVehicle.licensePlate,
            availableSeats: updatedVehicle.availableSeats,
            totalSeats: updatedVehicle.totalSeats,
            queuePosition: updatedVehicle.queuePosition
          };
          setSelectedVehicle(updatedVehicleData);
          setAvailableSeats(updatedVehicle.availableSeats);
          
          // Save updated vehicle data
          saveSelectionState(selectedDestination, updatedVehicleData);
        }
      }
    }
  };

  // Handle seat cancellation
  const handleCancelSeat = async () => {
    if (!selectedDestination || !currentStaff) return;
    
    setIsCancelingSeat(true);
    try {
      console.log('🚫 Canceling seat for destination:', selectedDestination.destinationId);
      
      const result = await dbClient.cancelSeatFromDestination(
        selectedDestination.destinationId,
        currentStaff.id
      );
      
      console.log('✅ Seat cancellation result:', result);
      
      // Show success notification
      notifyPaymentSuccess({
        verificationCode: 'CANCELLED',
        totalAmount: 0,
        seatsBooked: 1,
        destinationName: selectedDestination.destinationName,
        vehicleLicensePlate: selectedVehicle?.licensePlate || 'N/A',
        paymentReference: 'SEAT_CANCELLATION'
      });
      
      // Refresh the queue data to reflect the cancellation
      await refreshQueues();
      await fetchDestinations();
      if (selectedDestination) {
        await fetchQueueForDestination(selectedDestination.destinationId);
      }
      
      // Update selected vehicle data if it's still selected
      if (selectedVehicle) {
        const updatedVehicle = {
          ...selectedVehicle,
          availableSeats: selectedVehicle.availableSeats + 1
        };
        setSelectedVehicle(updatedVehicle);
      }
      
    } catch (error) {
      console.error('❌ Failed to cancel seat:', error);
      notifyPaymentFailed({
        verificationCode: 'CANCELLATION_FAILED',
        totalAmount: 0,
        destinationName: selectedDestination?.destinationName || 'Unknown'
      });
    } finally {
      setIsCancelingSeat(false);
    }
  };

  const getBasePriceForDestination = (destinationName: string) => {
    let route = routes.find(r =>
      normalizeStationName(r.stationName) === normalizeStationName(destinationName)
    );

    if (!route) {
      const normalizedDestination = normalizeDestinationName(destinationName);
      route = routes.find(r =>
        normalizeDestinationName(r.stationName) === normalizedDestination
      );
    }

    if (!route) {
      route = routes.find(r =>
        normalizeStationName(r.stationName).includes(normalizeStationName(destinationName)) ||
        normalizeStationName(destinationName).includes(normalizeStationName(r.stationName))
      );
    }

    return route?.basePrice;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'WAITING': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'LOADING': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'READY': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Exit pass handling functions
  const checkForFullyBookedVehicle = (destinationId: string, seatsBooked: number, bookingResponse?: any) => {
    console.log('🔍 Checking for fully booked vehicle after booking:', { destinationId, seatsBooked, bookingResponse });
    
    // Find the destination in current state
    const destination = destinations.find(dest => dest.destinationId === destinationId);
    if (!destination) {
      console.log('⚠️ Destination not found in current state');
      return;
    }

    // Check if this destination now has 0 available seats (fully booked)
    console.log('🔍 Checking destination availability:', {
      destinationName: destination.destinationName,
      totalAvailableSeats: destination.totalAvailableSeats,
      seatsBooked: seatsBooked
    });
    
    if (destination.totalAvailableSeats === 0) {
      console.log('🎯 Destination is now fully booked, checking for vehicles to change status');
      
      // Try to get vehicle info from booking response first
      let vehicleToProcess = null;
      
      if (bookingResponse && bookingResponse.bookings && bookingResponse.bookings.length > 0) {
        // Get vehicle info from the first booking
        const firstBooking = bookingResponse.bookings[0];
        if (firstBooking.vehicleLicensePlate) {
          vehicleToProcess = {
            vehicle: {
              licensePlate: firstBooking.vehicleLicensePlate
            },
            totalSeats: 8, // Default to 8 seats
            availableSeats: 0, // Fully booked
            status: 'WAITING' // Will be changed to READY
          };
          console.log('🚗 Using vehicle from booking response:', vehicleToProcess.vehicle.licensePlate);
        }
      }
      
      // If no vehicle from booking response, try to find in queues
      if (!vehicleToProcess) {
        const normalizedDestination = normalizeDestinationName(destination.destinationName);
        const destinationQueues = queues[normalizedDestination] || [];
        
        // Find the first vehicle that's fully booked but not already READY
        vehicleToProcess = destinationQueues.find((queue: any) => 
          queue.availableSeats === 0 && 
          queue.status !== 'READY' &&
          !vehiclesPendingExitConfirmation.has(queue.vehicle.licensePlate)
        );
        
        if (vehicleToProcess) {
          console.log('🚗 Found fully booked vehicle in queue:', vehicleToProcess.vehicle.licensePlate);
        }
      }
      
      if (vehicleToProcess) {
        console.log('🎫 Triggering exit pass workflow for vehicle:', vehicleToProcess.vehicle.licensePlate);
        triggerExitPassWorkflow(vehicleToProcess, destination.destinationName);
      } else {
        console.log('⚠️ No fully booked vehicle found to process for exit pass');
      }
    }
  };

  const triggerExitPassWorkflow = async (vehicle: any, destinationName: string) => {
    console.log('🎫 Triggering exit pass workflow for vehicle:', vehicle.vehicle.licensePlate);
    
    try {
      // Snapshot before booking to reconcile after server updates
      const preBookingSnapshot = (() => {
        const dest = destinations.find(d => selectedDestination && d.destinationId === selectedDestination.destinationId);
        return dest ? {
          destinationId: dest.destinationId,
          destinationName: dest.destinationName,
          seatsBefore: dest.totalAvailableSeats
        } : null;
      })();
      // Mark vehicle as pending exit confirmation
      setVehiclesPendingExitConfirmation(prev => new Set(prev).add(vehicle.vehicle.licensePlate));
      
      // Change vehicle status to READY (fully booked)
      console.log('🔄 Changing vehicle status to READY (fully booked)');
      await updateVehicleStatus(vehicle.vehicle.licensePlate, 'READY');
      
      // Get previous vehicle data
      const normalizedDestination = normalizeDestinationName(destinationName);
      const destinationQueues = queues[normalizedDestination] || [];
      const currentIndex = destinationQueues.findIndex((q: any) => q.vehicle.licensePlate === vehicle.vehicle.licensePlate);
      
      let previousVehicle = null;
      if (currentIndex > 0) {
        const prevVehicle = destinationQueues[currentIndex - 1];
        // Check if previous vehicle exited today (assuming exitTime is stored in the queue data)
        if ((prevVehicle as any).exitTime) {
          const prevExitDate = new Date((prevVehicle as any).exitTime);
          const currentDate = new Date();
          const isSameDay = prevExitDate.toDateString() === currentDate.toDateString();
          
          if (isSameDay) {
            previousVehicle = {
              licensePlate: prevVehicle.vehicle.licensePlate,
              exitTime: (prevVehicle as any).exitTime
            };
          }
        }
      }
      
      // Prepare exit pass data
      const exitPassData = {
        licensePlate: vehicle.vehicle.licensePlate,
        destinationName: destinationName,
        totalSeats: vehicle.totalSeats || 8, // Default to 8 if not specified
        bookedSeats: (vehicle.totalSeats || 8) - vehicle.availableSeats,
        previousVehicle: previousVehicle
      };
      
      // Auto-print exit pass and show confirmation modal
      console.log('📋 Auto-printing exit pass and showing confirmation modal');
      
      // Get base price for the destination
      const basePricePerSeat = getBasePriceForDestination(destinationName) || 2.0;
      const totalBasePrice = basePricePerSeat * (vehicle.totalSeats || 8);
      
      const thermalExitPassData = {
        licensePlate: vehicle.vehicle.licensePlate,
        destinationName: destinationName,
        previousLicensePlate: previousVehicle?.licensePlate || null,
        previousExitTime: previousVehicle?.exitTime || null,
        currentExitTime: new Date().toISOString(),
        totalSeats: vehicle.totalSeats || 8,
        basePricePerSeat: basePricePerSeat,
        totalBasePrice: totalBasePrice,
        staffName: currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'Staff'
      };
      
      // Print exit pass automatically
      try {
        const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
        const exitPassTicketData = thermalPrinter.formatExitPassTicketData(thermalExitPassData);
        await thermalPrinter.printExitPassTicket(exitPassTicketData, staffName);
        console.log('✅ Exit pass printed automatically for fully booked vehicle');
      } catch (printError) {
        console.error('❌ Failed to auto-print exit pass:', printError);
        // Continue with modal even if printing fails
      }
      
      // Show confirmation modal
      setExitPassVehicleData(exitPassData);
      setShowExitPassModal(true);
      
    } catch (error) {
      console.error('❌ Failed to update vehicle status:', error);
      alert(`❌ Erreur de mise à jour!\n\nImpossible de changer le statut du véhicule: ${error instanceof Error ? error.message : 'Erreur inconnue'}\n\nVeuillez réessayer.`);
      
      // Remove from pending confirmation
      setVehiclesPendingExitConfirmation(prev => {
        const newSet = new Set(prev);
        newSet.delete(vehicle.vehicle.licensePlate);
        return newSet;
      });
    }
  };

  const handleExitPassConfirm = async () => {
    if (!exitPassVehicleData) return;
    
    setIsConfirming(true);
    
    try {
      console.log('✅ Confirming exit pass for vehicle:', exitPassVehicleData.licensePlate);
      
      // Remove vehicle from queue
      await exitQueue(exitPassVehicleData.licensePlate);
      
      // Remove from pending confirmation
      setVehiclesPendingExitConfirmation(prev => {
        const newSet = new Set(prev);
        newSet.delete(exitPassVehicleData.licensePlate);
        return newSet;
      });
      
      // Close modal
      setShowExitPassModal(false);
      setExitPassVehicleData(null);
      
      // Refresh destinations to update availability
      fetchDestinations();
      
      console.log('✅ Vehicle successfully removed from queue');
      
    } catch (error) {
      console.error('❌ Failed to confirm exit pass:', error);
      alert(`❌ Erreur de confirmation!\n\nImpossible de retirer le véhicule de la file: ${error instanceof Error ? error.message : 'Erreur inconnue'}\n\nVeuillez réessayer.`);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleExitPassReprint = async () => {
    if (!exitPassVehicleData) return;
    
    setIsReprinting(true);
    
    try {
      console.log('🖨️ Printing exit pass for vehicle:', exitPassVehicleData.licensePlate);
      
      const basePricePerSeat = getBasePriceForDestination(exitPassVehicleData.destinationName) || 2.0;
      const totalBasePrice = basePricePerSeat * exitPassVehicleData.totalSeats;
      
      const thermalExitPassData = {
        licensePlate: exitPassVehicleData.licensePlate,
        destinationName: exitPassVehicleData.destinationName,
        previousLicensePlate: exitPassVehicleData.previousVehicle?.licensePlate || null,
        previousExitTime: exitPassVehicleData.previousVehicle?.exitTime || null,
        currentExitTime: new Date().toISOString(),
        totalSeats: exitPassVehicleData.totalSeats,
        basePricePerSeat: basePricePerSeat,
        totalBasePrice: totalBasePrice,
        staffName: currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'Staff'
      };
      
      const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
      const exitPassTicketData = thermalPrinter.formatExitPassTicketData(thermalExitPassData);
      await thermalPrinter.printExitPassTicket(exitPassTicketData, staffName);
      
      console.log('✅ Exit pass printed successfully');
      
    } catch (error) {
      console.error('❌ Failed to print exit pass:', error);
      alert(`❌ Erreur d'impression!\n\nImpossible d'imprimer le ticket de sortie: ${error instanceof Error ? error.message : 'Erreur inconnue'}\n\nVeuillez réessayer.`);
    } finally {
      setIsReprinting(false);
    }
  };

  const handleExitPassClose = () => {
    setShowExitPassModal(false);
    setExitPassVehicleData(null);
  };

  // Test exit pass functionality
  const testExitPass = () => {
    console.log('🧪 Testing exit pass functionality...');
    
    // Create mock vehicle data for testing
    const mockVehicle = {
      vehicle: {
        licensePlate: 'TEST123'
      },
      totalSeats: 8,
      availableSeats: 0,
      status: 'READY'
    };
    
    const mockDestination = 'TEST DESTINATION';
    
    // Trigger the exit pass workflow with mock data
    triggerExitPassWorkflow(mockVehicle, mockDestination);
  };

  // Test exit pass with previous vehicle data
  const testExitPassWithPrevious = () => {
    console.log('🧪 Testing exit pass with previous vehicle...');
    
    // Create mock vehicle data with previous vehicle
    const mockVehicle = {
      vehicle: {
        licensePlate: 'TEST456'
      },
      totalSeats: 8,
      availableSeats: 0,
      status: 'READY'
    };
    
    const mockDestination = 'TEST DESTINATION WITH PREVIOUS';
    
    // Add previous vehicle data to the mock
    const previousVehicle = {
      licensePlate: 'PREV789',
      exitTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
    };
    
    // Trigger the exit pass workflow
    triggerExitPassWorkflow(mockVehicle, mockDestination);
    
    // Manually set the exit pass data with previous vehicle info
    setTimeout(() => {
      if (exitPassVehicleData) {
        setExitPassVehicleData({
          ...exitPassVehicleData,
          previousVehicle: previousVehicle
        });
      }
    }, 100);
  };

  // Direct test of exit pass printing (bypasses modal)
  const testExitPassDirect = async () => {
    console.log('🧪 Testing exit pass printing directly...');
    
    try {
      // Create mock exit pass data
      const mockExitPassData = {
        licensePlate: 'DIRECT123',
        destinationName: 'DIRECT TEST DESTINATION',
        previousLicensePlate: 'PREV456',
        previousExitTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        currentExitTime: new Date().toISOString(),
        totalSeats: 8,
        basePricePerSeat: 4.0,
        totalBasePrice: 32.0
      };
      
      // Format and print directly
      const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'Test Staff';
      const exitPassTicketData = thermalPrinter.formatExitPassTicketData(mockExitPassData);
      await thermalPrinter.printExitPassTicket(exitPassTicketData, staffName);
      
      console.log('✅ Direct exit pass test completed successfully');
      alert('✅ Exit pass printed successfully! Check your printer.');
      
    } catch (error) {
      console.error('❌ Direct exit pass test failed:', error);
      alert(`❌ Exit pass test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Debounced fetch destinations to prevent excessive calls
  const debouncedFetchDestinations = (delay: number = 500) => {
    if (fetchDestinationsTimeout) {
      clearTimeout(fetchDestinationsTimeout);
    }
    
    const timeout = setTimeout(() => {
      fetchDestinations();
    }, delay);
    
    setFetchDestinationsTimeout(timeout);
  };

  // Flag to prevent auto-selection during data updates
  const [isUpdatingData, setIsUpdatingData] = useState(false);

  // Fetch destinations without auto-selection (for post-booking updates)
  const fetchDestinationsWithoutAutoSelect = async () => {
    // Prevent multiple simultaneous calls
    if (isFetchingDestinations) {
      console.log('🔄 Fetch destinations already in progress, skipping...');
      return;
    }
    
    setIsFetchingDestinations(true);
    setIsLoading(true);
    
    try {
      // Check database health first
      const dbHealthy = await dbClient.health();
      console.log('🔍 [MAIN BOOKING DEBUG] Database health:', dbHealthy);
      
      if (!dbHealthy) {
        throw new Error('Database connection is not healthy');
      }
      
      const filters: { governorate?: string; delegation?: string; routeFilter?: string } = {};
      if (selectedGovernment) {
        filters.governorate = selectedGovernment;
      }
      if (selectedDelegation) {
        filters.delegation = selectedDelegation;
      }
      if (selectedRoute) {
        filters.routeFilter = selectedRoute;
      }
      
      console.log('🔍 [MAIN BOOKING DEBUG] Fetching destinations with filters:', filters);
      const response = await dbClient.getAvailableBookingDestinations(filters);
      console.log('🔍 [MAIN BOOKING DEBUG] Raw destinations response:', response);
      
      // Group destinations by base name to avoid duplicates
      const destinationMap = new Map<string, any>();
      
      (response || [])
        .filter((d: any) => (d.totalAvailableSeats || 0) > 0)
        .forEach((d: any) => {
          const baseName = d.destinationName;
          const subRoute = d.subRouteName;
          
          if (subRoute) {
            // For destinations with sub-routes, create separate entries
            const key = `${baseName} (${subRoute})`;
            destinationMap.set(key, {
              destinationId: d.destinationId,
              destinationName: key,
              totalAvailableSeats: d.totalAvailableSeats,
              vehicleCount: d.vehicleCount,
              governorate: d.governorate,
              governorateAr: d.governorateAr,
              delegation: d.delegation,
              delegationAr: d.delegationAr,
              subRouteName: subRoute,
              baseDestinationName: baseName,
            });
          } else {
            // For destinations without sub-routes, check if we already have this base name
            const existingKey = Array.from(destinationMap.keys()).find(k => k.startsWith(baseName));
            if (!existingKey) {
              destinationMap.set(baseName, {
                destinationId: d.destinationId,
                destinationName: baseName,
                totalAvailableSeats: d.totalAvailableSeats,
                vehicleCount: d.vehicleCount,
                governorate: d.governorate,
                governorateAr: d.governorateAr,
                delegation: d.delegation,
                delegationAr: d.delegationAr,
                subRouteName: null,
                baseDestinationName: baseName,
              });
            }
          }
        });
      
      const availableDestinations: Destination[] = Array.from(destinationMap.values());
      setDestinations(availableDestinations);
      setLastUpdateTime(new Date().toLocaleTimeString());
      console.log(`📍 Fetched ${availableDestinations.length} available destinations (without auto-selection)`);
      
      // Only restore if we have a current selection, don't auto-select
      if (currentDestinationId) {
        const previousDestination = availableDestinations.find(d => d.destinationId === currentDestinationId);
        if (previousDestination) {
          console.log('🎯 Restoring previous destination selection:', previousDestination.destinationName);
          setSelectedDestination(previousDestination);
          setSelectedQueueDestination(previousDestination.destinationId);
          fetchQueueForDestination(previousDestination.destinationId);
        }
      }
      
    } catch (error: any) {
      console.error('❌ [MAIN BOOKING DEBUG] Error fetching destinations:', error);
      setDestinations([]);
    } finally {
      setIsLoading(false);
      setIsFetchingDestinations(false);
    }
  };

  // Fetch available destinations from API (only destinations with available seats)
  const fetchDestinations = async () => {
    // Prevent multiple simultaneous calls
    if (isFetchingDestinations) {
      console.log('🔄 Fetch destinations already in progress, skipping...');
      return;
    }
    
    setIsFetchingDestinations(true);
    setIsLoading(true);
    setIsUpdatingData(true);
    
    try {
      // Check database health first
      const dbHealthy = await dbClient.health();
      console.log('🔍 [MAIN BOOKING DEBUG] Database health:', dbHealthy);
      
      if (!dbHealthy) {
        throw new Error('Database connection is not healthy');
      }
      
      const filters: { governorate?: string; delegation?: string; routeFilter?: string } = {};
      if (selectedGovernment) {
        filters.governorate = selectedGovernment;
      }
      if (selectedDelegation) {
        filters.delegation = selectedDelegation;
      }
      if (selectedRoute) {
        filters.routeFilter = selectedRoute;
      }
      
      console.log('🔍 [MAIN BOOKING DEBUG] Fetching destinations with filters:', filters);
      const response = await dbClient.getAvailableBookingDestinations(filters);
      console.log('🔍 [MAIN BOOKING DEBUG] Raw destinations response:', response);
      
      // Group destinations by base name to avoid duplicates
      const destinationMap = new Map<string, any>();
      
      (response || [])
        .filter((d: any) => (d.totalAvailableSeats || 0) > 0)
        .forEach((d: any) => {
          const baseName = d.destinationName;
          const subRoute = d.subRouteName;
          
          if (subRoute) {
            // For destinations with sub-routes, create separate entries
            const key = `${baseName} (${subRoute})`;
            destinationMap.set(key, {
              destinationId: d.destinationId,
              destinationName: key,
              totalAvailableSeats: d.totalAvailableSeats,
              vehicleCount: d.vehicleCount,
              governorate: d.governorate,
              governorateAr: d.governorateAr,
              delegation: d.delegation,
              delegationAr: d.delegationAr,
              subRouteName: subRoute,
              baseDestinationName: baseName,
            });
          } else {
            // For destinations without sub-routes, check if we already have this base name
            const existingKey = Array.from(destinationMap.keys()).find(k => k.startsWith(baseName));
            if (!existingKey) {
              destinationMap.set(baseName, {
                destinationId: d.destinationId,
                destinationName: baseName,
                totalAvailableSeats: d.totalAvailableSeats,
                vehicleCount: d.vehicleCount,
                governorate: d.governorate,
                governorateAr: d.governorateAr,
                delegation: d.delegation,
                delegationAr: d.delegationAr,
                subRouteName: null,
                baseDestinationName: baseName,
              });
            }
          }
        });
      
      const availableDestinations: Destination[] = Array.from(destinationMap.values());
        setDestinations(availableDestinations);
        setLastUpdateTime(new Date().toLocaleTimeString());
        console.log(`📍 Fetched ${availableDestinations.length} available destinations`);
        
        // Restore previous selection or auto-select first destination
        if (currentDestinationId) {
          // Try to restore the previously selected destination
          const previousDestination = availableDestinations.find(d => d.destinationId === currentDestinationId);
          if (previousDestination) {
            console.log('🎯 Restoring previous destination selection:', previousDestination.destinationName);
            setSelectedDestination(previousDestination);
            setSelectedQueueDestination(previousDestination.destinationId);
            fetchQueueForDestination(previousDestination.destinationId);
            
            // Also restore vehicle selection if it was previously selected
            if (selectedVehicle) {
              console.log('🚗 Checking if previously selected vehicle still exists:', selectedVehicle.licensePlate);
              // The vehicle selection will be validated when the queue data is fetched
            }
          } else {
            console.log('⚠️ Previous destination no longer available, auto-selecting first');
            if (availableDestinations.length > 0) {
              handleDestinationSelect(availableDestinations[0]);
            }
          }
        } else {
          // Try to restore from localStorage if no current selection
          const { destinationData, vehicleData } = restoreSelectionState();
          
          if (destinationData) {
            const restoredDestination = availableDestinations.find(d => d.destinationId === destinationData.destinationId);
            if (restoredDestination) {
              console.log('🔄 Restoring destination from localStorage:', restoredDestination.destinationName);
              setSelectedDestination(restoredDestination);
              setSelectedQueueDestination(restoredDestination.destinationId);
              fetchQueueForDestination(restoredDestination.destinationId);
              
              // Restore vehicle selection if it exists
              if (vehicleData) {
                console.log('🔄 Restoring vehicle from localStorage:', vehicleData.licensePlate);
                setSelectedVehicle(vehicleData);
                setAvailableSeats(vehicleData.availableSeats);
              }
            } else {
              console.log('⚠️ Saved destination no longer available, auto-selecting first');
              if (availableDestinations.length > 0) {
                handleDestinationSelect(availableDestinations[0]);
              }
            }
          } else if (availableDestinations.length > 0 && !selectedDestination && !isUpdatingData) {
            // Auto-select first destination only if no destination is currently selected and not updating data
            console.log('🎯 Auto-selecting first destination:', availableDestinations[0].destinationName);
            handleDestinationSelect(availableDestinations[0]);
          } else if (selectedDestination) {
            console.log('🎯 Maintaining current destination selection during refresh:', selectedDestination.destinationName);
            // Ensure the current selection is saved
            saveSelectionState(selectedDestination, selectedVehicle);
          }
        }
    } catch (error: any) {
      console.error('❌ [MAIN BOOKING DEBUG] Error fetching destinations:', error);
      setDestinations([]);
    } finally {
      setIsLoading(false);
      setIsFetchingDestinations(false);
      setIsUpdatingData(false);
    }
  };

  // Fetch routes for pricing
  const fetchRoutes = async () => {
    try {
      const response = await api.getAllRoutes();
      if (response.success && response.data) {
        setRoutes(response.data);
        console.log('📍 Routes loaded:', response.data.length);
      }
    } catch (error) {
      console.error('❌ Error fetching routes:', error);
    }
  };

  // Fetch available governments and delegations
  const fetchGovernments = async () => {
    try {
      const response = await api.getAllLocations();
      if (response.success && response.data) {
        setGovernments(response.data);
        console.log(`🏛️ Fetched ${response.data.length} governments`);
      }
    } catch (error) {
      console.error('❌ Error fetching governments:', error);
    }
  };

  // Handle government selection change
  const handleGovernmentChange = (governmentName: string) => {
    setSelectedGovernment(governmentName);
    setSelectedDelegation(''); // Reset delegation when government changes
    
    if (governmentName) {
      const selectedGov = governments.find(gov => gov.name === governmentName);
      if (selectedGov) {
        setAvailableDelegations(selectedGov.delegations);
      }
    } else {
      setAvailableDelegations([]);
    }
  };

  // Handle delegation selection change
  const handleDelegationChange = (delegationName: string) => {
    setSelectedDelegation(delegationName);
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedGovernment('');
    setSelectedDelegation('');
    setAvailableDelegations([]);
  };

  // Optimized function to update only if destinations have actually changed
  const updateDestinationsIfChanged = async () => {
    try {
      const filters: { governorate?: string; delegation?: string } = {};
      if (selectedGovernment) {
        filters.governorate = selectedGovernment;
      }
      if (selectedDelegation) {
        filters.delegation = selectedDelegation;
      }
      
      const response = await api.getAvailableDestinationsForBooking(filters);
      if (response.success && response.data) {
        const availableDestinations = response.data.filter((dest: Destination) => dest.totalAvailableSeats > 0);
        
        // Only update if the destinations have actually changed
        const currentIds = destinations.map((d: Destination) => d.destinationId).sort();
        const newIds = availableDestinations.map((d: Destination) => d.destinationId).sort();
        const currentSeats = destinations.map((d: Destination) => `${d.destinationId}:${d.totalAvailableSeats}`).sort();
        const newSeats = availableDestinations.map((d: Destination) => `${d.destinationId}:${d.totalAvailableSeats}`).sort();
        
        const idsChanged = JSON.stringify(currentIds) !== JSON.stringify(newIds);
        const seatsChanged = JSON.stringify(currentSeats) !== JSON.stringify(newSeats);
        
        if (idsChanged || seatsChanged) {
          setDestinations(availableDestinations);
          console.log(`📍 Updated destinations: ${availableDestinations.length} available (changes detected)`);
          
          // Check if selected destination is still valid
          if (selectedDestination) {
            const stillAvailable = availableDestinations.find((dest: Destination) => dest.destinationId === selectedDestination.destinationId);
            if (!stillAvailable) {
              console.log(`⚠️ Selected destination ${selectedDestination.destinationName} is no longer available, clearing selection`);
              setSelectedDestination(null);
              setShowSuccess(false);
            } else if (stillAvailable.totalAvailableSeats !== selectedDestination.totalAvailableSeats) {
              setSelectedDestination(stillAvailable);
              fetchAvailableSeats(stillAvailable.destinationId);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error updating destinations:', error);
    }
  };

  // Fetch available seats and base price for selected destination
  const fetchAvailableSeats = async (destinationId: string) => {
    // Derive sub-route from selected destination label like "KSAR HLEL (BOUHJAR)"
    let subRouteParam: string | undefined = undefined;
    if (selectedDestination?.destinationName) {
      const m = selectedDestination.destinationName.match(/^.*\(([^)]+)\)\s*$/);
      if (m && m[1]) {
        subRouteParam = m[1].toUpperCase().trim();
      }
    }
    const response = await dbClient.getAvailableSeatsForDestination(destinationId, subRouteParam);
    if (response && typeof response.totalAvailableSeats !== 'undefined') {
      const newAvailableSeats = response.totalAvailableSeats || 0;
      setAvailableSeats(newAvailableSeats);
      
      // Preserve current seat selection if it's still valid, otherwise reset to 1
      setBookingData(prev => {
        console.log('🔄 fetchAvailableSeats - checking seat selection:', {
          previousSeats: prev.seats,
          newAvailableSeats,
          willKeepSelection: prev.seats > 0 && prev.seats <= newAvailableSeats
        });
        
        if (prev.seats > 0 && prev.seats <= newAvailableSeats) {
          // Keep current selection if it's still valid
          console.log('✅ Keeping previous seat selection:', prev.seats);
          return prev;
        } else {
          // Reset to 1 if no valid selection or no seats available
          const newSeats = newAvailableSeats > 0 ? 1 : 0;
          console.log('🔄 Resetting seat selection to:', newSeats);
          return { seats: newSeats };
        }
      });
      
      if (response.vehicles && response.vehicles.length > 0) {
        setBasePrice(response.vehicles[0].basePrice || 0);
      } else {
        setBasePrice(0);
      }
    } else {
      setAvailableSeats(0);
      setBookingData({ seats: 0 });
      setBasePrice(0);
    }
  };

  // MQTT removed for DB-direct flow

  // Initial fetch and data loading
  useEffect(() => {
    // Restore selection state from localStorage on component mount
    const { destinationData, vehicleData } = restoreSelectionState();
    
    fetchGovernments();
    fetchDestinations();
    fetchRoutes();

    // Start WebSocket realtime listening
    const initializeRealtime = async () => {
      try {
        // Initialize WebSocket connection
        await websocketDbClient.initializeWebSocket('Main Booking App');
        setWebsocketConnected(true);
        setRealtimeConnected(true);
        console.log('✅ WebSocket realtime listening started');
        
        // Set up WebSocket connection status monitoring
        const statusInterval = setInterval(() => {
          const status = websocketDbClient.getWebSocketStatus();
          setWebsocketConnected(status.connected);
        }, 1000);
        
        // Set up network discovery status monitoring
        const discoveryInterval = setInterval(async () => {
          try {
            const discoveryStatus = await websocketDbClient.getNetworkDiscoveryStatus();
            setDiscoveredApps(discoveryStatus.discoveredApps);
            setBestServer(discoveryStatus.bestServer);
          } catch (error) {
            console.warn('⚠️ Failed to get network discovery status:', error);
          }
        }, 5000); // Check every 5 seconds
        
        // Store intervals for cleanup
        (window as any).websocketStatusInterval = statusInterval;
        (window as any).discoveryStatusInterval = discoveryInterval;
        
        // Also start the old realtime listening as fallback
        try {
          await dbClient.startRealtimeListening();
          console.log('✅ Fallback realtime listening started');
        } catch (fallbackError) {
          console.warn('⚠️ Fallback realtime listening failed:', fallbackError);
        }
      } catch (error) {
        console.error('❌ Failed to start WebSocket realtime listening:', error);
        setRealtimeConnected(false);
        
        // Try fallback
        try {
          await dbClient.startRealtimeListening();
          setRealtimeConnected(true);
          console.log('✅ Fallback realtime listening started');
        } catch (fallbackError) {
          console.error('❌ Fallback realtime listening also failed:', fallbackError);
        }
      }
    };

    initializeRealtime();

    // Set up WebSocket realtime event listeners
    const websocketBookingUnlisten = websocketDbClient.onWebSocketEvent('booking-change', (event: any) => {
      console.log('📊 WebSocket booking change received:', event);
      setLastUpdateTime(new Date().toLocaleTimeString());
      
      // Update destinations if this affects the current destination
      if (selectedDestination && event.destination_id === selectedDestination.destinationId) {
        fetchAvailableSeats(selectedDestination.destinationId);
        // Refresh destinations to get updated seat counts
        fetchDestinations();
      }
    });

    const websocketVehicleUnlisten = websocketDbClient.onWebSocketEvent('vehicle-change', (event: any) => {
      console.log('🚗 WebSocket vehicle change received:', event);
      setLastUpdateTime(new Date().toLocaleTimeString());
      
      // Refresh queue data if this affects the current destination
      if (selectedDestination && event.destination_id === selectedDestination.destinationId) {
        fetchAvailableSeats(selectedDestination.destinationId);
        fetchQueueForDestination(selectedDestination.destinationId);
      }
    });

    const websocketRealtimeUnlisten = websocketDbClient.onWebSocketEvent('realtime-event', (event: any) => {
      console.log('🔔 WebSocket realtime event received:', event);
      setLastUpdateTime(new Date().toLocaleTimeString());
      
      // Handle different event types
      switch (event.event_type) {
        case 'INSERT':
        case 'UPDATE':
        case 'DELETE':
          if (event.table === 'bookings') {
            // Refresh destinations when bookings change
            fetchDestinations();
            if (selectedDestination) {
              fetchAvailableSeats(selectedDestination.destinationId);
            }
          } else if (event.table === 'vehicle_queue') {
            // Refresh queue when vehicle queue changes
            if (selectedDestination) {
              fetchQueueForDestination(selectedDestination.destinationId);
            }
          }
          break;
      }
    });

    // Set up fallback realtime event listeners
    const bookingUpdateUnlisten = dbClient.onBookingUpdate((event: BookingUpdateEvent) => {
      console.log('📊 Fallback booking update received:', event);
      setLastUpdateTime(new Date().toLocaleTimeString());
      
      // Update destinations if this affects the current destination
      if (selectedDestination && event.destination_id === selectedDestination.destinationId) {
        fetchAvailableSeats(selectedDestination.destinationId);
        // Update the destination in the list
        setDestinations(prev => prev.map(dest => 
          dest.destinationId === event.destination_id 
            ? { ...dest, totalAvailableSeats: event.available_seats, vehicleCount: event.vehicle_count }
            : dest
        ));
      }
    });

    const queueUpdateUnlisten = dbClient.onQueueUpdate((event: QueueUpdateEvent) => {
      console.log('🚗 Fallback queue update received:', event);
      setLastUpdateTime(new Date().toLocaleTimeString());
      
      // Refresh queue data if this affects the current destination
      if (selectedDestination && event.destination_id === selectedDestination.destinationId) {
        fetchAvailableSeats(selectedDestination.destinationId);
      }
    });

    // Reduced refresh interval from 15s to 30s to improve performance
    const refreshInterval = setInterval(() => {
      debouncedFetchDestinations(1000); // Debounce the refresh
      dbClient.health().then(setDbOk).catch(() => setDbOk(false));
    }, 30000);

    // Cleanup
    return () => { 
      if (refreshInterval) clearInterval(refreshInterval as any);
      if (fetchDestinationsTimeout) clearTimeout(fetchDestinationsTimeout);
      
      // Cleanup WebSocket status monitoring
      if ((window as any).websocketStatusInterval) {
        clearInterval((window as any).websocketStatusInterval);
      }
      
      // Cleanup network discovery status monitoring
      if ((window as any).discoveryStatusInterval) {
        clearInterval((window as any).discoveryStatusInterval);
      }
      
      // Cleanup WebSocket listeners
      websocketBookingUnlisten();
      websocketVehicleUnlisten();
      websocketRealtimeUnlisten();
      
      // Cleanup fallback listeners
      bookingUpdateUnlisten.then(unlisten => unlisten());
      queueUpdateUnlisten.then(unlisten => unlisten());
      
      // Stop realtime listening
      dbClient.stopRealtimeListening().catch(console.error);
      websocketDbClient.disconnectWebSocket();
    };
  }, []); // Removed dependencies to prevent unnecessary re-runs

  // When a destination is selected, fetch its available seats
  useEffect(() => {
    if (selectedDestination) {
      fetchAvailableSeats(selectedDestination.destinationId);
    }
  }, [selectedDestination]);

  // Validate vehicle selection when queue data changes
  useEffect(() => {
    if (queues && Object.keys(queues).length > 0) {
      validateVehicleSelection();
    }
  }, [queues, selectedVehicle, selectedDestination]);

  // When filters change, debounced refetch destinations
  useEffect(() => {
    debouncedFetchDestinations(300); // Short delay for filter changes
  }, [selectedGovernment, selectedDelegation]);

  // Check if selected destination becomes fully booked - but don't clear selection immediately
  useEffect(() => {
    if (selectedDestination && availableSeats === 0) {
      console.log(`⚠️ Selected destination ${selectedDestination.destinationName} is now fully booked, but maintaining selection`);
      // Don't clear the selection immediately - let the user decide
      // The selection will be maintained and they can try again later
    }
  }, [selectedDestination, availableSeats]);

  // TODO: Replace with MQTT connection logic

  // Removed aggressive refresh on user interaction to improve performance
  // Only refresh when necessary (booking operations, filter changes, etc.)

  // Keyboard shortcuts for numberpad
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[contenteditable]')
      ) {
        return;
      }

      // AZERTY shortcuts for destination selection (A, Z, E, R, T, Y, U, I)
      const destinationKeys = ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i'];
      const destinationIndex = destinationKeys.indexOf(event.key.toLowerCase());
      if (destinationIndex !== -1 && destinations[destinationIndex]) {
        event.preventDefault();
        handleDestinationSelect(destinations[destinationIndex]);
      }

      // Alt + number for seat selection (1-8)
      if (event.altKey && event.key >= '1' && event.key <= '8') {
        const seatCount = parseInt(event.key);
        console.log('🎹 Keyboard shortcut detected:', {
          key: event.key,
          seatCount,
          availableSeats,
          isProcessing,
          currentBookingData: bookingData
        });
        
        if (seatCount <= availableSeats && !isProcessing) {
          event.preventDefault();
          console.log('✅ Setting seat count to:', seatCount);
          setBookingData({ seats: seatCount });
          
          // If this is a booking action (Alt + number + Space), handle it immediately
          // We'll use a flag to track this
          if (event.altKey) {
            // Store the seat count for immediate use
            (window as any).pendingSeatCount = seatCount;
            console.log('🎯 Stored pending seat count:', seatCount);
          }
        } else {
          console.log('❌ Seat selection blocked:', {
            reason: seatCount > availableSeats ? 'Not enough seats available' : 'Processing in progress',
            seatCount,
            availableSeats,
            isProcessing
          });
        }
      }

      // Spacebar for booking
      if (event.code === 'Space' && selectedDestination && !isProcessing) {
        event.preventDefault();
        handleBookingSubmit();
      }

      // F12 to toggle shortcuts help
      if (event.key === 'F12') {
        event.preventDefault();
        setShowShortcuts(!showShortcuts);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [destinations, availableSeats, selectedDestination, isProcessing]);

  const handleDestinationSelect = (destination: Destination | null) => {
    console.log("🎯 Destination selected:", destination);
    if (destination) {
      console.log("🎯 Destination details:", {
        destinationId: destination.destinationId,
        destinationName: destination.destinationName,
        baseDestinationName: destination.baseDestinationName,
        subRouteName: destination.subRouteName,
        totalAvailableSeats: destination.totalAvailableSeats
      });
    }
    
    setSelectedDestination(destination);
    setCurrentDestinationId(destination?.destinationId || null);
    setShowSuccess(false);
    setLastBookingData(null); // Clear any previous booking data
    
    // Save selection state
    saveSelectionState(destination, selectedVehicle);
    
    // Fetch queue data for the selected destination
    if (destination) {
      setSelectedQueueDestination(destination.destinationId);
      fetchQueueForDestination(destination.destinationId);
    } else {
      setSelectedQueueDestination(null);
    }
  };

  const handleSeatsChange = (change: number) => {
    setBookingData(prev => ({
      seats: Math.max(1, Math.min(availableSeats, prev.seats + change))
    }));
  };

  const calculateTotal = () => {
    return basePrice * bookingData.seats;
  };

  // Helper function to log booking ticket data for development
  const logBookingTicketData = async (booking: any) => {
    try {
      const thermalData = {
        ticketNumber: booking.verificationCode || booking.ticketId || booking.id || 'UNKNOWN',
        licensePlate: booking.vehicleLicensePlate || 'N/A',
        stationName: booking.startStationName || 'Station Actuelle',
        datetime: new Date(booking.bookingTime || booking.createdAt || new Date()),
        ticketType: 'booking',
        queuePosition: undefined,
        nextVehicle: undefined,
        price: booking.basePrice || booking.totalAmount || 0, // Use basePrice for single seat
        departureStation: booking.startStationName || 'Station Actuelle',
        destinationStation: booking.destinationName,
        customerName: booking.customerName,
        // Remove seatsBooked field - each ticket is for 1 seat only
        verificationCode: booking.verificationCode,
        seatNumber: booking.seatNumber || 1 // Add seat number for individual tickets
      };

      console.log('Individual seat ticket data prepared for printing:', thermalData);
      console.log('Full booking data:', booking);
      
      // Fallback to browser print
    } catch (error) {
      console.error('Failed to log booking ticket data:', error);
    }
  };

  // Print ticket with thermal printer
  async function printTicket(booking: any) {
    console.log('🖨️ Starting printTicket function...');
    console.log('📋 Booking data received:', booking);
    
    try {
      // Format booking data for thermal printing
      console.log('📝 Formatting booking data...');
      const ticketData = thermalPrinter.formatBookingTicketData(booking);
      console.log('📄 Formatted ticket data:', ticketData);
      
      // Format talon data for thermal printing
      console.log('📝 Formatting talon data...');
      const talonData = thermalPrinter.formatTalonData(booking);
      console.log('📄 Formatted talon data:', talonData);
      
      // Print main ticket with thermal printer
      console.log('🖨️ Calling thermal printer for main ticket...');
      const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
      const mainTicketResult = await thermalPrinter.printBookingTicket(ticketData, staffName);
      console.log('✅ Main ticket printed:', mainTicketResult);
      
      // Small delay to ensure main ticket is fully printed before talon
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Print talon (detachable stub) with thermal printer
      console.log('🖨️ Calling thermal printer for talon...');
      console.log('📄 Talon data to print:', talonData);
      console.log('👤 Staff name for talon:', staffName);
      try {
      const talonResult = await thermalPrinter.printTalon(talonData, staffName);
        console.log('✅ Talon printed successfully:', talonResult);
      } catch (talonError) {
        console.error('❌ Talon printing failed:', talonError);
        console.error('❌ Talon error details:', talonError instanceof Error ? talonError.message : 'Unknown error');
        // Don't throw - continue with the booking even if talon fails
      }
      
      console.log('✅ Booking ticket and talon printed successfully with thermal printer');
      
    } catch (error) {
      console.error('❌ Thermal printer error:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'Unknown stack');
      
      
    }
  }

  // Reprint last booking ticket
  async function reprintLastBookingTicket() {
    try {
      await thermalPrinter.reprintLastBooking();
      console.log('✅ Reprinted last booking ticket');
    } catch (error) {
      console.error('❌ Failed to reprint last booking ticket:', error);
    }
  }

  // Show OS notification after exit pass prints
  const notifyExitPassPrinted = (licensePlate: string, destinationName: string) => {
    try {
      const show = () => new Notification('Exit pass printed', {
        body: `Vehicle ${licensePlate} → ${destinationName}`
      });
      if ('Notification' in window) {
        if (Notification.permission === 'granted') show();
        else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => { if (p === 'granted') show(); });
        }
      }
    } catch {}
  };

  // Print exit pass directly (without modal), using current route pricing
  const printExitPassDirectForVehicle = async (licensePlate: string, destinationName: string) => {
    try {
      const basePricePerSeat = getBasePriceForDestination(destinationName) || 0;
      const totalSeats = 8; // Default when not available in response
      const totalBasePrice = basePricePerSeat * totalSeats;

      const exitPassData = {
        licensePlate,
        destinationName,
        previousLicensePlate: null,
        previousExitTime: null,
        currentExitTime: new Date().toISOString(),
        totalSeats,
        basePricePerSeat,
        totalBasePrice
      };

      const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
      const exitPassTicketData = thermalPrinter.formatExitPassTicketData(exitPassData);
      await thermalPrinter.printExitPassTicket(exitPassTicketData, staffName);
      notifyExitPassPrinted(licensePlate, destinationName);
      console.log('✅ Exit pass printed after booking');
    } catch (error) {
      console.error('❌ Failed to auto-print exit pass after booking:', error);
    }
  };

  // Cancel last booking
  const handleCancelLastBooking = async (seatsToCancel?: number) => {
    if (!lastBookingData || !lastBookingData.bookings.length) {
      alert('❌ Aucune réservation à annuler');
      return;
    }

    const totalSeatsToCancel = seatsToCancel || lastBookingData.totalSeats;
    const isPartialCancel = seatsToCancel && seatsToCancel < lastBookingData.totalSeats;
    
    // More user-friendly confirmation messages
    let confirmMessage: string;
    if (isPartialCancel) {
      if (seatsToCancel === 1) {
        confirmMessage = `Annuler 1 place de votre réservation ?\n\n✅ Garder : ${lastBookingData.totalSeats - 1} place${lastBookingData.totalSeats - 1 > 1 ? 's' : ''}\n❌ Annuler : 1 place\n\n💰 Remboursement d'environ ${(lastBookingData.totalAmount / lastBookingData.totalSeats).toFixed(3)} TND`;
      } else {
        confirmMessage = `Annuler ${seatsToCancel} places de votre réservation ?\n\n✅ Garder : ${lastBookingData.totalSeats - seatsToCancel} place${lastBookingData.totalSeats - seatsToCancel > 1 ? 's' : ''}\n❌ Annuler : ${seatsToCancel} place${seatsToCancel > 1 ? 's' : ''}\n\n💰 Remboursement d'environ ${((lastBookingData.totalAmount / lastBookingData.totalSeats) * seatsToCancel).toFixed(3)} TND`;
      }
    } else {
      confirmMessage = `Annuler toute la réservation ?\n\n❌ Annuler : ${lastBookingData.totalSeats} place${lastBookingData.totalSeats > 1 ? 's' : ''}\n💰 Remboursement total : ${lastBookingData.totalAmount.toFixed(3)} TND\n\n🪑 Toutes les places seront remises en file d'attente.`;
    }

    if (!confirm(confirmMessage)) {
      return;
    }

      setIsCancelingSeat(true);

    try {
      // Cancel bookings one by one (since each booking might be on different vehicles)
      let totalCancelledSeats = 0;
      let totalRefundAmount = 0;
      const cancelResults = [];

      for (const booking of lastBookingData.bookings) {
        const bookingSeats = booking.seatsBooked;
        let seatsToRemoveFromThisBooking = 0;

        if (totalCancelledSeats < totalSeatsToCancel) {
          seatsToRemoveFromThisBooking = Math.min(
            bookingSeats,
            totalSeatsToCancel - totalCancelledSeats
          );

          console.log(`🚫 Cancelling ${seatsToRemoveFromThisBooking} seats from booking ${booking.id}`);

          const response = await (async () => {
            try {
              await dbClient.cancelQueueBooking(booking.id);
              return { success: true } as any;
            } catch (e: any) {
              return { success: false, message: e?.message } as any;
            }
          })();

          if (response.success) {
            cancelResults.push({
              success: true,
              booking: booking,
              seatsCancelled: seatsToRemoveFromThisBooking,
              data: response.data
            });
            totalCancelledSeats += seatsToRemoveFromThisBooking;
            totalRefundAmount += (booking.totalAmount / booking.seatsBooked) * seatsToRemoveFromThisBooking;
          } else {
            cancelResults.push({
              success: false,
              booking: booking,
              error: response.message || 'Failed to cancel booking'
            });
            console.error(`❌ Failed to cancel booking ${booking.id}:`, response.message);
          }
        }
      }

      // Check if all cancellations were successful
      const successfulCancellations = cancelResults.filter(r => r.success);
      const failedCancellations = cancelResults.filter(r => !r.success);

      if (successfulCancellations.length > 0) {
        let message: string;
        if (isPartialCancel && totalCancelledSeats < lastBookingData.totalSeats) {
          if (totalCancelledSeats === 1) {
            message = `✅ 1 place annulée avec succès !\n\n🪑 Places restantes : ${lastBookingData.totalSeats - totalCancelledSeats}\n💰 Remboursement : ${totalRefundAmount.toFixed(3)} TND\n\n📋 Votre réservation est maintenant de ${lastBookingData.totalSeats - totalCancelledSeats} place${lastBookingData.totalSeats - totalCancelledSeats > 1 ? 's' : ''}.`;
          } else {
            message = `✅ ${totalCancelledSeats} places annulées avec succès !\n\n🪑 Places restantes : ${lastBookingData.totalSeats - totalCancelledSeats}\n💰 Remboursement : ${totalRefundAmount.toFixed(3)} TND`;
          }
        } else {
          message = `✅ Réservation annulée complètement !\n\n🪑 ${totalCancelledSeats} place${totalCancelledSeats > 1 ? 's' : ''} remise${totalCancelledSeats > 1 ? 's' : ''} en file d'attente\n💰 Remboursement total : ${totalRefundAmount.toFixed(3)} TND`;
        }

        alert(message);

        // Update lastBookingData if partial cancel
        if (isPartialCancel && totalCancelledSeats < lastBookingData.totalSeats) {
          // Update the booking data to reflect remaining seats
          const updatedBookings = lastBookingData.bookings.map(booking => {
            const result = successfulCancellations.find(r => r.booking.id === booking.id);
            if (result && result.data?.updatedBooking) {
              return result.data.updatedBooking;
            }
            return booking;
          }).filter(booking => booking.seatsBooked > 0); // Remove fully cancelled bookings

          setLastBookingData({
            bookings: updatedBookings,
            totalSeats: lastBookingData.totalSeats - totalCancelledSeats,
            totalAmount: lastBookingData.totalAmount - totalRefundAmount
          });
        } else {
          // Complete cancellation - clear success state
          setShowSuccess(false);
          setLastBookingData(null);
          setSelectedDestination(null);
        }
      }

      if (failedCancellations.length > 0) {
        const errorMessage = `⚠️ Some cancellations failed:\n\n${failedCancellations.map(f => `• ${f.error}`).join('\n')}`;
        alert(errorMessage);
      }

    } catch (error: any) {
      console.error('❌ Cancel booking error:', error);
      
      // Extract meaningful error message
      let errorMessage = 'Unknown error occurred';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.toString) {
        errorMessage = error.toString();
      }
      
      alert(`❌ Network Error!\n\nFailed to cancel booking: ${errorMessage}\n\nPlease check your connection and try again.`);
    } finally {
      setIsCancelingSeat(false);
    }
  };

  // Cancel seat from destination
  const handleCancelSeatFromDestination = async (destinationId: string) => {
    if (!currentStaff) {
      alert('❌ Erreur: Aucun membre du personnel connecté');
      return;
    }

    if (!confirm('Annuler 1 place de cette destination ?\n\nCette action ne peut pas être annulée.')) {
      return;
    }

    try {
      console.log('🚫 Cancelling seat from destination:', destinationId, 'by staff:', currentStaff.id);
      const result = await dbClient.cancelSeatFromDestination(destinationId, currentStaff.id);
      
      alert(`✅ ${result}`);
      
      // Refresh destinations to update availability
      fetchDestinations();
      
      // If this was the selected destination, refresh its queue data
      if (selectedDestination?.destinationId === destinationId) {
        fetchQueueForDestination(destinationId);
      }
      
    } catch (error: any) {
      console.error('❌ Failed to cancel seat:', error);
      
      // Extract meaningful error message
      let errorMessage = 'Erreur inconnue';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.toString) {
        errorMessage = error.toString();
      }
      
      // Handle specific access denied errors
      if (errorMessage.includes('Accès refusé') || errorMessage.includes('n\'est plus dans la file d\'attente')) {
        alert(`❌ ${errorMessage}`);
      } else if (errorMessage.includes('Aucune réservation trouvée')) {
        alert(`❌ ${errorMessage}`);
      } else {
        alert(`❌ Erreur lors de l'annulation: ${errorMessage}`);
      }
    }
  };

  const handleBookingSubmit = async () => {
    if (!selectedDestination || !currentStaff) return;

    // Check if there's a pending seat count from keyboard shortcut
    const pendingSeatCount = (window as any).pendingSeatCount;
    const seatsToBook = pendingSeatCount || bookingData.seats;
    
    // Clear the pending seat count
    if (pendingSeatCount) {
      (window as any).pendingSeatCount = null;
      console.log('🎯 Using pending seat count:', pendingSeatCount);
    }

    console.log('🎫 Submitting booking with data:', {
      destinationId: selectedDestination.destinationId,
      seatsRequested: seatsToBook,
      staffId: currentStaff.id,
      bookingData,
      pendingSeatCount
    });

    setIsProcessing(true);

    // Snapshot before booking for reconciliation
    const preBookingSnapshot = (() => {
      const dest = destinations.find(d => d.destinationId === selectedDestination.destinationId);
      return dest ? {
        destinationId: dest.destinationId,
        destinationName: dest.destinationName,
        seatsBefore: dest.totalAvailableSeats
      } : null;
    })();

    try {
      let response;
      
      // If a specific vehicle is selected, book only from that vehicle
      if (selectedVehicle) {
        console.log('🎫 Booking for specific vehicle:', selectedVehicle);
        response = await dbClient.createVehicleSpecificBooking(
          selectedVehicle.queueId,
          seatsToBook,
          currentStaff?.id
        );
      } else {
        // Fallback to general queue booking (books from first available vehicle)
        console.log('🎫 Booking from general queue (first available vehicle)');
        response = await dbClient.createQueueBooking(
          selectedDestination.destinationId,
          seatsToBook,
          currentStaff?.id
        );
      }

      if (response && response.bookings) {
        console.log('✅ Booking created successfully:', response);
        setShowSuccess(true);
        
        // Store booking data for cancel functionality
        setLastBookingData({
          bookings: response.bookings || [],
          totalSeats: seatsToBook,
          totalAmount: response.totalAmount || 0
        });

        // No local updates; rely on backend events. Trigger a refresh for server-truth.
        try { await refreshQueues(); } catch {}

        // Manual reconciliation: fetch latest destinations and detailed queue for the focused destination
        try {
          await fetchDestinationsWithoutAutoSelect();
          if (selectedDestination) {
            await fetchQueueForDestination(selectedDestination.destinationId);
          }
        } catch {}
        
        // Ensure the selected destination remains focused after refresh
        if (selectedDestination) {
          console.log('🎯 Maintaining focus on destination:', selectedDestination.destinationName);
          // The destination should remain selected, just refresh its queue data
          await fetchQueueForDestination(selectedDestination.destinationId);
        }

        // Compare expected seats with latest
        try {
          if (preBookingSnapshot && selectedDestination) {
            const after = destinations.find(d => d.destinationId === preBookingSnapshot.destinationId);
            const expectedSeats = Math.max(0, (preBookingSnapshot.seatsBefore || 0) - seatsToBook);
            if (after && after.totalAvailableSeats !== expectedSeats) {
              console.warn('⚠️ Reconciliation mismatch after booking:', {
                destination: preBookingSnapshot.destinationName,
                beforeSeats: preBookingSnapshot.seatsBefore,
                seatsBooked: seatsToBook,
                expectedSeats,
                actualSeats: after.totalAvailableSeats
              });
              // Try one more refresh to resolve any race
              try {
                await refreshQueues();
                await fetchDestinations();
                await fetchQueueForDestination(preBookingSnapshot.destinationId);
              } catch {}
            } else if (after) {
              console.log('✅ Reconciliation OK:', {
                destination: preBookingSnapshot.destinationName,
                beforeSeats: preBookingSnapshot.seatsBefore,
                seatsBooked: seatsToBook,
                actualSeats: after.totalAvailableSeats
              });
            }
          }
        } catch (reconErr) {
          console.warn('⚠️ Reconciliation check failed:', reconErr);
        }
        
        // Automatically print one ticket per seat after successful booking
        if (response.bookings && response.bookings.length > 0) {
          console.log('🎫 Booking successful, printing one ticket per seat...');
          console.log('📋 Number of seats to print tickets for:', seatsToBook);
          
          let successfulPrints = 0;
          const baseBooking = response.bookings[0];
          
          // Get the correct vehicle information for seat calculation
          const vehicleCapacity = baseBooking.vehicleCapacity || 8;
          const vehicleLicensePlate = baseBooking.vehicleLicensePlate || baseBooking.licensePlate;
          
          // Find the vehicle in the current queue to get accurate seat information
          let seatsAlreadyBooked = 0;
          if (selectedDestination && vehicleLicensePlate) {
            const normalizedDestination = normalizeDestinationName(selectedDestination.destinationName);
            const destinationQueues = queues[normalizedDestination] || [];
            const vehicleInQueue = destinationQueues.find(v => 
              v.licensePlate === vehicleLicensePlate
            );
            
            if (vehicleInQueue && vehicleInQueue.totalSeats && vehicleInQueue.availableSeats !== undefined) {
              // Calculate seats already booked BEFORE this booking
              // availableSeats is AFTER the booking, so seats already booked = total - (available + just booked)
              seatsAlreadyBooked = vehicleInQueue.totalSeats - (vehicleInQueue.availableSeats + seatsToBook);
              console.log(`🚗 Vehicle ${vehicleLicensePlate} info:`, {
                totalSeats: vehicleInQueue.totalSeats,
                availableSeats: vehicleInQueue.availableSeats,
                seatsJustBooked: seatsToBook,
                seatsAlreadyBooked: seatsAlreadyBooked
              });
            } else {
              console.warn(`⚠️ Could not find vehicle ${vehicleLicensePlate} in queue for seat calculation`);
              // Fallback: assume seats are booked sequentially from the beginning
              seatsAlreadyBooked = vehicleCapacity - seatsToBook;
            }
          } else {
            console.warn('⚠️ Missing vehicle information for seat calculation');
            // Fallback calculation
            seatsAlreadyBooked = vehicleCapacity - seatsToBook;
          }
          
          // Print one ticket for each seat (not per booking, but per seat)
          for (let seatNumber = 1; seatNumber <= seatsToBook; seatNumber++) {
            const actualSeatPosition = seatsAlreadyBooked + seatNumber;
            console.log(`🎫 Printing ticket ${seatNumber}/${seatsToBook} for seat ${actualSeatPosition}/${vehicleCapacity}`);
            console.log(`💰 Using single seat price: ${basePrice} TND (not total price)`);
            
            // Use the first booking as template but modify for individual seat
            const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'N/A';
            const serviceFee = 0.200; // Fixed 0.200 TND service fee per seat
            const individualSeatBooking = {
              ...baseBooking,
              // Remove seats field and treat as single seat
              seatsBooked: 1,
              baseAmount: basePrice, // Base price for one seat
              serviceFeeAmount: serviceFee, // Service fee for one seat
              totalAmount: basePrice + serviceFee, // Total price for one seat
              basePrice: basePrice, // Ensure basePrice is also set for one seat
              verificationCode: `${baseBooking.verificationCode}-${seatNumber}`, // Unique code per seat
              seatNumber: actualSeatPosition, // Actual seat position in vehicle
              seatIndex: seatNumber, // Index within this booking (1, 2, 3...)
              vehicleCapacity: vehicleCapacity, // Total vehicle capacity
              staffName: staffName // Add staff name for talon
            };
            
            try {
              await printTicket(individualSeatBooking);
              console.log(`✅ Ticket for seat ${seatNumber} printed successfully`);
              successfulPrints++;
              
              // Add a small delay between prints to avoid printer overload
              if (seatNumber < seatsToBook) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (printError) {
              console.error(`❌ Failed to print ticket for seat ${seatNumber}:`, printError);
              // Continue printing other tickets even if one fails
            }
          }
          
          // Set the number of tickets printed for the success message
          setTicketsPrinted(successfulPrints);
          console.log(`✅ ${successfulPrints}/${seatsToBook} tickets printed successfully`);

          // If backend indicates a vehicle became READY/fully booked, auto-print exit pass
          try {
            const destinationName = selectedDestination.destinationName;
            const licensePlate = baseBooking.vehicleLicensePlate || baseBooking.licensePlate || null;
            const vehicleFullyBooked = !!response.data.vehicleFullyBooked || (response.data.exitPasses && response.data.exitPasses.length > 0);
            if (vehicleFullyBooked && licensePlate) {
              // Enhanced exit pass printing with all required data
              const basePricePerSeat = getBasePriceForDestination(destinationName) || 0;
              const totalSeats = 8; // Default when not available in response
              const totalBasePrice = basePricePerSeat * totalSeats;

              const exitPassData = {
                licensePlate,
                destinationName,
                previousLicensePlate: null, // Will be filled by backend
                previousExitTime: null, // Will be filled by backend
                currentExitTime: new Date().toISOString(),
                totalSeats,
                basePricePerSeat,
                totalBasePrice
              };

              const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
              const exitPassTicketData = thermalPrinter.formatExitPassTicketData(exitPassData);
              await thermalPrinter.printExitPassTicket(exitPassTicketData, staffName);
              notifyExitPassPrinted(licensePlate, destinationName);
              console.log('✅ Enhanced exit pass printed after booking');
            }
          } catch (e) {
            console.warn('⚠️ Could not auto-print exit pass after booking:', e);
          }
        } else {
          console.log('⚠️ No booking data found in response for printing');
          console.log('📋 Available data keys:', Object.keys(response.data));
          setTicketsPrinted(0);
        }
        
        // Check if vehicle is now fully booked and trigger exit pass workflow
        // Add a small delay to ensure queue data is updated
        setTimeout(() => {
          checkForFullyBookedVehicle(selectedDestination.destinationId, seatsToBook, response.data);
        }, 1000);
        
        // Keep focus on the selected destination after booking
        // Only clear success state and reset booking data
        setTimeout(() => {
          setShowSuccess(false);
          setTicketsPrinted(0);
          setBookingData({ seats: 1 });
          
          // Ensure destination selection is maintained
          if (selectedDestination) {
            console.log('🎯 Maintaining destination selection after booking:', selectedDestination.destinationName);
            // Save the current destination selection to ensure it persists
            saveSelectionState(selectedDestination, selectedVehicle);
          }
          
          // Keep vehicle selection if it's still valid, otherwise clear it
          if (selectedVehicle) {
            // Check if the selected vehicle still exists in the queue
            const baseDestinationName = selectedDestination?.baseDestinationName || selectedDestination?.destinationName;
            const normalizedDestination = normalizeDestinationName(baseDestinationName || '');
            const destinationQueues = queues[normalizedDestination] || [];
            
            // Filter by sub-route if needed
            let filteredQueues = destinationQueues;
            if (selectedDestination?.subRouteName) {
              filteredQueues = destinationQueues.filter((q: any) => {
                const queueSubRoute = (q.subRouteName || q.subRoute || '').toString().toUpperCase().trim();
                return queueSubRoute === selectedDestination.subRouteName!.toUpperCase();
              });
            }
            
            const vehicleStillExists = filteredQueues.some((q: any) => q.id === selectedVehicle.queueId);
            
            if (!vehicleStillExists) {
              console.log('🚗 Selected vehicle no longer exists, clearing selection');
              setSelectedVehicle(null);
              // Save cleared vehicle selection
              saveSelectionState(selectedDestination, null);
            } else {
              console.log('🚗 Keeping vehicle selection:', selectedVehicle.licensePlate);
              // Save the maintained vehicle selection
              saveSelectionState(selectedDestination, selectedVehicle);
            }
          }
        }, 3000);
      } else {
        console.error('❌ Booking failed:', response.message);
        
        // Handle specific booking conflict errors
        if (response.message?.includes('Booking conflict') || 
            response.message?.includes('were just booked by another user')) {
          alert(`⚠️ Booking Conflict!\n\n${response.message}\n\nThe seat availability has been updated. Please select your seats again.`);
          
          // Keep destination selection but refresh data
          setShowSuccess(false);
          
          // Force refresh of destinations to show current availability
          fetchDestinations();
          
          // Refresh queue data for the current destination
          if (selectedDestination) {
            fetchQueueForDestination(selectedDestination.destinationId);
          }
        } else if (response.message?.includes('Not enough seats available')) {
          alert(`⚠️ Insufficient Seats!\n\n${response.message}\n\nPlease select fewer seats or choose a different destination.`);
          
          // Refresh available seats for the current destination
          if (selectedDestination) {
            fetchAvailableSeats(selectedDestination.destinationId);
          }
        } else {
          alert(`❌ Booking Failed!\n\n${response.message || 'Unknown error occurred'}\n\nPlease try again.`);
        }
      }
    } catch (error: any) {
      console.error('❌ Booking error:', error);
      
      // Extract meaningful error message
      let errorMessage = 'Unknown error occurred';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.toString) {
        errorMessage = error.toString();
      }
      
      alert(`❌ Network Error!\n\nFailed to process booking: ${errorMessage}\n\nPlease check your connection and try again.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const canBook = selectedDestination && !isProcessing;

  return (
    <div className="min-h-screen bg-muted dark:bg-background overflow-auto">
      {/* Header with Filters */}
      <div className="sticky top-0 z-10 bg-card dark:bg-card border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Réservation Principale</h1>
              <p className="text-gray-600 dark:text-gray-400">
                {destinations.length} destinations disponibles
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className={`w-2 h-2 rounded-full ${dbOk === false ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <span>DB {dbOk === false ? 'Fail' : 'OK'}</span>
                <span>•</span>
                <div className={`w-2 h-2 rounded-full ${websocketConnected ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                <span>WebSocket {websocketConnected ? 'ON' : 'OFF'}</span>
                <span>•</span>
                <div className={`w-2 h-2 rounded-full ${discoveredApps > 0 ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <span>Network {discoveredApps} app{discoveredApps !== 1 ? 's' : ''}</span>
                <span>•</span>
                <div className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <span>Temps réel {realtimeConnected ? 'ON' : 'OFF'}</span>
                <span>•</span>
                <span>Dernière mise à jour: {lastUpdateTime || 'Jamais'}</span>
                {bestServer && (
                  <>
                    <span>•</span>
                    <span className="text-blue-600">Serveur: {bestServer.replace('ws://', '')}</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Refresh Button */}
              <Button
                onClick={() => {
                  console.log('🔄 Manual refresh triggered');
                  fetchDestinations();
                  if (selectedDestination) {
                    fetchAvailableSeats(selectedDestination.destinationId);
                    fetchQueueForDestination(selectedDestination.destinationId);
                  }
                }}
                variant="outline"
                size="sm"
                className="bg-green-100 hover:bg-green-200 text-green-700 border-green-300"
                title="Refresh data manually"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              
          
              
              {currentStaff && (
                <div className="text-right">
                  <p className="font-semibold">{currentStaff.firstName} {currentStaff.lastName}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{currentStaff.role}</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Tab Navigation */}
      

        </div>
      </div>

      <div className={`max-w-7xl mx-auto p-4 sm:p-6 ${selectedDestination && activeTab === 'bookings' ? 'pb-32' : 'pb-6'}`}>


        {/* Unified Booking and Queue Management Interface - Single Screen Layout */}
        {activeTab === 'bookings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Left Side - Destination Selection Grid */}
          <div className="space-y-4">
              <h2 className="text-xl font-bold">Destinations Disponibles</h2>
              <div className={`grid gap-4 ${
                destinations.length <= 4 ? 'grid-cols-2' :
                destinations.length <= 6 ? 'grid-cols-3' :
                destinations.length <= 9 ? 'grid-cols-3' :
                'grid-cols-4'
              }`}>
                {destinations.map((destination: Destination, index: number) => (
                    <Card
                      key={destination.destinationId}
                    className={`relative cursor-pointer transition-colors duration-200 ${
                        selectedDestination?.destinationId === destination.destinationId 
                        ? 'ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-lg' 
                        : 'bg-white dark:bg-gray-900 ring-0 shadow-none hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => handleDestinationSelect(destination)}
                    >
                    <CardContent className="p-4 text-center">
                        <div className="space-y-2">
                        {/* AZERTY shortcut indicator */}
                        <div className="absolute top-2 right-2">
                          <Badge variant="outline" className="text-xs font-mono bg-blue-100 text-blue-700 border-blue-300">
                            {['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I'][index]}
                          </Badge>
                        </div>
                        
                        <h3 className="font-bold text-base leading-tight">{destination.destinationName}</h3>
                        {destination.subRouteName && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Sous-route: {destination.subRouteName}
                          </div>
                        )}
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-4 w-4 text-gray-600" />
                          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                            {destination.totalAvailableSeats} places
                          </p>
                        </div>
                        {selectedDestination?.destinationId === destination.destinationId && (
                          <div className="flex items-center justify-center gap-2">
                            <CheckCircle className="h-5 w-5 text-orange-600" />
                          </div>
                        )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
            </div>

              {/* Action panel below destination cards */}
              {selectedDestination && (
                <div className="mt-2 p-3 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelSeatFromDestination(selectedDestination.destinationId)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                    >
                      <X className="h-4 w-4 mr-1" /> Annuler 1 place
                    </Button>
                    {/* Transformer des sièges disabled for now */}
                  </div>
                  
                </div>
              )}
          </div>

            {/* Right Side - Queue Table */}
          <div className="space-y-4">
              <h2 className="text-xl font-bold">File d'Attente</h2>
              {selectedDestination?.subRouteName && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                    <MapPin className="w-4 h-4" />
                    <span className="font-medium">Sous-route active:</span>
                    <span className="font-bold">{selectedDestination.subRouteName}</span>
                  </div>
                </div>
              )}
              
              {/* Vehicle Selection Panel */}
              {selectedVehicle && (
                <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-green-800 dark:text-green-200">
                            Véhicule sélectionné: {selectedVehicle.licensePlate}
                          </h3>
                          <p className="text-sm text-green-600 dark:text-green-300">
                            Position {selectedVehicle.queuePosition} • {selectedVehicle.availableSeats} places disponibles
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {/* Clear Selection Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearVehicleSelection}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Annuler
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Instructions */}
              {selectedDestination && !selectedVehicle && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Edit className="w-4 h-4" />
                    <span>
                      <strong>Instructions:</strong> Cliquez sur un véhicule dans la file d'attente pour le sélectionner, puis utilisez le sélecteur de places en bas pour spécifier le nombre de places à réserver.
                    </span>
                  </div>
                </div>
              )}
              
              <Card>
                <CardContent className="p-0">
              {!selectedDestination ? (
                <div className="text-center py-12">
                      <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Sélectionnez une destination pour voir la file d'attente</p>
                </div>
                  ) : queueLoading ? (
                    <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-blue-600 mx-auto mb-4 animate-spin" />
                      <p className="text-gray-600">Chargement...</p>
                </div>
                  ) : queueError ? (
                    <div className="text-center py-8">
                      <p className="text-red-600">Erreur de chargement</p>
                      <Button onClick={() => fetchQueueForDestination(selectedDestination.destinationId)} className="mt-2" size="sm">
                        Réessayer
                      </Button>
                </div>
                  ) : (() => {
                    // Use the base destination name from the selected destination
                    const baseDestinationName = selectedDestination.baseDestinationName || selectedDestination.destinationName;
                    const selectedSubRouteName = selectedDestination.subRouteName;
                    const normalizedDestination = normalizeDestinationName(baseDestinationName);
                    let destinationQueues = queues[normalizedDestination] || [];
                    
                    // Filter by sub-route if one is selected
                    if (selectedSubRouteName) {
                      destinationQueues = destinationQueues.filter((q: any) => {
                        const queueSubRoute = (q.subRouteName || q.subRoute || '').toString().toUpperCase().trim();
                        return queueSubRoute === selectedSubRouteName.toUpperCase();
                      });
                      console.log(`🎯 Filtering queue for sub-route "${selectedSubRouteName}": ${destinationQueues.length} vehicles`);
                    } else {
                      // If no sub-route is specified, only show vehicles without sub-routes
                      destinationQueues = destinationQueues.filter((q: any) => {
                        const queueSubRoute = (q.subRouteName || q.subRoute || '').toString().trim();
                        return !queueSubRoute || queueSubRoute === '';
                      });
                      console.log(`🎯 Filtering queue for main station (no sub-route): ${destinationQueues.length} vehicles`);
                    }
                    
                    if (destinationQueues.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-600">Aucun véhicule en file d'attente</p>
                      </div>
                      );
                    }

                     return (
                       <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                         {/* Table Header */}
                         <div className="grid grid-cols-12 gap-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b-2 border-blue-200 dark:border-blue-700">
                           <div className="col-span-2 flex items-center gap-2 font-bold text-blue-800 dark:text-blue-200">
                             <Users className="h-4 w-4" />
                             Places Réservées
                          </div>
                           <div className="col-span-2 flex items-center gap-2 font-bold text-blue-800 dark:text-blue-200">
                             <Users className="h-4 w-4" />
                             Total Places
                        </div>
                           <div className="col-span-5 flex items-center gap-2 font-bold text-blue-800 dark:text-blue-200">
                             <Car className="h-4 w-4" />
                             Plaque d'Immatriculation
                          </div>
                           <div className="col-span-3 flex items-center gap-2 font-bold text-blue-800 dark:text-blue-200">
                             <Activity className="h-4 w-4" />
                             Statut
                        </div>
                          </div>
                         
                        {/* Table Rows */}
                        <div className="max-h-96 overflow-y-auto">
                          {destinationQueues.map((queue: any) => {
                            const getStatusBackground = (status: string) => {
                              switch (status) {
                                case 'WAITING': return 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-l-4 border-yellow-400';
                                case 'LOADING': return 'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-l-4 border-blue-400';
                                case 'READY': return 'bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-l-4 border-orange-400';
                                default: return 'bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-800 dark:to-slate-800 border-l-4 border-gray-400';
                              }
                            };
                            const getStatusTextColor = (status: string) => {
                              switch (status) {
                                case 'WAITING': return 'text-yellow-800 dark:text-yellow-200';
                                case 'LOADING': return 'text-blue-800 dark:text-blue-200';
                                case 'READY': return 'text-orange-800 dark:text-orange-200';
                                default: return 'text-gray-800 dark:text-gray-200';
                              }
                            };
                            const getStatusBadgeColor = (status: string) => {
                              switch (status) {
                                case 'WAITING': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
                                case 'LOADING': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
                                case 'READY': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
                                default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
                              }
                            };
                            const isSelected = selectedVehicle?.queueId === queue.id;
                            return (
                              <div key={queue.id} className={`grid grid-cols-12 gap-4 p-5 border-b border-gray-100 dark:border-gray-700 transition-all duration-200 hover:shadow-md cursor-pointer ${isSelected ? 'ring-2 ring-green-500 bg-green-50 dark:bg-green-900/20 shadow-lg' : 'hover:shadow-md'} ${getStatusBackground(queue.status)}`} onClick={() => handleVehicleSelect(queue)}>
                                <div className="col-span-2 flex items-center"><span className={`font-bold text-lg ${getStatusTextColor(queue.status)}`}>{queue.totalSeats - queue.availableSeats}</span></div>
                                <div className="col-span-2 flex items-center"><span className={`font-bold text-lg ${getStatusTextColor(queue.status)}`}>{queue.totalSeats}</span></div>
                                <div className="col-span-5 flex items-center justify-between">
                                  <div className="flex items-center gap-3 flex-1">
                                    {isSelected && (<div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"><CheckCircle className="w-4 h-4 text-white" /></div>)}
                                    <span className="font-mono text-base font-bold bg-white/50 dark:bg-gray-800/50 px-3 py-2 rounded border min-w-0 flex-1">{queue.licensePlate}</span>
                                    <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border text-gray-700 dark:text-gray-300"># {queue.queuePosition}</span>
                                  </div>
                                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20 p-2 flex-shrink-0" onClick={(e) => {
                                    e.stopPropagation();
                                    if (queue.status === 'READY' || queue.availableSeats === 0) { triggerExitPassWorkflow(queue, selectedDestination.destinationName); }
                                    else { setActionLoading(queue.vehicle.licensePlate); exitQueue(queue.vehicle.licensePlate).finally(() => setActionLoading(null)); }
                                  }} disabled={actionLoading === queue.vehicle.licensePlate || (queue.status !== 'WAITING' && queue.status !== 'READY') || vehiclesPendingExitConfirmation.has(queue.vehicle.licensePlate)}>
                                    {actionLoading === queue.vehicle.licensePlate ? (<Loader2 className="h-4 w-4 animate-spin" />) : queue.status === 'READY' ? (<Printer className="h-4 w-4" />) : (<X className="h-4 w-4" />)}
                                  </Button>
                                </div>
                                <div className="col-span-3 flex items-center"><Badge className={`text-sm font-semibold px-3 py-1 ${getStatusBadgeColor(queue.status)}`}>{queue.status === 'WAITING' ? 'En attente' : queue.status === 'LOADING' ? 'Chargement' : queue.status === 'READY' ? 'Complet - Prêt à sortir' : queue.status}</Badge></div>
                              </div>
                            );
                          })}
                        </div>
                         
                         {/* Table Footer */}
                         {destinationQueues.length > 0 && (
                           <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                             <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                               <span>
                                 {destinationQueues.length} véhicule{destinationQueues.length > 1 ? 's' : ''} en file d'attente
                               </span>
                               <span>
                                 Total places disponibles: {destinationQueues.reduce((sum, q) => sum + q.availableSeats, 0)}
                               </span>
                             </div>
                </div>
              )}
            </div>
                     );
                  })()}
                    </CardContent>
                  </Card>
          </div>
        </div>
        )}

        {/* Empty State - Only show on bookings tab */}
        {activeTab === 'bookings' && destinations.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
              Aucune destination avec des places disponibles
            </h3>
            <p className="text-gray-500">
              Toutes les destinations sont actuellement complètes. Vérifiez à nouveau dans quelques minutes.
                          </p>
                        </div>
        )}

        {/* Loading State - Only show on bookings tab */}
        {activeTab === 'bookings' && isLoading && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-blue-600 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-2">
              Chargement des destinations...
            </h3>
            <p className="text-gray-500 mb-4">
              Recherche des destinations avec des places disponibles
            </p>
            <div className="flex justify-center">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setIsLoading(false);
                  setIsFetchingDestinations(false);
                  fetchDestinations();
                }}
                className="text-blue-600 border-blue-300 hover:bg-blue-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Actualiser
              </Button>
            </div>
          </div>
        )}
                    </div>

            {/* Removed old vehicle seat management card in favor of the new action panel below destination cards */}

            {/* Bottom Booking Panel - Only show when destination is selected */}
      {selectedDestination && activeTab === 'bookings' && (
        <div className="fixed bottom-0 left-0 right-0 bg-card dark:bg-card border-t border-gray-200 dark:border-gray-700 shadow-xl">
          <div className="max-w-6xl mx-auto p-6">
                {showSuccess ? (
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-green-600 mb-2">Réservation réussie !</h3>
                <p className="text-gray-600 mb-2">
                  {ticketsPrinted > 0 
                    ? `${ticketsPrinted} billet${ticketsPrinted > 1 ? 's' : ''} individuel${ticketsPrinted > 1 ? 's' : ''} imprimé${ticketsPrinted > 1 ? 's' : ''} avec succès (1 billet par place)`
                    : 'Les billets ont été générés'
                  }
                </p>
                {lastBookingData && (
                  <div className="text-sm text-gray-500 mb-4">
                    <p>{lastBookingData.totalSeats} place{lastBookingData.totalSeats > 1 ? 's' : ''} • {lastBookingData.totalAmount.toFixed(3)} TND</p>
                  </div>
                )}
                <div className="mt-4 flex justify-center gap-3 flex-wrap">
                  {/* Reprint button */}
                  <Button onClick={reprintLastBookingTicket} variant="outline" className="flex items-center">
                    <Printer className="w-4 h-4 mr-2" /> Réimprimer
                  </Button>
                </div>
                        </div>
                      ) : (
              <div className="flex items-center justify-between gap-8">
                {/* Seat Selection - Left Side */}
                <div className="flex items-center gap-6">
                  <label className="text-lg font-semibold">Places :</label>
                  
                  {/* Improved seat buttons (1-8) */}
                          <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((seatCount) => (
                                <Button
                        key={seatCount}
                        variant={bookingData.seats === seatCount ? "default" : "outline"}
                        size="sm"
                        className={`relative w-14 h-14 rounded-xl font-bold text-lg transition-all duration-200 ${
                          bookingData.seats === seatCount 
                            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg scale-110 border-2 border-blue-800' 
                            : 'hover:bg-blue-50 hover:scale-105 hover:shadow-md border-2 hover:border-blue-300'
                        } ${
                          seatCount > availableSeats ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        onClick={() => setBookingData({ seats: seatCount })}
                        disabled={seatCount > availableSeats || isProcessing}
                        title={`Alt+${seatCount} pour sélectionner ${seatCount} place${seatCount > 1 ? 's' : ''}`}
                      >
                        {/* Alt shortcut indicator */}
                        <div className="absolute -top-1 -right-1">
                          <Badge variant="outline" className="text-xs font-mono bg-green-100 text-green-700 border-green-300 px-1 py-0">
                            Alt
                          </Badge>
                        </div>
                        {seatCount}
                                </Button>
                    ))}
                      </div>

                  {/* Manual controls */}
                  <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="outline"
                      size="sm"
                      className="w-10 h-10 rounded-full"
                      onClick={() => handleSeatsChange(-1)}
                      disabled={bookingData.seats <= 1 || isProcessing}
                    >
                      <Minus className="w-4 h-4" />
                            </Button>
                            
                    <div className="w-16 text-center">
                      <span className="text-2xl font-bold">{bookingData.seats}</span>
                      <div className="text-xs text-gray-500 mt-1">
                        {bookingData.seats} ticket{bookingData.seats > 1 ? 's' : ''} (1 par place)
                      </div>
                            </div>
                            
                            <Button
                              variant="outline"
                      size="sm"
                      className="w-10 h-10 rounded-full"
                      onClick={() => handleSeatsChange(1)}
                      disabled={bookingData.seats >= availableSeats || isProcessing}
                    >
                      <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                {/* Total Amount - Center */}
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">Montant Total</div>
                  <div className="text-2xl font-bold text-blue-600">{calculateTotal().toFixed(2)} TND</div>
                    </div>

                {/* Reserve Button - Right Side */}
                <div className="flex items-center">
                    <Button
                      onClick={handleBookingSubmit}
                    disabled={!canBook}
                    className="relative px-8 py-4 text-lg font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-lg"
                      size="lg"
                      title="Espace pour réserver"
                    >
                      {/* Spacebar shortcut indicator */}
                      <div className="absolute -top-1 -right-1">
                        <Badge variant="outline" className="text-xs font-mono bg-yellow-100 text-yellow-700 border-yellow-300 px-1 py-0">
                          Espace
                        </Badge>
                      </div>
                      
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Traitement...
                        </>
                      ) : (
                        <>
                          <Ticket className="w-5 h-5 mr-2" />
                        Réserver
                        </>
                      )}
                    </Button>
                  </div>
          </div>
        )}
      </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Raccourcis Clavier - Réservation
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowShortcuts(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Destination Selection */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-blue-600">Sélection de Destination</h3>
                  <div className="space-y-2">
                    {destinations.slice(0, 8).map((destination, index) => (
                      <div key={destination.destinationId} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                        <span className="text-sm">{destination.destinationName}</span>
                        <Badge variant="outline" className="font-mono text-xs">
                          {['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I'][index]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Seat Selection */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-green-600">Sélection de Places</h3>
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((seatCount) => (
                      <div key={seatCount} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                        <span className="text-sm">{seatCount} place{seatCount > 1 ? 's' : ''} = {seatCount} billet{seatCount > 1 ? 's' : ''}</span>
                        <Badge variant="outline" className="font-mono text-xs">
                          Alt+{seatCount}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Booking Action */}
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-2 text-yellow-600">Confirmer la Réservation</h3>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Réserver</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    Espace
                  </Badge>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Raccourcis:</strong> A-Z-E-R-T-Y-U-I pour destinations, Alt+1-8 pour places, Espace pour réserver. 
                  Appuyez sur <Badge variant="outline" className="mx-1">F12</Badge> 
                  pour ouvrir/fermer cette aide.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Exit Pass Confirmation Modal */}
      <ExitPassConfirmationModal
        isOpen={showExitPassModal}
        onClose={handleExitPassClose}
        onConfirm={handleExitPassConfirm}
        onReprint={handleExitPassReprint}
        vehicleData={exitPassVehicleData}
        isReprinting={isReprinting}
        isConfirming={isConfirming}
      />
    </div>
  );
}