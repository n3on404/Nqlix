import { useState } from "react";
import { Button } from "../components/ui/button";
import { useInit } from "../context/InitProvider";
import { Users, MapPin, CreditCard, Ticket, PrinterIcon, AlertTriangle } from "lucide-react";

// Types for the data structures
interface VehicleQueue {
  id: string;
  queuePosition: number;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  status: string;
}

// Mock data - replace with actual API calls later
const mockDestinations = [
  "Tunis",
  "Sfax", 
  "Sousse",
  "Monastir",
  "Gabès",
  "Gafsa",
  "Kairouan",
  "Bizerte",
  "Ariana",
  "Ben Arous"
];

const mockVehicleQueues: Record<string, VehicleQueue[]> = {
  "Tunis": [
    { id: "tunis-1", queuePosition: 1, availableSeats: 8, totalSeats: 12, basePrice: 15.50, status: "En attente" },
    { id: "tunis-2", queuePosition: 2, availableSeats: 5, totalSeats: 12, basePrice: 15.50, status: "En attente" },
    { id: "tunis-3", queuePosition: 3, availableSeats: 12, totalSeats: 12, basePrice: 15.50, status: "Prêt" }
  ],
  "Sfax": [
    { id: "sfax-1", queuePosition: 1, availableSeats: 6, totalSeats: 12, basePrice: 18.00, status: "En attente" },
    { id: "sfax-2", queuePosition: 2, availableSeats: 10, totalSeats: 12, basePrice: 18.00, status: "Prêt" }
  ],
  "Sousse": [
    { id: "sousse-1", queuePosition: 1, availableSeats: 4, totalSeats: 12, basePrice: 12.00, status: "En attente" },
    { id: "sousse-2", queuePosition: 2, availableSeats: 12, totalSeats: 12, basePrice: 12.00, status: "Prêt" }
  ],
  "Monastir": [
    { id: "monastir-1", queuePosition: 1, availableSeats: 7, totalSeats: 12, basePrice: 10.50, status: "En attente" }
  ],
  "Gabès": [
    { id: "gabes-1", queuePosition: 1, availableSeats: 9, totalSeats: 12, basePrice: 20.00, status: "Prêt" }
  ],
  "Gafsa": [
    { id: "gafsa-1", queuePosition: 1, availableSeats: 3, totalSeats: 12, basePrice: 22.50, status: "En attente" }
  ],
  "Kairouan": [
    { id: "kairouan-1", queuePosition: 1, availableSeats: 11, totalSeats: 12, basePrice: 14.00, status: "Prêt" }
  ],
  "Bizerte": [
    { id: "bizerte-1", queuePosition: 1, availableSeats: 6, totalSeats: 12, basePrice: 13.50, status: "En attente" }
  ],
  "Ariana": [
    { id: "ariana-1", queuePosition: 1, availableSeats: 8, totalSeats: 12, basePrice: 8.00, status: "Prêt" }
  ],
  "Ben Arous": [
    { id: "benarous-1", queuePosition: 1, availableSeats: 5, totalSeats: 12, basePrice: 7.50, status: "En attente" }
  ]
};

export default function CreateBooking() {
  const { systemStatus } = useInit();
  const [selectedDestination, setSelectedDestination] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [seatsRequested, setSeatsRequested] = useState(1);
  const [selectedQueue, setSelectedQueue] = useState("");

  const destinations = mockDestinations;
  const availableQueues = selectedDestination ? mockVehicleQueues[selectedDestination] || [] : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Create booking logic
    console.log("Creating booking...", {
      selectedDestination,
      customerName,
      customerPhone,
      seatsRequested,
      selectedQueue
    });
  };

  return (
    <div className="flex flex-col h-full w-full p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Créer une nouvelle réservation</h1>
        <p className="text-muted-foreground">Réservez des billets pour les clients sans réservation</p>
        
        {/* Printer Status Indicator */}
        <div className="mt-4">
          <div className={`inline-flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium ${
            systemStatus.printerConnected 
              ? 'bg-green-100 text-green-700 border border-green-200' 
              : 'bg-red-100 text-red-700 border border-red-200'
          }`}>
            {systemStatus.printerConnected ? (
              <>
                <Ticket className="h-4 w-4" />
                <span>Imprimante prête - Les billets peuvent être émis</span>
              </>
            ) : (
              <>
                <PrinterIcon className="h-4 w-4" />
                <span>Imprimante indisponible - Réservation temporairement désactivée</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Printer Warning */}
      {!systemStatus.printerConnected && (
        <div className="max-w-2xl">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800">Réservation temporairement indisponible</h3>
                <p className="text-xs text-red-700 mt-1">
                  L'imprimante thermique n'est pas connectée, les billets ne peuvent donc pas être imprimés. Veuillez vous assurer que l'imprimante est connectée et fonctionne avant de créer des réservations.
                </p>
                <p className="text-xs text-red-700 mt-2">
                  <strong>Remarque :</strong> Les réservations nécessitent l'impression immédiate du billet pour la vérification du client.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Information */}
          <div className="bg-card rounded-lg border p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Informations du client
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom complet *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Entrez le nom du client"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Numéro de téléphone</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+216 XX XXX XXX"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                />
              </div>
            </div>
          </div>

          {/* Destination Selection */}
          <div className="bg-card rounded-lg border p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Destination
            </h2>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Sélectionnez la destination *</label>
              <select
                value={selectedDestination}
                onChange={(e) => setSelectedDestination(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                required
              >
                <option value="">Choisissez une destination...</option>
                {destinations.map((dest: string) => (
                  <option key={dest} value={dest}>{dest}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Vehicle Selection */}
          {selectedDestination && (
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center">
                <Ticket className="h-5 w-5 mr-2" />
                Véhicules disponibles
              </h2>
              
              <div className="space-y-3">
                {availableQueues.length === 0 ? (
                  <p className="text-muted-foreground">Aucun véhicule disponible pour {selectedDestination}</p>
                ) : (
                  availableQueues.map((queue: VehicleQueue) => (
                    <div 
                      key={queue.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedQueue === queue.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedQueue(queue.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Position {queue.queuePosition}</p>
                          <p className="text-sm text-muted-foreground">
                            {queue.availableSeats}/{queue.totalSeats} places disponibles
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{queue.basePrice} TND/place</p>
                          <p className="text-sm text-muted-foreground">{queue.status}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Booking Details */}
          {selectedQueue && (
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Détails de la réservation
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nombre de places *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={seatsRequested}
                    onChange={(e) => setSeatsRequested(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Montant total</label>
                  <div className="text-2xl font-bold">
                    {(seatsRequested * (availableQueues.find((q: VehicleQueue) => q.id === selectedQueue)?.basePrice || 0)).toFixed(2)} TND
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3">
            <Button 
              type="submit" 
              disabled={!customerName || !selectedDestination || !selectedQueue || !systemStatus.printerConnected}
              className={`flex-1 ${!systemStatus.printerConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={!systemStatus.printerConnected ? 'Printer must be connected to create bookings' : ''}
            >
              {systemStatus.printerConnected ? (
                <>
                  <Ticket className="h-4 w-4 mr-2" />
                  Create Booking
                </>
              ) : (
                <>
                  <PrinterIcon className="h-4 w-4 mr-2" />
                  Booking Unavailable
                </>
              )}
            </Button>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
} 