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
  const [isLoading, setIsLoading] = useState(true);
  const [basePrice, setBasePrice] = useState<number>(0);
  
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
      setAvailableSeats(response.data.totalAvailableSeats || 0);
      setBookingData({ seats: response.data.totalAvailableSeats > 0 ? 1 : 0 });
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
      if (msg?.payload?.type === 'exit_ticket_generated') {
        console.log('🎫 Exit ticket generated for fully booked vehicle:', msg.payload);
        
        try {
          // Format and print the exit ticket
          const exitTicketData = thermalPrinter.formatExitTicketData(msg.payload.ticket, msg.payload.vehicle);
          await thermalPrinter.printExitTicket(exitTicketData);
          console.log('✅ Exit ticket printed successfully for fully booked vehicle');
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
        if (seatCount <= availableSeats && !isProcessing) {
          event.preventDefault();
          setBookingData({ seats: seatCount });
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
        price: booking.totalAmount || (booking.basePrice * (booking.seatsBooked || 1)) || 0,
        departureStation: booking.startStationName || 'Station Actuelle',
        destinationStation: booking.destinationName,
        customerName: booking.customerName,
        seatsBooked: booking.seatsBooked || booking.seats || 1,
        verificationCode: booking.verificationCode
      };

      console.log('Booking ticket data prepared for printing:', thermalData);
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
      
      // Print with thermal printer
      console.log('🖨️ Calling thermal printer...');
      await thermalPrinter.printBookingTicket(ticketData);
      
      console.log('✅ Booking ticket printed successfully with thermal printer');
      
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




  const handleBookingSubmit = async () => {
    if (!selectedDestination || !currentStaff) return;

    setIsProcessing(true);

    try {
      const response = await api.createQueueBooking({
        destinationId: selectedDestination.destinationId,
        seatsRequested: bookingData.seats,
        staffId: currentStaff.id
      });

      if (response.success && response.data) {
        console.log('✅ Booking created successfully:', response.data);
        setShowSuccess(true);
        
        // Automatically print ticket after successful booking
        if (response.data.bookings && response.data.bookings.length > 0) {
          const booking = response.data.bookings[0]; // Get the first booking
          console.log('🎫 Booking successful, attempting to print ticket...');
          console.log('📋 Booking data for printing:', booking);
          try {
            await printTicket(booking);
          } catch (printError) {
            console.error('❌ Failed to print ticket automatically:', printError);
            // Don't fail the booking process if printing fails
          }
        } else {
          console.log('⚠️ No booking data found in response for printing');
          console.log('📋 Available data keys:', Object.keys(response.data));
        }
        
        // Clear selection after successful booking
        setTimeout(() => {
          setSelectedDestination(null);
          setShowSuccess(false);
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
            
            {currentStaff && (
              <div className="text-right">
                <p className="font-semibold">{currentStaff.firstName} {currentStaff.lastName}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{currentStaff.role}</p>
              </div>
            )}
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
                                   return 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-l-4 border-green-400';
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
                                   return 'text-green-800 dark:text-green-200';
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
                                   return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
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
                                       setActionLoading(queue.licensePlate);
                                       exitQueue(queue.licensePlate).finally(() => setActionLoading(null));
                                     }}
                                     disabled={actionLoading === queue.licensePlate || queue.status !== 'WAITING'}
                                     title="Retirer de la file d'attente"
                                   >
                                     {actionLoading === queue.licensePlate ? (
                                       <Loader2 className="h-4 w-4 animate-spin" />
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
                                      queue.status === 'READY' ? 'Prêt' : queue.status}
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
                <p className="text-gray-600">Les billets ont été générés et sont prêts à l'impression</p>
                <div className="mt-4 flex justify-center gap-3">
                  <Button onClick={reprintLastBookingTicket} variant="outline" className="flex items-center">
                    <Printer className="w-4 h-4 mr-2" /> Réimprimer le dernier billet
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
                        <span className="text-sm">{seatCount} place{seatCount > 1 ? 's' : ''}</span>
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
    </div>
  );
}