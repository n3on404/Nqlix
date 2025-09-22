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
import { getWebSocketClient } from '../lib/websocket';
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
  const { currentStaff } = useAuth();
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
  
  // Last booking data for cancel functionality
  const [lastBookingData, setLastBookingData] = useState<{
    bookings: any[];
    totalSeats: number;
    totalAmount: number;
  } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  
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
  
  // Helper functions for queue management
  const normalizeDestinationName = (name: string) => {
    return name.replace(/^STATION /i, "").toUpperCase().trim();
  };

  const normalizeStationName = (name: string) => {
    return name.toUpperCase().trim();
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
        totalBasePrice: totalBasePrice
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
        totalBasePrice: totalBasePrice
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

  // Fetch available destinations from API (only destinations with available seats)
  const fetchDestinations = async () => {
    setIsLoading(true);
    const filters: { governorate?: string; delegation?: string } = {};
    if (selectedGovernment) {
      filters.governorate = selectedGovernment;
    }
    if (selectedDelegation) {
      filters.delegation = selectedDelegation;
    }
    
    const response = await api.getAvailableDestinationsForBooking(filters);
    if (response.success && response.data) {
      // Filter out destinations with no available seats
      const availableDestinations = response.data.filter((dest: Destination) => dest.totalAvailableSeats > 0);
      setDestinations(availableDestinations);
      console.log(`📍 Fetched ${availableDestinations.length} available destinations`);
    }
    setIsLoading(false);
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
      const response = await api.getAvailableLocations();
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
    const response = await api.getAvailableSeatsForDestination(destinationId);
    if (response.success && response.data) {
      const newAvailableSeats = response.data.totalAvailableSeats || 0;
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
      
      if (response.data.vehicles && response.data.vehicles.length > 0) {
        setBasePrice(response.data.vehicles[0].basePrice || 0);
      } else {
        setBasePrice(0);
      }
    } else {
      setAvailableSeats(0);
      setBookingData({ seats: 0 });
      setBasePrice(0);
    }
  };

  // Initial fetch and WebSocket subscription for real-time updates
  useEffect(() => {
    fetchGovernments();
    fetchDestinations();
    fetchRoutes();
    const wsClient = getWebSocketClient();
    
    // Handler for specific seat availability updates
    const seatAvailabilityHandler = (data: any) => {
      console.log('📊 Seat availability update received:', data);
      
      if (data?.destinationId && data?.availableSeats !== undefined) {
        // Update specific destination in the list
        setDestinations(prev => prev.map(dest => 
          dest.destinationId === data.destinationId 
            ? { ...dest, totalAvailableSeats: data.availableSeats }
            : dest
        ).filter(dest => dest.totalAvailableSeats > 0)); // Remove fully booked destinations
        
        // If this is the selected destination, update its available seats
        if (selectedDestination?.destinationId === data.destinationId) {
          setAvailableSeats(data.availableSeats);
          
          // If destination is now fully booked, clear selection
          if (data.availableSeats === 0 && selectedDestination) {
            console.log(`⚠️ Selected destination ${selectedDestination.destinationName} is now fully booked, clearing selection`);
            setSelectedDestination(null);
            setShowSuccess(false);
          }
        }
      }
    };
    
    // Handler for destination list updates
    const destinationListHandler = (data: any) => {
      console.log('📍 Destination list update received:', data);
      
      if (data?.destinations) {
        const availableDestinations = data.destinations.filter((dest: Destination) => dest.totalAvailableSeats > 0);
        setDestinations(availableDestinations);
        
        // Check if selected destination is still available
        if (selectedDestination) {
          const stillAvailable = availableDestinations.find((dest: Destination) => dest.destinationId === selectedDestination.destinationId);
          if (!stillAvailable) {
            console.log(`⚠️ Selected destination ${selectedDestination.destinationName} is no longer available, clearing selection`);
            setSelectedDestination(null);
            setShowSuccess(false);
          } else if (stillAvailable.totalAvailableSeats !== selectedDestination.totalAvailableSeats) {
            // Update selected destination data
            setSelectedDestination(stillAvailable);
            fetchAvailableSeats(stillAvailable.destinationId);
          }
        }
      }
    };
    
    // Legacy handlers for backward compatibility (will trigger full refresh if needed)
    const legacyQueueHandler = () => {
      console.log('🔄 Legacy queue update received, performing minimal refresh...');
      // Only fetch if we don't have any destinations (fallback)
      if (destinations.length === 0) {
        fetchDestinations();
      }
    };

    const legacyBookingHandler = () => {
      console.log('🎯 Legacy booking update received, performing minimal refresh...');
      // Only fetch if we don't have any destinations (fallback)
      if (destinations.length === 0) {
        fetchDestinations();
      }
    };
    
    // Handler for booking conflicts (immediate notification)
    const bookingConflictHandler = (data: any) => {
      console.log('🚨 Booking conflict received:', data);
      
      if (data?.destinationId && data?.message) {
        // Show immediate conflict notification
        if (data.conflictType === 'booking_conflict') {
          alert(`⚠️ Booking Conflict!\n\n${data.message}\n\nAnother staff member just booked these seats. Please try again with updated availability.`);
        } else if (data.conflictType === 'insufficient_seats') {
          alert(`⚠️ Insufficient Seats!\n\n${data.message}\n\nPlease select fewer seats or choose a different destination.`);
        } else if (data.conflictType === 'seat_taken') {
          alert(`⚠️ Seats No Longer Available!\n\n${data.message}\n\nThe seats you selected were just taken. Please refresh and try again.`);
        }
        
        // Clear current selection if it's for the same destination
        if (selectedDestination?.destinationId === data.destinationId) {
          setSelectedDestination(null);
          setShowSuccess(false);
        }
        
        // Force refresh destinations to show current state
        fetchDestinations();
      }
    };
    
    // Handler for booking success notifications
    const bookingSuccessHandler = (data: any) => {
      console.log('🎉 Booking success notification received:', data);
      
      if (data?.destinationId && data?.seatsBooked) {
        // Only show notification if it's not our own booking (to avoid duplicate notifications)
        if (!isProcessing && selectedDestination?.destinationId !== data.destinationId) {
          console.log(`✅ ${data.seatsBooked} seats were just booked for ${data.destinationName} by another staff member`);
        }
      }
    };

    // Payment confirmation handler for main booking
    const paymentHandler = (msg: any) => {
      if (msg?.payload?.source === 'payment_confirmation') {
        const paymentData = msg.payload;
        
        // Show payment success notification
        notifyPaymentSuccess({
          verificationCode: paymentData.verificationCode,
          totalAmount: paymentData.totalAmount,
          seatsBooked: paymentData.seatsBooked,
          vehicleLicensePlate: paymentData.vehicle.licensePlate,
          destinationName: paymentData.vehicle.destination,
          paymentReference: paymentData.onlineTicketId || 'N/A'
        });

        // Refresh destinations to show updated seat counts
        fetchDestinations();
      }
    };

    // Seat availability change handler for main booking
    const seatHandler = (msg: any) => {
      if (msg?.payload?.type === 'seat_availability_changed') {
        const seatData = msg.payload;
        
        // Find the destination in current state to get old seat count
        const currentDestination = destinations.find((d: Destination) => d.destinationName === seatData.destinationName);
        if (currentDestination) {
          notifySeatUpdate({
            vehicleLicensePlate: seatData.vehicleLicensePlate,
            destinationName: seatData.destinationName,
            availableSeats: seatData.availableSeats,
            totalSeats: seatData.totalSeats,
            oldAvailableSeats: currentDestination.totalAvailableSeats
          });
        }

        // Refresh destinations
        fetchDestinations();
      }
    };

    // Vehicle status change handler for main booking
    const vehicleStatusHandler = (msg: any) => {
      if (msg?.payload?.type === 'vehicle_status_changed' && msg.payload.newStatus === 'READY') {
        notifyVehicleReady({
          licensePlate: msg.payload.licensePlate,
          destinationName: msg.payload.destinationName,
          totalSeats: msg.payload.totalSeats
        });

        // Refresh destinations
        fetchDestinations();
      }
    };

    // Exit ticket generation handler for fully booked vehicles
    const exitTicketHandler = async (msg: any) => {
      console.log('🔍 [EXIT TICKET DEBUG] Received WebSocket message:', msg);
      if (msg?.payload?.type === 'exit_ticket_generated') {
        console.log('🎫 [EXIT TICKET DEBUG] Exit ticket generated for fully booked vehicle:', msg.payload);
        
        try {
          // Format and print the exit ticket
          const exitTicketData = thermalPrinter.formatExitTicketData(msg.payload.ticket, msg.payload.vehicle);
          const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
          await thermalPrinter.printExitTicket(exitTicketData, staffName);
          console.log('✅ Exit ticket printed successfully for fully booked vehicle');
          
          // Also print exit pass for the vehicle
          console.log('🚪 Printing exit pass for fully booked vehicle...');
          try {
            // Get base price from route table
            const destinationName = msg.payload.vehicle.destination;
            const basePricePerSeat = getBasePriceForDestination(destinationName) || 2.0;
            const totalSeats = msg.payload.vehicle.totalSeats || 8;
            
            // Check if there was a previous vehicle on the same day
            let previousLicensePlate = null;
            let previousExitTime = null;
            
            if (msg.payload.previousVehicle?.licensePlate && msg.payload.previousVehicle?.exitTime) {
              const previousExitDate = new Date(msg.payload.previousVehicle.exitTime);
              const currentDate = new Date();
              
              // Check if previous vehicle exited on the same day
              const isSameDay = previousExitDate.toDateString() === currentDate.toDateString();
              
              if (isSameDay) {
                previousLicensePlate = msg.payload.previousVehicle.licensePlate;
                previousExitTime = msg.payload.previousVehicle.exitTime;
                console.log('📅 Previous vehicle found on same day:', {
                  licensePlate: previousLicensePlate,
                  exitTime: previousExitTime
                });
              } else {
                console.log('📅 Previous vehicle was from different day, showing N/A');
              }
            } else {
              console.log('📅 No previous vehicle data available, showing N/A');
            }
            
            console.log('💰 Exit pass pricing:', {
              destinationName,
              basePricePerSeat,
              totalSeats,
              totalBasePrice: basePricePerSeat * totalSeats,
              previousVehicle: previousLicensePlate || 'N/A'
            });
            
            const exitPassData = {
              licensePlate: msg.payload.vehicle.licensePlate,
              destinationName: destinationName,
              previousLicensePlate: previousLicensePlate,
              previousExitTime: previousExitTime,
              currentExitTime: new Date().toISOString(),
              totalSeats: totalSeats,
              basePricePerSeat: basePricePerSeat,
              totalBasePrice: basePricePerSeat * totalSeats
            };
            
            const exitPassTicketData = thermalPrinter.formatExitPassTicketData(exitPassData);
            await thermalPrinter.printExitPassTicket(exitPassTicketData, staffName);
            console.log('✅ Exit pass printed successfully for fully booked vehicle');
          } catch (exitPassError) {
            console.error('❌ Failed to print exit pass for fully booked vehicle:', exitPassError);
          }
        } catch (printError) {
          console.error('❌ Failed to print exit ticket for fully booked vehicle:', printError);
        }
      }
    };

    // Vehicle departure handler
    const vehicleDepartureHandler = (msg: any) => {
      if (msg?.payload?.type === 'vehicle_departed') {
        console.log('🚪 Vehicle departed from queue:', msg.payload);
        
        // Show notification about vehicle departure
        if (msg.payload.reason === 'fully_booked') {
          console.log(`✅ Vehicle ${msg.payload.licensePlate} has departed - fully booked and exit ticket printed`);
        }
        
        // Refresh destinations to update the queue
        fetchDestinations();
      }
    };
    
    // Listen for the new granular update events
    wsClient.on('seat_availability_changed', seatAvailabilityHandler);
    wsClient.on('destinations_updated', destinationListHandler);
    wsClient.on('booking_conflict', bookingConflictHandler);
    wsClient.on('booking_success', bookingSuccessHandler);
    wsClient.on('payment_confirmation', paymentHandler);
    wsClient.on('vehicle_status_changed', vehicleStatusHandler);
    wsClient.on('exit_ticket_generated', exitTicketHandler);
    console.log('🔌 [EXIT TICKET DEBUG] Registered exit_ticket_generated event listener');
    wsClient.on('vehicle_departed', vehicleDepartureHandler);
    
    // Keep legacy events for backward compatibility but with minimal impact
    wsClient.on('queue_update', legacyQueueHandler);
    wsClient.on('booking_update', legacyBookingHandler);
    wsClient.on('cash_booking_updated', legacyQueueHandler);
    wsClient.on('queue_updated', legacyQueueHandler);
    wsClient.on('booking_created', legacyBookingHandler);
    
    // Periodic background sync (every 30 seconds) as fallback
    const backgroundSyncInterval = setInterval(() => {
      if (!wsClient.isConnected()) {
        console.log('🔄 WebSocket disconnected, performing background sync...');
        updateDestinationsIfChanged();
      }
    }, 30000);
    
    return () => {
      wsClient.removeListener('seat_availability_changed', seatAvailabilityHandler);
      wsClient.removeListener('destinations_updated', destinationListHandler);
      wsClient.removeListener('booking_conflict', bookingConflictHandler);
      wsClient.removeListener('booking_success', bookingSuccessHandler);
      wsClient.removeListener('payment_confirmation', paymentHandler);
      wsClient.removeListener('vehicle_status_changed', vehicleStatusHandler);
      wsClient.removeListener('exit_ticket_generated', exitTicketHandler);
      wsClient.removeListener('vehicle_departed', vehicleDepartureHandler);
      wsClient.removeListener('queue_update', legacyQueueHandler);
      wsClient.removeListener('booking_update', legacyBookingHandler);
      wsClient.removeListener('cash_booking_updated', legacyQueueHandler);
      wsClient.removeListener('queue_updated', legacyQueueHandler);
      wsClient.removeListener('booking_created', legacyBookingHandler);
      clearInterval(backgroundSyncInterval);
    };
  }, [selectedDestination, destinations.length, isProcessing]);

  // When a destination is selected, fetch its available seats
  useEffect(() => {
    if (selectedDestination) {
      fetchAvailableSeats(selectedDestination.destinationId);
    }
  }, [selectedDestination]);

  // When filters change, refetch destinations
  useEffect(() => {
    fetchDestinations();
  }, [selectedGovernment, selectedDelegation]);

  // Check if selected destination becomes fully booked and clear selection
  useEffect(() => {
    if (selectedDestination && availableSeats === 0) {
      console.log(`⚠️ Selected destination ${selectedDestination.destinationName} is now fully booked, clearing selection`);
      setSelectedDestination(null);
      setShowSuccess(false);
    }
  }, [selectedDestination, availableSeats]);

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

      // Q-P shortcuts for destination selection (Q, W, E, R, T, Y, U, I)
      const destinationKeys = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i'];
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
    console.log("destination", destination);
    setSelectedDestination(destination);
    setShowSuccess(false);
    setLastBookingData(null); // Clear any previous booking data
    
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
      const talonResult = await thermalPrinter.printTalon(talonData, staffName);
      console.log('✅ Talon printed:', talonResult);
      
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

    setIsCancelling(true);

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

          const response = await api.cancelQueueBooking(booking.id, seatsToRemoveFromThisBooking);

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
      alert(`❌ Network Error!\n\nFailed to cancel booking: ${error.message}\n\nPlease check your connection and try again.`);
    } finally {
      setIsCancelling(false);
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

    try {
      const response = await api.createQueueBooking({
        destinationId: selectedDestination.destinationId,
        seatsRequested: seatsToBook,
        staffId: currentStaff.id
      });

      if (response.success && response.data) {
        console.log('✅ Booking created successfully:', response.data);
        setShowSuccess(true);
        
        // Store booking data for cancel functionality
        setLastBookingData({
          bookings: response.data.bookings || [],
          totalSeats: seatsToBook,
          totalAmount: response.data.totalAmount || 0
        });
        
        // Automatically print one ticket per seat after successful booking
        if (response.data.bookings && response.data.bookings.length > 0) {
          console.log('🎫 Booking successful, printing one ticket per seat...');
          console.log('📋 Number of seats to print tickets for:', seatsToBook);
          
          let successfulPrints = 0;
          const baseBooking = response.data.bookings[0];
          
          // Print one ticket for each seat (not per booking, but per seat)
          for (let seatNumber = 1; seatNumber <= seatsToBook; seatNumber++) {
            console.log(`🎫 Printing ticket ${seatNumber}/${seatsToBook} for seat ${seatNumber}`);
            console.log(`💰 Using single seat price: ${basePrice} TND (not total price)`);
            
            // Use the first booking as template but modify for individual seat
            const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'N/A';
            const individualSeatBooking = {
              ...baseBooking,
              // Remove seats field and treat as single seat
              seatsBooked: 1,
              totalAmount: basePrice, // Price for one seat only
              basePrice: basePrice, // Ensure basePrice is also set for one seat
              verificationCode: `${baseBooking.verificationCode}-${seatNumber}`, // Unique code per seat
              seatNumber: seatNumber, // Add seat number for reference
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
              await printExitPassDirectForVehicle(licensePlate, destinationName);
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
        
        // Clear selection after successful booking
        setTimeout(() => {
          setSelectedDestination(null);
          setShowSuccess(false);
          setTicketsPrinted(0);
          setBookingData({ seats: 1 });
        }, 3000);
      } else {
        console.error('❌ Booking failed:', response.message);
        
        // Handle specific booking conflict errors
        if (response.message?.includes('Booking conflict') || 
            response.message?.includes('were just booked by another user')) {
          alert(`⚠️ Booking Conflict!\n\n${response.message}\n\nThe seat availability has been updated. Please select your seats again.`);
          
          // Clear selection and refresh data immediately
          setSelectedDestination(null);
          setShowSuccess(false);
          
          // Force refresh of destinations to show current availability
          fetchDestinations();
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
      alert(`❌ Network Error!\n\nFailed to process booking: ${error.message}\n\nPlease check your connection and try again.`);
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
            </div>
            
            <div className="flex items-center gap-4">
              {/* Test Exit Pass Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={testExitPass}
                  variant="outline"
                  size="sm"
                  className="bg-orange-100 hover:bg-orange-200 text-orange-700 border-orange-300"
                  title="Test exit pass modal workflow"
                >
                  🧪 Test Modal
                </Button>
                <Button
                  onClick={testExitPassWithPrevious}
                  variant="outline"
                  size="sm"
                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 border-blue-300"
                  title="Test exit pass with previous vehicle data"
                >
                  🧪 Test with Previous
                </Button>
                <Button
                  onClick={testExitPassDirect}
                  variant="outline"
                  size="sm"
                  className="bg-green-100 hover:bg-green-200 text-green-700 border-green-300"
                  title="Test exit pass printing directly (bypasses modal)"
                >
                  🧪 Test Print
                </Button>
              </div>
              
              {currentStaff && (
                <div className="text-right">
                  <p className="font-semibold">{currentStaff.firstName} {currentStaff.lastName}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{currentStaff.role}</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Tab Navigation */}
      

          {/* Location Filters - Only show on bookings tab */}
          {activeTab === 'bookings' && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
              <label className="text-sm font-medium whitespace-nowrap">Gouvernorat:</label>
              <select 
                className="w-full sm:w-auto px-3 py-2 border rounded-lg bg-card dark:bg-card"
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
            </div>
            
            {selectedGovernment && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                <label className="text-sm font-medium whitespace-nowrap">Délégation:</label>
                <select 
                  className="w-full sm:w-auto px-3 py-2 border rounded-lg bg-card dark:bg-card"
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
              </div>
            )}
            
            {(selectedGovernment || selectedDelegation) && (
              <Button 
                variant="outline" 
                size="sm"
                className="w-full sm:w-auto"
                onClick={clearFilters}
              >
                Effacer les filtres
              </Button>
            )}
          </div>
          )}
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
                    className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 ${
                        selectedDestination?.destinationId === destination.destinationId 
                        ? 'ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-lg' 
                          : 'hover:bg-muted dark:hover:bg-muted'
                      }`}
                      onClick={() => handleDestinationSelect(destination)}
                    >
                    <CardContent className="p-4 text-center">
                        <div className="space-y-2">
                        {/* Q-P shortcut indicator */}
                        <div className="absolute top-2 right-2">
                          <Badge variant="outline" className="text-xs font-mono bg-blue-100 text-blue-700 border-blue-300">
                            {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'][index]}
                          </Badge>
                        </div>
                        
                        <h3 className="font-bold text-base leading-tight">{destination.destinationName}</h3>
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-4 w-4 text-gray-600" />
                          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                            {destination.totalAvailableSeats} places
                          </p>
                        </div>
                            {selectedDestination?.destinationId === destination.destinationId && (
                          <div className="flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-orange-600" />
                            </div>
                        )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
            </div>
          </div>

            {/* Right Side - Queue Table */}
          <div className="space-y-4">
              <h2 className="text-xl font-bold">File d'Attente</h2>
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
                    const normalizedDestination = normalizeDestinationName(selectedDestination.destinationName);
                    const destinationQueues = queues[normalizedDestination] || [];
                    
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
                           {destinationQueues.map((queue: any, index: number) => {
                             // Status-based background colors
                             const getStatusBackground = (status: string) => {
                               switch (status) {
                                 case 'WAITING':
                                   return 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-l-4 border-yellow-400';
                                 case 'LOADING':
                                   return 'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-l-4 border-blue-400';
                                 case 'READY':
                                   return 'bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-l-4 border-orange-400';
                                 default:
                                   return 'bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-800 dark:to-slate-800 border-l-4 border-gray-400';
                               }
                             };

                             const getStatusTextColor = (status: string) => {
                               switch (status) {
                                 case 'WAITING':
                                   return 'text-yellow-800 dark:text-yellow-200';
                                 case 'LOADING':
                                   return 'text-blue-800 dark:text-blue-200';
                                 case 'READY':
                                   return 'text-orange-800 dark:text-orange-200';
                                 default:
                                   return 'text-gray-800 dark:text-gray-200';
                               }
                             };

                             const getStatusBadgeColor = (status: string) => {
                               switch (status) {
                                 case 'WAITING':
                                   return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
                                 case 'LOADING':
                                   return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
                                 case 'READY':
                                   return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
                                 default:
                                   return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
                               }
                              };
                              
                              return (
                               <div
                                 key={queue.id}
                                 className={`grid grid-cols-12 gap-4 p-5 border-b border-gray-100 dark:border-gray-700 transition-all duration-200 hover:shadow-md ${getStatusBackground(queue.status)}`}
                               >
                                 {/* Booked Seats */}
                                 <div className="col-span-2 flex items-center">
                                   <span className={`font-bold text-lg ${getStatusTextColor(queue.status)}`}>
                                     {queue.totalSeats - queue.availableSeats}
                                   </span>
                                    </div>
                                 
                                 {/* Total Seats */}
                                 <div className="col-span-2 flex items-center">
                                   <span className={`font-bold text-lg ${getStatusTextColor(queue.status)}`}>
                                     {queue.totalSeats}
                                      </span>
                                    </div>
                                 
                                 {/* License Plate */}
                                 <div className="col-span-5 flex items-center justify-between">
                                   <span className="font-mono text-base font-bold bg-white/50 dark:bg-gray-800/50 px-3 py-2 rounded border min-w-0 flex-1 mr-3">
                                     {queue.licensePlate}
                                   </span>
                                   <Button 
                                     variant="ghost" 
                                     size="sm"
                                     className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20 p-2 flex-shrink-0"
                                     onClick={() => {
                                       // Check vehicle status and handle accordingly
                                       if (queue.status === 'READY') {
                                         // Vehicle is ready (fully booked) - show exit pass modal
                                         triggerExitPassWorkflow(queue, selectedDestination.destinationName);
                                       } else if (queue.availableSeats === 0) {
                                         // Vehicle is fully booked but not READY status - change to READY
                                         triggerExitPassWorkflow(queue, selectedDestination.destinationName);
                                       } else {
                                         // Normal removal for non-fully-booked vehicles
                                         setActionLoading(queue.vehicle.licensePlate);
                                         exitQueue(queue.vehicle.licensePlate).finally(() => setActionLoading(null));
                                       }
                                     }}
                                     disabled={actionLoading === queue.vehicle.licensePlate || (queue.status !== 'WAITING' && queue.status !== 'READY') || vehiclesPendingExitConfirmation.has(queue.vehicle.licensePlate)}
                                     title={
                                       queue.status === 'READY'
                                         ? "Véhicule prêt - Cliquez pour imprimer le ticket de sortie"
                                         : queue.availableSeats === 0 
                                         ? "Véhicule complet - Cliquez pour changer le statut et imprimer le ticket"
                                         : vehiclesPendingExitConfirmation.has(queue.vehicle.licensePlate)
                                         ? "En attente de confirmation de sortie"
                                         : "Retirer de la file d'attente"
                                     }
                                   >
                                     {actionLoading === queue.vehicle.licensePlate ? (
                                       <Loader2 className="h-4 w-4 animate-spin" />
                                     ) : queue.status === 'READY' ? (
                                       <Printer className="h-4 w-4" />
                                     ) : (
                                       <X className="h-4 w-4" />
                                     )}
                                   </Button>
                                 </div>
                                 
                                 {/* Status */}
                                 <div className="col-span-3 flex items-center">
                                   <Badge className={`text-sm font-semibold px-3 py-1 ${getStatusBadgeColor(queue.status)}`}>
                                     {queue.status === 'WAITING' ? 'En attente' :
                                      queue.status === 'LOADING' ? 'Chargement' :
                                      queue.status === 'READY' ? 'Complet - Prêt à sortir' : queue.status}
                                   </Badge>
                                 </div>
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
            <p className="text-gray-500">
              Recherche des destinations avec des places disponibles
                          </p>
                        </div>
                      )}
                    </div>

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
                  
                  {/* Cancel buttons section */}
                  <div className="flex gap-2">
                    {lastBookingData && lastBookingData.totalSeats > 1 && (
                      <>
                        {/* Quick cancel 1 seat button - most common use case */}
                        <Button
                          onClick={() => handleCancelLastBooking(1)}
                          disabled={isCancelling}
                          variant="outline"
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-300 font-semibold"
                          title="Annuler 1 place seulement (erreur courante: réservé 2 au lieu de 1)"
                        >
                          {isCancelling ? 'Annulation...' : 'Annuler 1 place'}
                        </Button>
                        
                        {/* Additional partial cancel buttons for larger bookings */}
                        {lastBookingData.totalSeats > 2 && (
                          <Button
                            onClick={() => handleCancelLastBooking(2)}
                            disabled={isCancelling}
                            variant="outline"
                            size="sm"
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-300"
                          >
                            {isCancelling ? '...' : 'Annuler 2'}
                          </Button>
                        )}
                        
                        {lastBookingData.totalSeats > 3 && (
                          <Button
                            onClick={() => handleCancelLastBooking(3)}
                            disabled={isCancelling}
                            variant="outline"
                            size="sm"
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-300"
                          >
                            {isCancelling ? '...' : 'Annuler 3'}
                          </Button>
                        )}
                      </>
                    )}
                    
                    {/* Cancel all button */}
                    <Button
                      onClick={() => handleCancelLastBooking()}
                      disabled={isCancelling}
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                      title="Annuler toute la réservation"
                    >
                      {isCancelling ? 'Annulation...' : 
                        lastBookingData && lastBookingData.totalSeats > 1 ? 'Annuler tout' : 'Annuler'
                      }
                    </Button>
                  </div>
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
                          {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'][index]}
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
                  <strong>Raccourcis:</strong> Q-W-E-R-T-Y-U-I pour destinations, Alt+1-8 pour places, Espace pour réserver. 
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