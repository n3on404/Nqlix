import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { 
  MapPin, 
  Clock, 
  Save, 
  Building,
  Settings,
  Loader2,
  Globe,
  CheckCircle2,
  AlertCircle
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
      
      const response = await api.updateStationConfig({
        name: config.name,
        governorate: config.governorate,
        delegation: config.delegation,
        address: config.address,
        operatingHours: config.operatingHours,
        isOperational: config.isOperational
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
      config.name !== originalConfig.name ||
      config.governorate !== originalConfig.governorate ||
      config.delegation !== originalConfig.delegation ||
      config.address !== originalConfig.address ||
      config.operatingHours.openingTime !== originalConfig.operatingHours.openingTime ||
      config.operatingHours.closingTime !== originalConfig.operatingHours.closingTime ||
      config.isOperational !== originalConfig.isOperational
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Station Information Card */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Building className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-semibold">Information de la station</h2>
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
              <label className="block text-sm font-medium mb-2">Nom de la station</label>
              {isEditing ? (
                <Input
                  value={config.name}
                  onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Entrez le nom de la station"
                />
              ) : (
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{config.name}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Gouvernorat
                {isEditing && (
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
                        <span className="text-xs">API active</span>
                      </div>
                    )}
                    {municipalityAPIStatus === 'unavailable' && (
                      <div className="flex items-center gap-1 text-orange-600">
                        <AlertCircle className="h-3 w-3" />
                        <span className="text-xs">Données locales</span>
                      </div>
                    )}
                  </div>
                )}
              </label>
              {isEditing ? (
                <Select
                  value={config.governorate}
                  onChange={(e) => handleGovernorateChange(e.target.value)}
                  options={governorates.map(g => ({ 
                    value: g.name, 
                    label: `${g.name}${g.nameAr ? ` (${g.nameAr})` : ''}` 
                  }))}
                  placeholder={isLoadingLocations ? "Chargement..." : "Sélectionnez le gouvernorat"}
                  disabled={isLoadingLocations || governorates.length === 0}
                />
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <span className="font-medium">{config.governorate}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Délégation
                {isEditing && isLoadingLocations && (
                  <div className="ml-auto">
                    <div className="flex items-center gap-1 text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs">Chargement...</span>
                    </div>
                  </div>
                )}
              </label>
              {isEditing ? (
                <Select
                  value={config.delegation}
                  onChange={(e) => setConfig(prev => ({ ...prev, delegation: e.target.value }))}
                  options={delegations.map(d => ({ 
                    value: d.name, 
                    label: `${d.name}${d.nameAr ? ` (${d.nameAr})` : ''}` 
                  }))}
                  placeholder={
                    !config.governorate ? "Sélectionnez d'abord le gouvernorat" :
                    isLoadingLocations ? "Chargement des délégations..." : 
                    delegations.length === 0 ? "Aucune délégation disponible" :
                    "Sélectionnez la délégation"
                  }
                  disabled={!config.governorate || delegations.length === 0 || isLoadingLocations}
                />
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <span className="font-medium">{config.delegation}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Adresse (Optionnel)</label>
              {isEditing ? (
                <Input
                  value={config.address || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Entrez l'adresse"
                />
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">
                    {config.address || 'Aucune adresse spécifiée'}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Statut opérationnel</label>
              {isEditing ? (
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="operational"
                      checked={config.isOperational}
                      onChange={() => setConfig(prev => ({ ...prev, isOperational: true }))}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Opérationnel</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="operational"
                      checked={!config.isOperational}
                      onChange={() => setConfig(prev => ({ ...prev, isOperational: false }))}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Fermé</span>
                  </label>
                </div>
              ) : (
                <div className="p-3 bg-muted rounded-lg">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    config.isOperational 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {config.isOperational ? 'Opérationnel' : 'Fermé'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Operating Hours Card */}
        <Card className="p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold">Heures d'ouverture</h2>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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