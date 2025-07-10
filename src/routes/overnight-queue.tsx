import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Loader2, Plus, Trash2, Car, Users, MapPin, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../lib/api';
import { getWebSocketClient } from '../lib/websocket';
import { useAuth } from '../context/AuthProvider';

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
    model?: string;
    color?: string;
    driver?: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
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
  const { isAuthenticated } = useAuth();

  const wsClient = getWebSocketClient();

  // Load overnight queues
  const loadOvernightQueues = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await api.getOvernightQueues();
      
      if (response.success && response.data) {
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

  // Load available vehicles for overnight queue
  const loadAvailableVehicles = async () => {
    try {
      setIsLoadingVehicles(true);
      
      const response = await api.getVehicles();
      
      if (response.success && response.data) {
        // Filter vehicles that are active, available, and not in any queue
        const available = response.data.filter((vehicle: any) => 
          vehicle.isActive && 
          vehicle.isAvailable && 
          vehicle.driver?.cin
        );
        setAvailableVehicles(available);
      }
    } catch (error: any) {
      console.error('Error loading available vehicles:', error);
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  // Add vehicle to overnight queue by CIN
  const handleAddVehicle = async () => {
    if (!cin.trim()) {
      setAddError('Veuillez entrer le CIN du conducteur');
      return;
    }

    try {
      setIsAddingVehicle(true);
      setAddError(null);
      setAddSuccess(null);

      const response = await api.addVehicleToOvernightQueueByCIN(cin.trim());
      
      if (response.success) {
        setAddSuccess(response.message || 'Véhicule ajouté avec succès');
        setCin('');
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
      const response = await api.removeVehicleFromOvernightQueue(licensePlate);
      
      if (response.success) {
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
      const response = await api.transferOvernightToRegular();
      
      if (response.success) {
        setAddSuccess(response.message || 'Véhicules transférés avec succès');
        // Reload queues to show the transfer
        await loadOvernightQueues();
      } else {
        setError(response.message || 'Échec du transfert des véhicules');
      }
    } catch (error: any) {
      setError(error.message || 'Une erreur est survenue lors du transfert des véhicules');
    }
  };

  // Setup WebSocket listeners for real-time updates
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleOvernightQueueUpdate = (data: any) => {
      console.log('Received overnight queue update:', data);
      // Reload queues when we receive an update
      loadOvernightQueues();
    };

    const handleQueueUpdate = (data: any) => {
      console.log('Received queue update:', data);
      // Reload queues when we receive an update
      loadOvernightQueues();
    };

    // Subscribe to overnight queue updates
    wsClient.subscribe(['overnight_queue', 'queue']).catch(console.error);

    // Listen for updates
    wsClient.on('overnight_queue_update', handleOvernightQueueUpdate);
    wsClient.on('queue_update', handleQueueUpdate);

    // Initial load
    loadOvernightQueues();
    loadAvailableVehicles();

    return () => {
      wsClient.removeListener('overnight_queue_update', handleOvernightQueueUpdate);
      wsClient.removeListener('queue_update', handleQueueUpdate);
    };
  }, [isAuthenticated, wsClient]);

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
                placeholder="Entrez le CIN du conducteur"
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddVehicle()}
                disabled={isAddingVehicle}
              />
              {addError && (
                <p className="text-sm text-destructive mt-1">{addError}</p>
              )}
            </div>
            <Button 
              onClick={handleAddVehicle} 
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
                  onClick={() => setCin(vehicle.driver?.cin || '')}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{vehicle.licensePlate}</div>
                      <div className="text-sm text-muted-foreground">
                        {vehicle.driver?.firstName} {vehicle.driver?.lastName}
        </div>
                      <div className="text-xs text-muted-foreground">
                        CIN: {vehicle.driver?.cin}
      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{vehicle.capacity} places</div>
                      <div className="text-xs text-muted-foreground">{vehicle.model}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              Aucun véhicule disponible trouvé
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
                            {vehicle.vehicle?.driver?.firstName} {vehicle.vehicle?.driver?.lastName}
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
    </div>
  );
} 