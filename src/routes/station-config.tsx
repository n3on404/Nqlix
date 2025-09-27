import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { 
  Clock, 
  Save, 
  Settings,
  Loader2,
  Globe,
  CheckCircle2,
  AlertCircle,
  DollarSign
} from "lucide-react";
import { toast } from "sonner"
import api from "../lib/api";
import MunicipalityService from "../services/municipalityService";

interface StationConfig {
  id?: string;
  name: string;
  governorate: string;
  delegation: string;
  address?: string;
  operatingHours: {
    openingTime: string;
    closingTime: string;
  };
  serviceFee: number;
  isOperational: boolean;
  isOnline?: boolean;
  lastSync?: string;
  updatedAt?: string;
}

interface GovernorateData {
  name: string;
  delegations: string[];
}

interface MunicipalityGovernorate {
  id: string;
  name: string;
  nameAr?: string;
}

interface MunicipalityDelegation {
  id: string;
  name: string;
  nameAr?: string;
  governorateId: string;
}

export default function StationConfiguration() {
  const [config, setConfig] = useState<StationConfig>({
    name: '',
    governorate: '',
    delegation: '',
    address: '',
    operatingHours: {
      openingTime: "06:00",
      closingTime: "22:00"
    },
    serviceFee: 0.200,
    isOperational: true
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [originalConfig, setOriginalConfig] = useState<StationConfig | null>(null);
  
  // Location data with municipality service
  const [governorates, setGovernorates] = useState<MunicipalityGovernorate[]>([]);
  const [delegations, setDelegations] = useState<MunicipalityDelegation[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [municipalityAPIStatus, setMunicipalityAPIStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');

  // Fetch governorates and delegations using municipality service
  const fetchLocationData = async () => {
    try {
      setIsLoadingLocations(true);
      setMunicipalityAPIStatus('checking');
      
      // Check API availability
      const isAPIAvailable = await MunicipalityService.checkAPIAvailability();
      setMunicipalityAPIStatus(isAPIAvailable ? 'available' : 'unavailable');
      
      // Fetch governorates from municipality service
      const municipalityGovs = await MunicipalityService.getGovernorates();
      setGovernorates(municipalityGovs);
      
      // If we have a governorate selected, load its delegations
      if (config.governorate) {
        const municipalityDelegations = await MunicipalityService.getDelegationsByGovernorate(config.governorate);
        setDelegations(municipalityDelegations);
      }
      
      console.log(`🌐 Station Config - Municipality API: ${isAPIAvailable ? 'Available' : 'Using fallback'}`);
      console.log("Loaded governorates for station config:", municipalityGovs.length);
      
    } catch (error) {
      console.error('Error fetching location data:', error);
      setMunicipalityAPIStatus('unavailable');
      toast.error('Échec du chargement des données de localisation');
    } finally {
      setIsLoadingLocations(false);
    }
  };

  // Handle governorate change
  const handleGovernorateChange = async (governorate: string) => {
    setConfig(prev => ({ ...prev, governorate, delegation: '' }));
    setDelegations([]);
    
    if (governorate) {
      try {
        setIsLoadingLocations(true);
        
        // Fetch delegations using municipality service
        const municipalityDelegations = await MunicipalityService.getDelegationsByGovernorate(governorate);
        setDelegations(municipalityDelegations);
        
        console.log(`🗺️ Station Config - Fetched ${municipalityDelegations.length} delegations for ${governorate}`);
      } catch (error) {
        console.error('Error fetching delegations:', error);
        toast.error('Échec du chargement des délégations');
      } finally {
        setIsLoadingLocations(false);
      }
    }
  };

  // Fetch station configuration
  const fetchStationConfig = async () => {
    try {
      setIsLoading(true);
      const response = await api.getStationConfig();
      
      if (response.success && response.data) {
        const stationData = response.data;
        const newConfig: StationConfig = {
          id: stationData.id,
          name: stationData.name,
          governorate: stationData.governorate,
          delegation: stationData.delegation,
          address: stationData.address,
          operatingHours: {
            openingTime: stationData.operatingHours?.openingTime || "06:00",
            closingTime: stationData.operatingHours?.closingTime || "22:00"
          },
          serviceFee: stationData.serviceFee !== undefined ? Number(stationData.serviceFee) : 0.200,
          isOperational: stationData.isOperational !== undefined ? stationData.isOperational : true,
          isOnline: stationData.isOnline,
          lastSync: stationData.lastSync,
          updatedAt: stationData.updatedAt
        };
        
        setConfig(newConfig);
        setOriginalConfig(newConfig);
      } else {
        toast.error(response.message || 'Échec de la récupération de la configuration de la station');
      }
    } catch (error) {
      console.error('Error fetching station config:', error);
      toast.error('Échec de la récupération de la configuration de la station');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocationData();
    fetchStationConfig();
  }, []);

  // Load delegations when governorate changes in edit mode
  useEffect(() => {
    if (isEditing && config.governorate && delegations.length === 0) {
      handleGovernorateChange(config.governorate);
    }
  }, [isEditing, config.governorate]);

  const handleEdit = () => {
    setOriginalConfig(config);
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (originalConfig) {
      setConfig(originalConfig);
    }
    setIsEditing(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      if (!originalConfig) {
        toast.error('Configuration originale non trouvée');
        return;
      }
      
      // Only send the fields that are being edited (operating hours and service fee)
      // Keep the existing station information from the original config
      const response = await api.updateStationConfig({
        name: originalConfig.name,
        governorate: originalConfig.governorate,
        delegation: originalConfig.delegation,
        address: originalConfig.address,
        operatingHours: config.operatingHours,
        serviceFee: config.serviceFee,
        isOperational: originalConfig.isOperational
      });
      
      if (response.success) {
        toast.success('Configuration de la station mise à jour avec succès');
        setIsEditing(false);
        fetchStationConfig(); // Refresh data
      } else {
        toast.error(response.message || 'Échec de la mise à jour de la configuration de la station');
      }
    } catch (error) {
      console.error('Error updating station config:', error);
      toast.error('Échec de la mise à jour de la configuration de la station');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const isValidTimeRange = (opening: string, closing: string) => {
    const [openHour, openMin] = opening.split(':').map(Number);
    const [closeHour, closeMin] = closing.split(':').map(Number);
    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;
    return openMinutes < closeMinutes;
  };

  const hasChanges = () => {
    if (!originalConfig) return false;
    return (
      config.operatingHours.openingTime !== originalConfig.operatingHours.openingTime ||
      config.operatingHours.closingTime !== originalConfig.operatingHours.closingTime ||
      config.serviceFee !== originalConfig.serviceFee
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full w-full p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Chargement de la configuration de la station...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuration de la station</h1>
        <p className="text-muted-foreground">Gérer les paramètres et les heures d'ouverture de la station</p>
        
        {/* Municipality API Status */}
        <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950 rounded-lg border">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Données de localisation tunisiennes
            </span>
            <div className="ml-auto">
              {municipalityAPIStatus === 'checking' && (
                <div className="flex items-center gap-1 text-yellow-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs">Vérification...</span>
                </div>
              )}
              {municipalityAPIStatus === 'available' && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="text-xs">API des municipalités active</span>
                </div>
              )}
              {municipalityAPIStatus === 'unavailable' && (
                <div className="flex items-center gap-1 text-orange-600">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-xs">Utilisation des données locales de secours</span>
                </div>
              )}
            </div>
          </div>
          {municipalityAPIStatus === 'available' && (
            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
              Connexion à l'API officielle des municipalités tunisiennes pour des données à jour
            </p>
          )}
          {municipalityAPIStatus === 'unavailable' && (
            <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
              Utilisation des données locales - {governorates.length} gouvernorats disponibles
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">

        {/* Operating Hours Card */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-semibold">Heures d'ouverture</h2>
            </div>
            {!isEditing && (
              <Button onClick={handleEdit} variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Heure d'ouverture</label>
              {isEditing ? (
                <Input
                  type="time"
                  value={config.operatingHours.openingTime}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    operatingHours: { 
                      ...prev.operatingHours, 
                      openingTime: e.target.value 
                    }
                  }))}
                />
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <span className="font-medium text-green-600">{formatTime(config.operatingHours.openingTime)}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Heure de fermeture</label>
              {isEditing ? (
                <Input
                  type="time"
                  value={config.operatingHours.closingTime}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    operatingHours: { 
                      ...prev.operatingHours, 
                      closingTime: e.target.value 
                    }
                  }))}
                />
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <span className="font-medium text-red-600">{formatTime(config.operatingHours.closingTime)}</span>
                </div>
              )}
            </div>

            {isEditing && !isValidTimeRange(config.operatingHours.openingTime, config.operatingHours.closingTime) && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">
                  L'heure de fermeture doit être après l'heure d'ouverture.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Heures d'ouverture</label>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm">
                  <div className="font-medium">
                    {formatTime(config.operatingHours.openingTime)} - {formatTime(config.operatingHours.closingTime)}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    Horaires d'ouverture journaliers
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Service Fee Configuration */}
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold">Frais de service</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Frais de service (TND)</label>
              {isEditing ? (
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  max="10"
                  value={config.serviceFee}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    serviceFee: parseFloat(e.target.value) || 0.200
                  }))}
                  placeholder="0.200"
                />
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <span className="font-medium text-blue-600">{Number(config.serviceFee).toFixed(3)} TND</span>
                  <div className="text-sm text-muted-foreground mt-1">
                    ({Math.round(Number(config.serviceFee) * 1000)} millimes)
                  </div>
                </div>
              )}
            </div>
            
            <div className="text-sm text-muted-foreground">
              Les frais de service sont appliqués à chaque transaction de réservation.
            </div>
          </div>
        </Card>
      </div>

      {/* Action Buttons */}
      {isEditing && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {hasChanges() ? 'Vous avez des modifications non sauvegardées' : 'Aucune modification effectuée'}
            </div>
            <div className="flex space-x-3">
              <Button 
                variant="outline" 
                onClick={handleCancel}
                disabled={isSaving}
              >
                Annuler
              </Button>
              <Button 
                onClick={handleSave}
                disabled={isSaving || !hasChanges() || !isValidTimeRange(config.operatingHours.openingTime, config.operatingHours.closingTime)}
                className="min-w-24"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Enregistrer les modifications
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Current Status Summary */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
        <h3 className="text-lg font-semibold mb-4">Statut actuel</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{config.name}</div>
            <div className="text-sm text-muted-foreground">Nom de la station</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatTime(config.operatingHours.openingTime)} - {formatTime(config.operatingHours.closingTime)}
            </div>
            <div className="text-sm text-muted-foreground">Heures d'ouverture</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {Number(config.serviceFee).toFixed(3)} TND
            </div>
            <div className="text-sm text-muted-foreground">Frais de service</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${config.isOperational ? 'text-green-600' : 'text-red-600'}`}>
              {config.isOperational ? 'Ouvert' : 'Fermé'}
            </div>
            <div className="text-sm text-muted-foreground">Statut actuel</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {config.governorate}, {config.delegation}
            </div>
            <div className="text-sm text-muted-foreground">Localisation</div>
          </div>
        </div>
      </Card>
    </div>
  );
} 