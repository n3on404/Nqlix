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
  Loader2
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
import { getWebSocketClient } from "../lib/websocket";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import api from "../lib/api";

// Sortable queue item component
interface SortableQueueItemProps {
  queue: any;
  getStatusColor: (status: string) => string;
  formatTime: (dateString: string) => string;
  getBasePriceForDestination: (destinationName: string) => number | undefined;
}

function SortableQueueItem({ queue, getStatusColor, formatTime, getBasePriceForDestination }: SortableQueueItemProps) {
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
        {/* Vehicle Info */}
        <div className="flex items-center gap-4 flex-1">
          <div className="p-3 bg-accent rounded-xl flex items-center justify-center">
            <Car className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-white text-lg tracking-wide">{queue.vehicle?.licensePlate}</p>
            <p className="text-sm text-muted-foreground font-medium">{queue.vehicle?.driver?.firstName} {queue.vehicle?.driver?.lastName}</p>
          </div>
        </div>
      </div>
      {/* Divider for wide screens */}
      <div className="hidden md:block h-16 w-px bg-primary/20 mx-4" />
      {/* Right: Status & Actions */}
      <div className="flex flex-col md:flex-row items-center gap-6 flex-shrink-0">
        {/* Seats */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <Users className="h-5 w-5 text-white" />
            <span className="font-bold text-white text-lg">{queue.availableSeats}/{queue.availableSeats + (queue.totalSeats - queue.availableSeats)}</span>
          </div>
          <p className="text-xs text-muted-foreground">places disponibles</p>
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

// Utility to normalize destination names
function normalizeDestinationName(name: string) {
  return name.replace(/^STATION /i, "").toUpperCase().trim();
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

  // Helper to get base price for a destination
  function getBasePriceForDestination(destinationName: string) {
    const route = routes.find(r => r.destinationName?.toUpperCase() === destinationName?.toUpperCase());
    return route?.basePrice;
  }

  // Real-time notifications for queue/vehicle events
  useEffect(() => {
    if (!isWebSocketConnected) return;
    const wsClient = getWebSocketClient();
    const queueHandler = (msg: any) => {
      if (msg?.payload?.queue) {
        addNotification({
          type: 'info',
          title: 'Queue Update',
          message: `Véhicule ${msg.payload.queue.vehicle?.licensePlate || ''} mis à jour dans la file d'attente ${msg.payload.queue.destinationName}`,
          duration: 4000
        });
      }
    };
    wsClient.on('queue_update', queueHandler);
    return () => {
      wsClient.removeListener('queue_update', queueHandler);
    };
  }, [isWebSocketConnected, addNotification]);

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

  // Fetch all routes on mount
  useEffect(() => {
    api.get("/api/routes").then(res => {
      if (res.success && Array.isArray(res.data)) {
        setRoutes(res.data);
      } else {
        setRoutes([]);
      }
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
  const vehiclesInAnyQueue = allQueueItems.map(q => {
    // Use the correct property path from QueueItem interface
    return (
      (q.vehicle && q.vehicle.licensePlate) ||
      ""
    ).toUpperCase().trim();
  });

  // Debug logging
  console.log('queues', queues);
  console.log('vehiclesInAnyQueue', vehiclesInAnyQueue);
  console.log('vehicles', vehicles);

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
          {addVehicleError && (
            <div className="text-destructive text-sm mt-3 bg-destructive/10 p-3 rounded-lg border border-destructive/30">
              {addVehicleError}
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button
              onClick={async () => {
                if (!selectedVehicle) return;
                setActionLoading(selectedVehicle.licensePlate);
                setAddVehicleError(null);
                const result = await handleEnterQueue(selectedVehicle.licensePlate);
                setActionLoading(null);
                if (result?.success) {
                  setShowAddVehicleModal(false);
                  setSelectedVehicle(null);
                } else if (result?.message) {
                  setAddVehicleError(result.message);
                }
              }}
              disabled={!selectedVehicle || !!actionLoading}
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
                <CardTitle className="text-lg font-semibold text-gray-900">{summary.destinationName}</CardTitle>
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