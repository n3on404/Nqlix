import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Loader2, Plus, Trash2, Car, Users, MapPin, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthProvider';
import { dbClient } from '../services/dbClient';

interface OvernightQueueEntry {
  id: string;
  vehicleId: string;
  licensePlate: string;
  destinationId: string;
  destinationName: string;
  queuePosition: number;
  enteredAt: string;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  vehicle?: {
    driver?: {
      cin: string;
    };
  };
}

interface OvernightQueues {
  [destinationId: string]: OvernightQueueEntry[];
}

export default function OvernightQueuePage() {
  const [queues, setQueues] = useState<OvernightQueues>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cin, setCin] = useState('');
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [selectedVehicleData, setSelectedVehicleData] = useState<any>(null);
  const [destinations, setDestinations] = useState<any[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const { isAuthenticated, selectedRoute } = useAuth();

  // Real-time disabled

  // Load overnight queues
  const loadOvernightQueues = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await api.getOvernightQueues();
      
      if (response.success && response.data) {
        // The API returns data grouped by destination, which matches our expected structure
        setQueues(response.data);
      } else {
        setError(response.message || 'Échec du chargement des files de nuit');
      }
    } catch (error: any) {
      setError(error.message || 'Une erreur est survenue lors du chargement des files de nuit');
    } finally {
      setIsLoading(false);
    }
  };

  // Load available destinations for overnight queue
  const loadDestinations = async () => {
    try {
      const destinations = await dbClient.getAvailableDestinations(selectedRoute || undefined);
      const mappedDestinations = destinations.map((dest: any) => ({
        id: dest.stationId,
        name: dest.stationName
      }));
      setDestinations(mappedDestinations);
    } catch (error: any) {
      console.error('Error loading destinations:', error);
      // Fallback to API if dbClient fails
      try {
        const response = await api.getAllRoutes();
        if (response.success && response.data) {
          const routes = response.data?.data || response.data;
          const destinations = routes.map((route: any) => ({
            id: route.stationId,
            name: route.stationName
          }));
          setDestinations(destinations);
        }
      } catch (apiError) {
        console.error('API fallback also failed:', apiError);
      }
    }
  };

  // Load available vehicles for overnight queue
  const loadAvailableVehicles = async () => {
    try {
      setIsLoadingVehicles(true);
      
      const response = await api.getVehicles();
      console.log('🔍 Vehicles API response:', response);
      
      if (response.success && response.data) {
        // Handle nested response structure
        const vehicles = response.data?.data || response.data;
        console.log('🔍 Vehicles data:', vehicles);
        
        // Filter vehicles that are active, available, not banned, and not in any queue
        const available = vehicles.filter((vehicle: any) => 
          vehicle.isActive && 
          vehicle.isAvailable && 
          !vehicle.isBanned &&
          vehicle.licensePlate &&
          (!vehicle.queueEntries || vehicle.queueEntries.length === 0)
        );
        console.log('🔍 Available vehicles (not in any queue):', available);
        setAvailableVehicles(available);
      } else {
        console.error('🔍 Failed to load vehicles:', response.message);
        setAvailableVehicles([]);
      }
    } catch (error: any) {
      console.error('Error loading available vehicles:', error);
      setAvailableVehicles([]);
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  // Show destination selection modal
  const handleVehicleSelection = (licensePlate: string) => {
    // Find the vehicle data
    const vehicleData = availableVehicles.find(v => v.licensePlate === licensePlate);
    if (vehicleData) {
      setSelectedVehicle(licensePlate);
      setSelectedVehicleData(vehicleData);
      
      // Filter destinations based on vehicle's authorized stations
      const authorizedDestinations = destinations.filter(dest => 
        vehicleData.authorizedStations?.some((station: any) => 
          station.stationId === dest.id || station.stationName === dest.name
        )
      );
      
      // Update destinations to only show authorized ones
      setDestinations(authorizedDestinations);
      setShowDestinationModal(true);
    }
  };

  // Add vehicle to overnight queue with selected destination
  const handleAddVehicleToOvernightQueue = async () => {
    if (!selectedVehicle || !selectedDestination) {
      setAddError('Veuillez sélectionner un véhicule et une destination');
      return;
    }

    try {
      setIsAddingVehicle(true);
      setAddError(null);
      setAddSuccess(null);

      // Add vehicle to overnight queue with selected destination
      const response = await api.addVehicleToOvernightQueue({
        licensePlate: selectedVehicle,
        destinationId: selectedDestination
      });
      
      if (response.success) {
        setAddSuccess(response.message || 'Véhicule ajouté avec succès');
        setCin('');
        setSelectedVehicle('');
        setSelectedVehicleData(null);
        setSelectedDestination('');
        setShowDestinationModal(false);
        // Reload full destinations list
        loadDestinations();
        // Reload available vehicles to remove the added vehicle
        await loadAvailableVehicles();
        // Reload queues to show the new vehicle
        await loadOvernightQueues();
      } else {
        // Handle specific error cases
        if (response.message?.includes('active booking(s)')) {
          setAddError(
            `${response.message} Veuillez annuler les réservations d\'abord ou utiliser un autre véhicule.`
          );
        } else {
          setAddError(response.message || 'Échec de l\'ajout du véhicule');
        }
      }
    } catch (error: any) {
      setAddError(error.message || 'Une erreur est survenue lors de l\'ajout du véhicule');
    } finally {
      setIsAddingVehicle(false);
    }
  };

  // Remove vehicle from overnight queue
  const handleRemoveVehicle = async (licensePlate: string) => {
    try {
      const response = await api.removeVehicleFromOvernightQueue({ licensePlate });
      
      if (response.success) {
        // Reload available vehicles to add the removed vehicle back
        await loadAvailableVehicles();
        // Reload queues to reflect the removal
        await loadOvernightQueues();
      } else {
        setError(response.message || 'Échec de la suppression du véhicule');
      }
    } catch (error: any) {
      setError(error.message || 'Une erreur est survenue lors de la suppression du véhicule');
    }
  };

  // Transfer all overnight vehicles to regular queue
  const handleTransferToRegular = async () => {
    try {
      // Get all vehicles in overnight queues and transfer them one by one
      const allVehicles = Object.values(queues).flat();
      let successCount = 0;
      
      for (const vehicle of allVehicles) {
        const response = await api.transferOvernightToRegular({ licensePlate: vehicle.licensePlate });
        if (response.success) {
          successCount++;
        }
      }
      
      if (successCount > 0) {
        setAddSuccess(`${successCount} véhicule(s) transféré(s) avec succès`);
        // Reload available vehicles to remove transferred vehicles
        await loadAvailableVehicles();
        // Reload queues to show the transfer
        await loadOvernightQueues();
      } else {
        setError('Aucun véhicule transféré');
      }
    } catch (error: any) {
      setError(error.message || 'Une erreur est survenue lors du transfert des véhicules');
    }
  };

  // Initial load and periodic refresh (real-time disabled)
  useEffect(() => {
    if (!isAuthenticated) return;
    loadOvernightQueues();
    loadAvailableVehicles();
    loadDestinations();
    const id = setInterval(() => {
      loadOvernightQueues();
    }, 30000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (addSuccess) {
      const timer = setTimeout(() => setAddSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [addSuccess]);

  // Clear error message after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTotalVehicles = () => {
    return Object.values(queues).reduce((total, queue) => total + queue.length, 0);
  };

  const getTotalSeats = () => {
    return Object.values(queues).reduce((total, queue) => 
      total + queue.reduce((sum, vehicle) => sum + vehicle.availableSeats, 0), 0
    );
  };

  if (isLoading && Object.keys(queues).length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Gestion de la file de nuit</h1>
          <p className="text-muted-foreground">Gérez les véhicules en attente de voyages de nuit</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold">{getTotalVehicles()}</div>
            <div className="text-sm text-muted-foreground">Total des véhicules</div>
            </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{getTotalSeats()}</div>
            <div className="text-sm text-muted-foreground">Places disponibles</div>
          </div>
        </div>
      </div>

      {/* Error and Success Messages */}
      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {addSuccess && (
        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-md flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {addSuccess}
            </div>
          )}
          
      {/* Add Vehicle Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Ajouter un véhicule à la file de nuit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input 
                placeholder="Entrez la plaque d'immatriculation"
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && cin.trim() && handleVehicleSelection(cin.trim())}
                disabled={isAddingVehicle}
              />
              {addError && (
                <p className="text-sm text-destructive mt-1">{addError}</p>
              )}
            </div>
            <Button 
              onClick={() => {
                if (cin.trim()) {
                  handleVehicleSelection(cin.trim());
                } else {
                  setAddError('Veuillez entrer la plaque d\'immatriculation');
                }
              }}
              disabled={isAddingVehicle || !cin.trim()}
            >
              {isAddingVehicle ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Ajout en cours...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un véhicule
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Available Vehicles Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Véhicules disponibles ({availableVehicles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingVehicles ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          ) : availableVehicles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {availableVehicles.map((vehicle) => (
                <div 
                  key={vehicle.id} 
                  className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleVehicleSelection(vehicle.licensePlate || '')}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{vehicle.licensePlate}</div>
                      <div className="text-sm text-muted-foreground">
                        {vehicle.capacity} places
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-blue-600">
                        Cliquer pour ajouter
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Aucun véhicule disponible</h3>
              <p className="text-sm mb-4">
                Aucun véhicule n'est disponible pour la file de nuit.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer to Regular Queue */}
      {getTotalVehicles() > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Transférer vers la file normale</h3>
                <p className="text-sm text-muted-foreground">
                  Déplacez tous les véhicules de la file de nuit vers la file normale pour un départ immédiat
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={handleTransferToRegular}
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Transférer tous ({getTotalVehicles()})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overnight Queues */}
      {Object.keys(queues).length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Car className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucune file de nuit</h3>
              <p className="text-muted-foreground">
                Aucun véhicule n'est actuellement dans la file de nuit. Ajoutez des véhicules en utilisant le formulaire ci-dessus.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(queues).map(([destinationId, queue]) => (
            <Card key={destinationId}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    {queue[0]?.destinationName || destinationId}
                  </div>
                  <Badge variant="secondary">
                    {queue.length} véhicule{queue.length !== 1 ? 's' : ''}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {queue.map((vehicle, index) => (
                    <div 
                      key={vehicle.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{vehicle.licensePlate}</span>
                        </div>
                        <Badge variant="outline">
                          #{vehicle.queuePosition}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            Plaque: {vehicle.licensePlate}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {vehicle.availableSeats}/{vehicle.totalSeats} places
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">
                            Ajouté à {formatTime(vehicle.enteredAt)}
                          </div>
                        </div>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveVehicle(vehicle.licensePlate)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
              </div>
      )}

      {/* Destination Selection Modal */}
      {showDestinationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Sélectionner la destination</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Véhicule sélectionné: <span className="font-medium">{selectedVehicle}</span>
            </p>
            {selectedVehicleData && (
              <p className="text-xs text-muted-foreground mb-4">
                Capacité: {selectedVehicleData.capacity} places | 
                Stations autorisées: {selectedVehicleData.authorizedStations?.length || 0}
              </p>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Destination pour la file de nuit</label>
              {destinations.length > 0 ? (
                <select
                  value={selectedDestination}
                  onChange={(e) => setSelectedDestination(e.target.value)}
                  className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="">Sélectionner une destination...</option>
                  {destinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-4 border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 rounded-md">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ Ce véhicule n'est autorisé pour aucune station. 
                    Veuillez d'abord autoriser ce véhicule pour des stations dans la gestion des véhicules.
                  </p>
                </div>
              )}
            </div>

            {addError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-md text-sm">
                {addError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDestinationModal(false);
                  setSelectedVehicle('');
                  setSelectedVehicleData(null);
                  setSelectedDestination('');
                  setAddError(null);
                  // Reload full destinations list
                  loadDestinations();
                }}
                disabled={isAddingVehicle}
              >
                Annuler
              </Button>
              <Button
                onClick={handleAddVehicleToOvernightQueue}
                disabled={isAddingVehicle || !selectedDestination || destinations.length === 0}
              >
                {isAddingVehicle ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Ajout en cours...
                  </>
                ) : (
                  'Ajouter à la file de nuit'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 