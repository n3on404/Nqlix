import React, { useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthProvider';
import { useNotifications } from '../context/NotificationProvider';
import { dbClient, VehicleDailyReport, AllVehiclesDailyReport } from '../services/dbClient';
import { Loader2, FileText, Download, Calendar, Car, BarChart3, TrendingUp, Users, MapPin, Clock, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VehicleReports: React.FC = () => {
  const { currentStaff } = useAuth();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState<'individual' | 'all'>('individual');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);

  // Only supervisors and admins can access
  if (currentStaff?.role !== 'SUPERVISOR' && currentStaff?.role !== 'ADMIN') {
    return <div className="p-8 text-center text-lg">Accès refusé. Réservé au superviseur.</div>;
  }

  const formatTND = (value: number) => `${value.toFixed(3)} TND`;
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const loadVehicles = async () => {
    try {
      const vehiclesData = await dbClient.getAllVehicles();
      setVehicles(vehiclesData.filter((v: any) => !v.isBanned));
    } catch (error) {
      console.error('Error loading vehicles:', error);
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: 'Impossible de charger la liste des véhicules'
      });
    }
  };

  const generateIndividualReport = async () => {
    if (!selectedVehicleId) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: 'Veuillez sélectionner un véhicule'
      });
      return;
    }

    setIsGenerating(true);
    try {
      const report = await dbClient.getVehicleDailyReport(selectedVehicleId, selectedDate);
      
      // Store report data in sessionStorage for the print route
      const cacheKey = `vehicleReport:${selectedVehicleId}:${selectedDate}`;
      sessionStorage.setItem(cacheKey, JSON.stringify(report));
      
      // Navigate to print route
      navigate(`/print-vehicle-report?vehicleId=${selectedVehicleId}&date=${selectedDate}`);
      
      addNotification({
        type: 'success',
        title: 'Rapport généré',
        message: 'Le rapport individuel a été généré avec succès'
      });
    } catch (error: any) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: error.message || 'Impossible de générer le rapport'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAllVehiclesReport = async () => {
    setIsGenerating(true);
    try {
      const report = await dbClient.getAllVehiclesDailyReport(selectedDate);
      
      // Store report data in sessionStorage for the print route
      const cacheKey = `allVehiclesReport:${selectedDate}`;
      sessionStorage.setItem(cacheKey, JSON.stringify(report));
      
      // Navigate to print route
      navigate(`/print-all-vehicles-report?date=${selectedDate}`);
      
      addNotification({
        type: 'success',
        title: 'Rapport généré',
        message: 'Le rapport global a été généré avec succès'
      });
    } catch (error: any) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: error.message || 'Impossible de générer le rapport'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateReport = () => {
    if (reportType === 'individual') {
      generateIndividualReport();
    } else {
      generateAllVehiclesReport();
    }
  };

  const openVehicleSelector = () => {
    loadVehicles();
    setShowVehicleSelector(true);
  };

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" /> Rapports des véhicules
        </h1>
      </div>

      {/* Report Configuration */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Configuration du rapport
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Date Selection */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date du rapport
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formatDate(selectedDate)}
            </p>
          </div>

          {/* Report Type Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Type de rapport
            </label>
            <div className="flex gap-2">
              <Button
                variant={reportType === 'individual' ? 'default' : 'outline'}
                onClick={() => setReportType('individual')}
                className="flex-1"
              >
                <Car className="h-4 w-4 mr-2" />
                Individuel
              </Button>
              <Button
                variant={reportType === 'all' ? 'default' : 'outline'}
                onClick={() => setReportType('all')}
                className="flex-1"
              >
                <Users className="h-4 w-4 mr-2" />
                Tous les véhicules
              </Button>
            </div>
          </div>
        </div>

        {/* Vehicle Selection (for individual reports) */}
        {reportType === 'individual' && (
          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">
              Véhicule
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={openVehicleSelector}
                className="flex-1 justify-start"
              >
                {selectedVehicle ? (
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    <span>{selectedVehicle.licensePlate}</span>
                    <Badge variant="secondary">{selectedVehicle.capacity} places</Badge>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    <span>Sélectionner un véhicule</span>
                  </div>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Generate Report Button */}
        <div className="mt-6 flex justify-end">
          <Button
            onClick={handleGenerateReport}
            disabled={isGenerating || (reportType === 'individual' && !selectedVehicleId)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Génération en cours...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Générer le rapport
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Report Preview/Info */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Informations du rapport
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800 dark:text-blue-200">Date</span>
            </div>
            <p className="text-blue-700 dark:text-blue-300">{formatDate(selectedDate)}</p>
          </div>
          
          <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-800 dark:text-green-200">Type</span>
            </div>
            <p className="text-green-700 dark:text-green-300">
              {reportType === 'individual' ? 'Rapport individuel' : 'Rapport global'}
            </p>
          </div>
          
          {reportType === 'individual' && selectedVehicle && (
            <div className="bg-purple-50 dark:bg-purple-950 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-4 w-4 text-purple-600" />
                <span className="font-medium text-purple-800 dark:text-purple-200">Véhicule</span>
              </div>
              <p className="text-purple-700 dark:text-purple-300">{selectedVehicle.licensePlate}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Vehicle Selection Dialog */}
      <Dialog open={showVehicleSelector} onOpenChange={setShowVehicleSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sélectionner un véhicule</DialogTitle>
          </DialogHeader>
          
          <div className="max-h-96 overflow-y-auto">
            {vehicles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucun véhicule disponible
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {vehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    onClick={() => {
                      setSelectedVehicleId(vehicle.id);
                      setShowVehicleSelector(false);
                    }}
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{vehicle.licensePlate}</div>
                          <div className="text-sm text-muted-foreground">
                            {vehicle.capacity} places
                          </div>
                        </div>
                      </div>
                      <Badge variant={vehicle.isActive ? 'default' : 'secondary'}>
                        {vehicle.isActive ? 'Actif' : 'Inactif'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VehicleReports;