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
  AlertTriangle,
  Printer
} from 'lucide-react';
import { dbClient } from '../services/dbClient';
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
  driver?: {
    cin: string;
  };
  vehicle?: {
    licensePlate: string;
    capacity: number;
  };
  createdByStaff?: {
    firstName?: string;
    lastName?: string;
  };
  createdBy?: string;
}

interface ExitPass {
  id: string;
  vehicleId: string;
  licensePlate: string;
  destinationId: string;
  destinationName: string;
  currentExitTime: string;
  createdAt: string;
}

export default function DayPassPage() {
  const { currentStaff } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dayPasses, setDayPasses] = useState<DayPass[]>([]);
  const [exitPasses, setExitPasses] = useState<ExitPass[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch drivers without day pass (direct DB)
  const fetchDriversWithoutDayPass = async () => {
    try {
      const data = await dbClient.getQueuedWithoutDayPass();
      setDrivers(data as Driver[]);
    } catch (error) {
      setError('Erreur lors du chargement des chauffeurs');
    }
  };

  // Fetch today's day passes (direct DB) - only latest per vehicle
  const fetchTodayDayPasses = async () => {
    try {
      const data = await dbClient.getTodayDayPasses();
      const allDayPasses = Array.isArray(data) ? data as DayPass[] : [];
      
      // Group by vehicle and keep only the latest (first since ordered by purchase_date DESC)
      const latestDayPassesByVehicle = new Map<string, DayPass>();
      
      allDayPasses.forEach(dayPass => {
        const licensePlate = dayPass.licensePlate;
        if (!latestDayPassesByVehicle.has(licensePlate)) {
          latestDayPassesByVehicle.set(licensePlate, dayPass);
        }
      });
      
      // Convert map values to array
      const latestDayPasses = Array.from(latestDayPassesByVehicle.values());
      setDayPasses(latestDayPasses);
    } catch (error) {
      setError('Erreur lors du chargement des passes journaliers');
    }
  };

  // Fetch recent exit passes (within 10 minutes)
  const fetchRecentExitPasses = async () => {
    try {
      const data = await dbClient.getRecentExitPasses();
      setExitPasses(Array.isArray(data) ? data as ExitPass[] : []);
    } catch (error) {
      setError('Erreur lors du chargement des tickets de sortie');
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
      // Check if vehicle already has a valid day pass
      const hasValidDayPass = await dbClient.hasDayPassToday(driver.vehicle.licensePlate);
      
      if (hasValidDayPass) {
        // Vehicle already has a valid day pass - print with 0 TND
        setSuccess(`Pass journalier valide trouvé pour ${driver.vehicle.licensePlate} - Ticket imprimé avec 0 TND`);
        setShowPurchaseModal(false);
        setSelectedDriver(null);
        
        // Print day pass ticket with 0 TND
        try {
          const dayPassTicketData = thermalPrinter.formatDayPassTicketData({
            licensePlate: driver.vehicle.licensePlate,
            amount: 0, // 0 TND because day pass is already valid
            staffName: currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'Staff'
          });
          
          console.log('🖨️ Printing day pass ticket (0 TND) for:', driver.vehicle.licensePlate);
          const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
          await thermalPrinter.printDayPassTicket(dayPassTicketData, staffName);
          console.log('✅ Day pass ticket (0 TND) printed successfully');
        } catch (printError) {
          console.error('❌ Failed to print day pass ticket:', printError);
          // Don't fail the purchase if printing fails
        }
      } else {
        // No valid day pass - purchase new one for 2 TND
        const result = await dbClient.purchaseDayPass(
          driver.vehicle.licensePlate,
          driver.vehicle.id,
          2.0, // Fixed price for new day pass
          currentStaff?.id
        );
        
        setSuccess(`Pass journalier acheté avec succès pour ${driver.vehicle.licensePlate} - 2 TND`);
        setShowPurchaseModal(false);
        setSelectedDriver(null);
        
        // Print day pass ticket with 2 TND
        try {
          const dayPassTicketData = thermalPrinter.formatDayPassTicketData({
            licensePlate: driver.vehicle.licensePlate,
            amount: 2, // 2 TND for new day pass
            staffName: currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'Staff'
          });
          
          console.log('🖨️ Printing day pass ticket (2 TND) for:', driver.vehicle.licensePlate);
          const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
          await thermalPrinter.printDayPassTicket(dayPassTicketData, staffName);
          console.log('✅ Day pass ticket (2 TND) printed successfully');
        } catch (printError) {
          console.error('❌ Failed to print day pass ticket:', printError);
          // Don't fail the purchase if printing fails
        }
      }
      
      // Refresh data
      await Promise.all([
        fetchDriversWithoutDayPass(),
        fetchTodayDayPasses(),
        fetchRecentExitPasses()
      ]);
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
      setError(null);
      
      try {
        // Check database health first
        const dbHealthy = await dbClient.health();
        console.log('🔍 [DAY PASS DEBUG] Database health:', dbHealthy);
        
        if (!dbHealthy) {
          throw new Error('Database connection is not healthy');
        }
        
        await Promise.all([
          fetchDriversWithoutDayPass(),
          fetchTodayDayPasses(),
          fetchRecentExitPasses()
        ]);
      } catch (error: any) {
        console.error('❌ [DAY PASS DEBUG] Error loading data:', error);
        setError(`Erreur lors du chargement des données: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Filter drivers based on search term
  const filteredDrivers = drivers.filter(driver =>
        // Driver CIN removed - no longer supported
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Modern Header */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl shadow-lg">
                <Ticket className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-800 dark:text-white">
                  Pass Journalier
                </h1>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  Gestion des passes journaliers pour les chauffeurs
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={async () => {
                  setIsRefreshing(true);
                  await Promise.all([
                    fetchDriversWithoutDayPass(),
                    fetchTodayDayPasses(),
                    fetchRecentExitPasses()
                  ]);
                  setIsRefreshing(false);
                }}
                className="px-6 py-2 border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Actualisation...
                  </>
                ) : (
                  'Actualiser'
                )}
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await thermalPrinter.reprintLastDayPass();
                    setSuccess('Le dernier pass journalier a été réimprimé');
                  } catch (error) {
                    setError('Impossible de réimprimer le dernier pass journalier');
                  }
                }}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg"
              >
                <Printer className="h-4 w-4 mr-2" />
                Réimprimer
              </Button>
            </div>
          </div>
        </div>

        {/* Modern Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Passes d'Aujourd'hui</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{dayPasses.length}</p>
                <p className="text-xs text-slate-500 mt-1">~ {(dayPasses.length * 2).toFixed(2)} TND</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-xl">
                <Ticket className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Tickets de Sortie</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{exitPasses.length}</p>
                <p className="text-xs text-slate-500 mt-1">Véhicules complets</p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-xl">
                <Car className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Taux d'Activité</p>
                <p className="text-3xl font-bold text-emerald-600 mt-2">
                  {dayPasses.length + drivers.length > 0
                    ? Math.round((dayPasses.length / (dayPasses.length + drivers.length)) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-slate-500 mt-1">Vendus vs en attente</p>
              </div>
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/20 rounded-xl">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
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

        {/* Modern Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Today's Day Passes */}
          <Card className="flex flex-col h-[600px]">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Passes Journaliers d'Aujourd'hui
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <div className="space-y-2 h-full overflow-y-auto">
                {dayPasses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Ticket className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>Aucun pass journalier vendu aujourd'hui</p>
                  </div>
                ) : (
                  dayPasses.map((dayPass) => (
                    <div
                      key={dayPass.id}
                      className={`p-4 rounded-lg border ${
                        dayPass.isExpired
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : dayPass.isActive
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge className="bg-white text-gray-900 border">{dayPass.licensePlate}</Badge>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Acheté par: {(dayPass.createdByStaff?.firstName || '')} {(dayPass.createdByStaff?.lastName || '')}{(!dayPass.createdByStaff && dayPass.createdBy) ? ` (${dayPass.createdBy})` : ''}
                            <div className="text-xs mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {formatTime(dayPass.purchaseDate)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="flex items-center gap-2 mb-1">
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
                                const dayPassTicketData = thermalPrinter.formatDayPassTicketData({
                                  licensePlate: dayPass.licensePlate,
                                  amount: dayPass.price,
                                  staffName: currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : 'Staff'
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
          <Card className="flex flex-col h-[600px]">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5 text-red-600" />
                Tickets de Sortie
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <div className="space-y-4 h-full flex flex-col">
                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
                  {exitPasses.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Car className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p>Aucun ticket de sortie généré aujourd'hui</p>
                      <p className="text-sm mt-2">
                        Les tickets de sortie sont créés automatiquement quand un véhicule devient complet.
                      </p>
                    </div>
                  ) : (
                    exitPasses.map((exitPass) => (
                      <div
                        key={exitPass.id}
                        className="p-4 rounded-lg border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge className="bg-white text-gray-900 border">{exitPass.licensePlate}</Badge>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              <div className="font-medium">{exitPass.destinationName}</div>
                              <div className="text-xs mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {formatTime(exitPass.currentExitTime)}
                              </div>
                              <div className="text-xs mt-1">
                                Créé: {formatTime(exitPass.createdAt)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                Véhicule Complet
                              </Badge>
                              <p className="text-xs text-gray-500 mt-1">
                                Sortie: {formatTime(exitPass.currentExitTime)}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  console.log('🖨️ DEBUG: Reprinting exit pass for:', exitPass.licensePlate);
                                  
                                  // Construct exit pass data for reprinting
                                  const exitPassData = {
                                    licensePlate: exitPass.licensePlate,
                                    destinationName: exitPass.destinationName,
                                    previousLicensePlate: null, // We don't have previous vehicle data in this context
                                    previousExitTime: null,
                                    currentExitTime: exitPass.currentExitTime, // Use correct field name
                                    totalSeats: 8, // Default capacity, could be fetched from vehicle data
                                    basePricePerSeat: 2.0, // Default price, could be fetched from route data
                                    totalBasePrice: 16.0 // Default total
                                  };
                                  
                                  console.log('🖨️ DEBUG: Exit pass data for reprint:', exitPassData);
                                  
                                  // Format and print the exit pass ticket
                                  const exitPassTicketData = thermalPrinter.formatExitPassTicketData(exitPassData);
                                  const staffName = currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName}` : undefined;
                                  
                                  console.log('🖨️ DEBUG: Calling thermal printer...');
                                  await thermalPrinter.printExitPassTicket(exitPassTicketData, staffName);
                                  
                                  setSuccess(`Ticket de sortie réimprimé pour ${exitPass.licensePlate}`);
                                } catch (error) {
                                  console.error('❌ Exit pass reprint error:', error);
                                  setError(`Impossible de réimprimer le ticket de sortie pour ${exitPass.licensePlate}: ${error instanceof Error ? error.message : String(error)}`);
                                }
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Printer className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
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