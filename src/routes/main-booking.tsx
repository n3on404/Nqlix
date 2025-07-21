import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useInit } from '../context/InitProvider';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
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
  Printer
} from 'lucide-react';
import api from '../lib/api';
import { getWebSocketClient } from '../lib/websocket';
import { TicketPrintout } from '../components/TicketPrintout';
import { renderToString } from 'react-dom/server';

interface Destination {
  destinationId: string;
  destinationName: string;
  totalAvailableSeats: number;
  vehicleCount: number;
}

export default function MainBooking() {
  const { currentStaff } = useAuth();
  const { systemStatus } = useInit();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [availableSeats, setAvailableSeats] = useState<number>(1);
  const [bookingData, setBookingData] = useState<{ seats: number }>({ seats: 1 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [basePrice, setBasePrice] = useState<number>(0);

  // Fetch available destinations from API (only destinations with available seats)
  const fetchDestinations = async () => {
    setIsLoading(true);
    const response = await api.getAvailableDestinationsForBooking();
    if (response.success && response.data) {
      // Filter out destinations with no available seats
      const availableDestinations = response.data.filter((dest: Destination) => dest.totalAvailableSeats > 0);
      setDestinations(availableDestinations);
      console.log(`📍 Fetched ${availableDestinations.length} available destinations`);
    }
    setIsLoading(false);
  };

  // Optimized function to update only if destinations have actually changed
  const updateDestinationsIfChanged = async () => {
    try {
      const response = await api.getAvailableDestinationsForBooking();
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
    fetchDestinations();
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
    
    // Listen for the new granular update events
    wsClient.on('seat_availability_changed', seatAvailabilityHandler);
    wsClient.on('destinations_updated', destinationListHandler);
    wsClient.on('booking_conflict', bookingConflictHandler);
    wsClient.on('booking_success', bookingSuccessHandler);
    
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

  // Check if selected destination becomes fully booked and clear selection
  useEffect(() => {
    if (selectedDestination && availableSeats === 0) {
      console.log(`⚠️ Selected destination ${selectedDestination.destinationName} is now fully booked, clearing selection`);
      setSelectedDestination(null);
      setShowSuccess(false);
    }
  }, [selectedDestination, availableSeats]);

  const handleDestinationSelect = (destination: Destination | null) => {
    console.log("destination", destination);
    setSelectedDestination(destination);
    setShowSuccess(false);
  };

  const handleSeatsChange = (change: number) => {
    setBookingData(prev => ({
      seats: Math.max(1, Math.min(availableSeats, prev.seats + change))
    }));
  };

  const calculateTotal = () => {
    return basePrice * bookingData.seats;
  };

  // Add a printTicket function (stub for now)
  function printTicket(booking: any) {
    // Render the ticket as HTML
    const html = renderToString(<TicketPrintout booking={booking} />);
    // Open a new window and print
    const printWindow = window.open('', '', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Ticket Printout</title>
            <style>
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
              }
              @media print {
                @page {
                  size: 80mm auto;
                  margin: 2mm;
                }
                body * {
                  visibility: hidden;
                }
                .ticket-printout, .ticket-printout * {
                  visibility: visible;
                }
                .ticket-printout {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100% !important;
                  box-shadow: none !important;
                  border: none !important;
                }
              }
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      
      // Wait a bit for the content to load before printing
      setTimeout(() => {
        printWindow.print();
        setTimeout(() => {
          printWindow.close();
        }, 1000);
      }, 500);
    } else {
      alert('Impossible d\'ouvrir la fenêtre d\'impression. Veuillez vérifier votre bloqueur de popup.');
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
      <div className="sticky top-0 z-10 bg-card dark:bg-card border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Réservation principale</h1>
              <p className="text-gray-600 dark:text-gray-400">
                De {destinations.length} destinations
              </p>
              
              {/* Printer Status Indicator */}
              <div className="mt-2">
                <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-lg text-xs font-medium ${
                  systemStatus.printerConnected 
                    ? 'bg-green-100 text-green-700 border border-green-200' 
                    : 'bg-red-100 text-red-700 border border-red-200'
                }`}>
                  {systemStatus.printerConnected ? (
                    <>
                      <Printer className="h-3 w-3" />
                      <span>Imprimante prête</span>
                    </>
                  ) : (
                    <>
                      <PrinterIcon className="h-3 w-3" />
                      <span>Imprimante indisponible</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {currentStaff && (
              <div className="text-left sm:text-right">
                <p className="font-semibold">{currentStaff.firstName} {currentStaff.lastName}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{currentStaff.role}</p>
              </div>
            )}
          </div>
          
          {/* Compact Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
              <label className="text-sm font-medium whitespace-nowrap">Filtrer:</label>
              <select 
                className="w-full sm:w-auto px-3 py-2 border rounded-lg bg-card dark:bg-card"
                value={selectedDestination?.destinationId} 
                onChange={(e) => handleDestinationSelect(destinations.find(d => d.destinationId === e.target.value) || null)}
              >
                <option value="">Tout</option>
                {destinations.map(d => (
                  <option key={d.destinationId} value={d.destinationId}>{d.destinationName}</option>
                ))}
              </select>
            </div>
            
            {(selectedDestination) && (
              <Button 
                variant="outline" 
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  setSelectedDestination(null);
                }}
              >
                Effacer les filtres
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto p-4 sm:p-6 ${selectedDestination ? 'pb-48 sm:pb-36' : 'pb-6'}`}>
        {/* Stations Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          {destinations.map((destination: Destination) => (
            <Card
              key={destination.destinationId}
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 ${
                selectedDestination?.destinationId === destination.destinationId 
                  ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'hover:bg-muted dark:hover:bg-muted'
              }`}
              onClick={() => handleDestinationSelect(destination)}
            >
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-lg leading-tight">{destination.destinationName}</h3>
                    {selectedDestination?.destinationId === destination.destinationId && (
                      <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {destination.totalAvailableSeats} places disponibles
                  </p>
                  
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline">
                      Sélectionner
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {destinations.length === 0 && !isLoading && (
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

        {/* Loading State */}
        {isLoading && (
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

            {/* Floating Booking Panel */}
      {selectedDestination && (
        <div className="fixed bottom-0 left-0 right-0 bg-card dark:bg-card border-t border-gray-200 dark:border-gray-700 shadow-xl max-h-80 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-bold">
                  {selectedDestination.destinationName}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {selectedDestination.totalAvailableSeats} places disponibles
                </p>
              </div>
              
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedDestination(null)}
                className="self-end sm:self-center"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {showSuccess ? (
              <div className="text-center py-6 sm:py-8">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-green-600 mb-2">Réservation réussie !</h3>
                <p className="text-gray-600">Les billets ont été générés et sont prêts à l'impression</p>
              </div>
            ) : (
              <>
                {/* Printer Warning */}
                {!systemStatus.printerConnected && (
                  <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-yellow-800">Imprimante non connectée</h3>
                        <p className="text-xs text-yellow-700 mt-1">
                          L'imprimante n'est pas connectée. Les billets ne seront pas imprimés automatiquement.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            
            {!showSuccess && (
              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4 sm:gap-6">
                
                {/* Seats Counter */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium">Places</label>
                  <div className="flex items-center justify-center space-x-3">
                    <Button
                      variant="outline"
                      size="sm"
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
                      onClick={() => handleSeatsChange(1)}
                      disabled={bookingData.seats >= availableSeats || isProcessing}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">
                      {calculateTotal().toFixed(2)} TND
                    </div>
                    <div className="text-xs text-gray-500">Montant total</div>
                  </div>
                </div>

                {/* Book Button */}
                <div className="flex items-end">
                  <Button
                    onClick={handleBookingSubmit}
                    disabled={!canBook}
                    className={`w-full h-16 sm:h-20 text-base sm:text-lg`}
                    size="lg"
                    title={''}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Traitement...
                      </>
                    ) : (
                      <>
                        <Ticket className="w-5 h-5 mr-2" />
                        Réserver {bookingData.seats} Billet{bookingData.seats > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 