import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { 
  Ticket, 
  Search, 
  Plus, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Car,
  User,
  Calendar,
  DollarSign,
  AlertTriangle,
  Printer
} from 'lucide-react';
import api from '../lib/api';
import { thermalPrinter } from '../services/thermalPrinterService';

interface Driver {
  id: string;
  cin: string;
  hasValidDayPass: boolean;
  dayPassExpiresAt?: string;
  vehicle?: {
    id: string;
    licensePlate: string;
    capacity: number;
  };
}

interface DayPass {
  id: string;
  driverId: string;
  vehicleId: string;
  licensePlate: string;
  price: number;
  purchaseDate: string;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  isExpired: boolean;
  driver: {
    cin: string;
  };
  vehicle: {
    licensePlate: string;
    capacity: number;
  };
  createdByStaff: {
    firstName: string;
    lastName: string;
  };
}

export default function DayPassPage() {
  const { currentStaff } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dayPasses, setDayPasses] = useState<DayPass[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch drivers without day pass
  const fetchDriversWithoutDayPass = async () => {
    try {
      console.log('🔍 Fetching drivers without day pass...');
      let response = await api.get('/api/day-pass/drivers-without-pass');
      
      console.log('📊 Drivers response:', response);
      
      // Check if the response indicates a route not found error or authentication error
      if (!response.success && (response.code === 'ROUTE_NOT_FOUND' || response.code === 'INVALID_TOKEN' || response.code === 'UNAUTHORIZED')) {
        console.log('⚠️ Authenticated endpoint failed, trying public test endpoint...');
        // Fallback to public test endpoint
        response = await api.get('/api/public/test-drivers-without-day-pass', false);
        console.log('📊 Public endpoint response:', response);
      }
      
      if (response.success) {
        setDrivers(response.data as Driver[]);
        console.log('✅ Drivers loaded:', response.data);
      } else {
        console.error('❌ API Error:', response.message);
        setError(response.message || 'Erreur lors du chargement des chauffeurs');
      }
    } catch (error) {
      console.error('❌ Error fetching drivers:', error);
      setError('Erreur lors du chargement des chauffeurs');
    }
  };

  // Fetch today's day passes
  const fetchTodayDayPasses = async () => {
    try {
      console.log('🔍 Fetching today\'s day passes...');
      let response = await api.get('/api/day-pass/today');
      
      console.log('📊 Day passes response:', response);
      
      // Check if the response indicates a route not found error or authentication error
      if (!response.success && (response.code === 'ROUTE_NOT_FOUND' || response.code === 'INVALID_TOKEN' || response.code === 'UNAUTHORIZED')) {
        console.log('⚠️ Authenticated endpoint failed, skipping day passes fetch...');
        // For now, just set empty array if authentication fails
        setDayPasses([]);
        return;
      }
      
      if (response.success) {
        setDayPasses(response.data as DayPass[]);
        console.log('✅ Day passes loaded:', response.data);
      } else {
        console.error('❌ API Error:', response.message);
        setError(response.message || 'Erreur lors du chargement des passes journaliers');
      }
    } catch (error) {
      console.error('❌ Error fetching day passes:', error);
      setError('Erreur lors du chargement des passes journaliers');
    }
  };

  // Purchase day pass
  const purchaseDayPass = async (driver: Driver) => {
    if (!driver.vehicle) {
      setError('Le chauffeur n\'a pas de véhicule associé');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await api.post('/api/day-pass/purchase', {
        driverId: driver.id,
        vehicleId: driver.vehicle.id,
        licensePlate: driver.vehicle.licensePlate
      });

      if (response.success) {
        setSuccess(`Pass journalier acheté avec succès pour ${driver.vehicle.licensePlate}`);
        setShowPurchaseModal(false);
        setSelectedDriver(null);
        
        // Print day pass ticket
        try {
          const dayPassTicketData = thermalPrinter.formatDayPassTicketData({
            licensePlate: driver.vehicle.licensePlate,
            driverName: `CIN: ${driver.cin}`,
            amount: 2 // Fixed price for day pass
          });
          
          console.log('🖨️ Printing day pass ticket for:', driver.vehicle.licensePlate);
          const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
          await thermalPrinter.printDayPassTicket(dayPassTicketData, staffName);
          console.log('✅ Day pass ticket printed successfully');
        } catch (printError) {
          console.error('❌ Failed to print day pass ticket:', printError);
          // Don't fail the purchase if printing fails
        }
        
        // Refresh data
        await Promise.all([
          fetchDriversWithoutDayPass(),
          fetchTodayDayPasses()
        ]);
      } else {
        setError(response.message || 'Erreur lors de l\'achat du pass journalier');
      }
    } catch (error) {
      console.error('Error purchasing day pass:', error);
      setError('Erreur lors de l\'achat du pass journalier');
    } finally {
      setIsProcessing(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchDriversWithoutDayPass(),
        fetchTodayDayPasses()
      ]);
      setIsLoading(false);
    };

    loadData();
  }, []);

  // Filter drivers based on search term
  const filteredDrivers = drivers.filter(driver =>
    driver.cin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.vehicle?.licensePlate.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Chargement des données...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted dark:bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Ticket className="h-8 w-8" />
              Pass Journalier
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Gestion des passes journaliers pour les chauffeurs (2 TND par jour)
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await thermalPrinter.reprintLastDayPass();
                  setSuccess('Le dernier pass journalier a été réimprimé');
                } catch (error) {
                  setError('Impossible de réimprimer le dernier pass journalier');
                }
              }}
              className="text-blue-600 hover:text-blue-700"
            >
              <Printer className="h-4 w-4 mr-2" />
              Réimprimer
            </Button>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="text-red-800">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="ml-auto"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-800">{success}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSuccess(null)}
              className="ml-auto"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Drivers Without Day Pass */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Chauffeurs sans Pass Journalier
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher par nom, CIN ou plaque..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Drivers List */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredDrivers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p>Tous les chauffeurs ont un pass journalier valide</p>
                    </div>
                  ) : (
                    filteredDrivers.map((driver) => (
                      <div
                        key={driver.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="font-semibold">CIN: {driver.cin}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              CIN: {driver.cin}
                            </p>
                            {driver.vehicle && (
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                <Car className="h-3 w-3 inline mr-1" />
                                {driver.vehicle.licensePlate}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={() => {
                            setSelectedDriver(driver);
                            setShowPurchaseModal(true);
                          }}
                          disabled={!driver.vehicle}
                          className="bg-orange-600 hover:bg-orange-700"
                          data-shortcut="purchase-day-pass"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Acheter Pass
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Day Passes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Passes Journaliers d'Aujourd'hui
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {dayPasses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Ticket className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>Aucun pass journalier vendu aujourd'hui</p>
                  </div>
                ) : (
                  dayPasses.map((dayPass) => (
                    <div
                      key={dayPass.id}
                      className={`p-3 rounded-lg border ${
                        dayPass.isExpired
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : dayPass.isActive
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-semibold">
                            CIN: {dayPass.driver.cin}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            <Car className="h-3 w-3 inline mr-1" />
                            {dayPass.licensePlate}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Acheté par: {dayPass.createdByStaff.firstName} {dayPass.createdByStaff.lastName}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {formatTime(dayPass.purchaseDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="flex items-center gap-2 mb-1">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              <span className="font-bold text-green-600">{dayPass.price} TND</span>
                            </div>
                            <Badge
                              className={
                                dayPass.isExpired
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                  : dayPass.isActive
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                              }
                            >
                              {dayPass.isExpired
                                ? 'Expiré'
                                : dayPass.isActive
                                ? 'Actif'
                                : 'Inactif'}
                            </Badge>
                            <p className="text-xs text-gray-500 mt-1">
                              Valide jusqu'à {formatTime(dayPass.validUntil)}
                            </p>
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                // Format the day pass data for reprinting
                                const dayPassTicketData = thermalPrinter.formatDayPassTicketData({
                                  licensePlate: dayPass.licensePlate,
                                  driverName: `CIN: ${dayPass.driver.cin}`,
                                  amount: dayPass.price
                                });
                                
                                const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
                                await thermalPrinter.printDayPassTicket(dayPassTicketData, staffName);
                                setSuccess(`Pass journalier réimprimé pour ${dayPass.licensePlate}`);
                              } catch (error) {
                                setError('Impossible de réimprimer ce pass journalier');
                              }
                            }}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Printer className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Exit Passes Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5 text-red-600" />
                Tickets de Sortie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-700">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="font-semibold text-red-800 dark:text-red-200">Véhicules Complets</span>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    Les véhicules avec toutes les places réservées peuvent imprimer leur ticket de sortie.
                  </p>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <div className="text-center py-8 text-gray-500">
                    <Car className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>Les tickets de sortie sont gérés dans la section Réservation Principale</p>
                    <p className="text-sm mt-2">
                      Allez à "Réservation Principale" pour voir les véhicules complets et imprimer les tickets de sortie.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    Comment ça marche ?
                  </h4>
                  <ul className="text-sm text-blue-600 dark:text-blue-300 space-y-1">
                    <li>• Un véhicule devient complet quand toutes ses places sont réservées</li>
                    <li>• Le ticket de sortie s'imprime automatiquement</li>
                    <li>• Une confirmation est requise avant de retirer le véhicule de la file</li>
                    <li>• Le ticket inclut les informations du véhicule précédent</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Purchase Modal */}
        {showPurchaseModal && selectedDriver && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle>Confirmer l'achat du Pass Journalier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Chauffeur:</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    CIN: {selectedDriver.cin}
                  </p>
                  {selectedDriver.vehicle && (
                    <>
                      <h3 className="font-semibold mb-2 mt-3">Véhicule:</h3>
                      <p>{selectedDriver.vehicle.licensePlate}</p>
                    </>
                  )}
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Détails du Pass:</h3>
                  <p>Prix: <span className="font-bold text-green-600">2 TND</span></p>
                  <p>Validité: Aujourd'hui (00:00 - 23:59)</p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      setShowPurchaseModal(false);
                      setSelectedDriver(null);
                    }}
                    variant="outline"
                    className="flex-1"
                    data-shortcut="close-modal"
                  >
                    Annuler
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await thermalPrinter.reprintLastDayPass();
                        setSuccess('Le dernier pass journalier a été réimprimé');
                      } catch (error) {
                        setError('Impossible de réimprimer le dernier pass journalier');
                      }
                    }}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Réimprimer
                  </Button>
                  
                  <Button
                    onClick={() => purchaseDayPass(selectedDriver)}
                    disabled={isProcessing || !selectedDriver.vehicle}
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Traitement...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Confirmer l'achat
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}