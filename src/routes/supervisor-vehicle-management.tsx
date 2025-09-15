import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthProvider';
import { useNotifications } from '../context/NotificationProvider';
import api from '../lib/api';
import { Loader2, Plus, Check, X, RefreshCw, Car, UserPlus, MapPin, Globe, AlertCircle, CheckCircle2, Users, Phone, Hash, Building } from 'lucide-react';
import { Select } from '../components/ui/select';
import MunicipalityService from '../services/municipalityService';

interface Vehicle {
  id: string;
  licensePlate: string;
  model?: string;
  year?: number;
  color?: string;
  isActive: boolean;
  isAvailable: boolean;
  driver?: {
    id: string;
    cin: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    accountStatus: string;
  };
  authorizedStations?: { id: string; name: string }[];
  isBanned: boolean;
}

interface DriverRequest {
  id: string;
  licensePlate: string;
  driver: {
    id: string;
    cin: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
  };
  status: string;
}

const SupervisorVehicleManagement: React.FC = () => {
  const { currentStaff } = useAuth();
  const { addNotification } = useNotifications();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DriverRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [form, setForm] = useState({
    cin: '',
    phoneNumber: '',
    firstName: '',
    lastName: '',
    originGovernorateId: '',
    originDelegationId: '',
    licensePlate: '',
    capacity: '',
    model: '',
    year: '',
    color: '',
    authorizedStationIds: [] as string[],
    defaultDestinationId: '',
  });
  const [governorates, setGovernorates] = useState<{ id: string; name: string; nameAr?: string }[]>([]);
  const [delegations, setDelegations] = useState<{ id: string; name: string; nameAr?: string; governorateId: string }[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState(false);
  const [municipalityAPIStatus, setMunicipalityAPIStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<Vehicle | null>(null);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isVehicleDetailsLoading, setIsVehicleDetailsLoading] = useState(false);
  const [stationConfig, setStationConfig] = useState<any>(null);
  const tunisianPlateRegex = /^\d{2,3} ?TUN ?\d{4}$/i;
  const [licensePlateError, setLicensePlateError] = useState<string | null>(null);
  const [showCreateStation, setShowCreateStation] = useState(false);
  const [newStation, setNewStation] = useState({
    name: '',
    governorateId: '',
    delegationId: '',
    address: '',
  });
  const [isCreatingStation, setIsCreatingStation] = useState(false);
  const [createStationError, setCreateStationError] = useState<string | null>(null);


  // Only supervisors can access
  if (currentStaff?.role !== 'SUPERVISOR') {
    return <div className="p-8 text-center text-lg">Accès refusé. Réservé au superviseur.</div>;
  }

  // Fetch vehicles
  const fetchVehicles = async () => {
    setIsLoading(true);
    const res = await api.get<Vehicle[]>('/api/vehicles');
    setVehicles(res.data || []);
    setIsLoading(false);
  };

  // Fetch pending requests
  const fetchPendingRequests = async () => {
    setIsLoadingRequests(true);
    const res = await api.get<DriverRequest[]>('/api/vehicles/pending');
    setPendingRequests(res.data || []);
    setIsLoadingRequests(false);
  };

  // Polling for real-time updates
  useEffect(() => {
    fetchVehicles();
    fetchPendingRequests();
    const interval = setInterval(() => {
      fetchVehicles();
      fetchPendingRequests();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Check municipality API availability and fetch data on mount
  useEffect(() => {
    const initializeMunicipalityData = async () => {
      setIsLoadingMunicipalities(true);
      setMunicipalityAPIStatus('checking');
      
      try {
        // Check API availability
        const isAPIAvailable = await MunicipalityService.checkAPIAvailability();
        setMunicipalityAPIStatus(isAPIAvailable ? 'available' : 'unavailable');
        
        // Fetch governorates from municipality service
        const municipalityGovs = await MunicipalityService.getGovernorates();
        setGovernorates(municipalityGovs);
        
        console.log(`🌐 Municipality API: ${isAPIAvailable ? 'Available' : 'Using fallback'}`);
        console.log("governorates from municipality service", municipalityGovs);
      } catch (error) {
        console.error('Failed to initialize municipality data:', error);
        setMunicipalityAPIStatus('unavailable');
        // Fallback to empty array if everything fails
        setGovernorates([]);
      } finally {
        setIsLoadingMunicipalities(false);
      }
    };

    const fetchStations = async () => {
      const res = await api.get('/api/vehicles/stations');
      const data: any = res.data;
      if (res.success && data && Array.isArray(data)) {
        setStations(data);
      } else if (res.success && data && Array.isArray((data as any)?.data)) {
        setStations((data as any).data);
      } else if (Array.isArray(res)) {
        setStations(res as any);
      } else {
        setStations([]);
      }
    };

    const fetchStationConfig = async () => {
      const res = await api.getStationConfig();
      if (res.success && res.data) {
        setStationConfig(res.data);
        console.log("station config", res.data);
      }
    };

    initializeMunicipalityData();
    fetchStations();
    fetchStationConfig();
  }, []);

  // When governorate changes, fetch delegations for that governorate
  useEffect(() => {
    if (form.originGovernorateId) {
      const fetchDelegationsForGovernorate = async () => {
        setIsLoadingMunicipalities(true);
        
        try {
          // Find governorate name by ID
          const selectedGovernorate = governorates.find(gov => gov.id === form.originGovernorateId);
          if (!selectedGovernorate) {
            setDelegations([]);
            return;
          }

          // Fetch delegations using municipality service
          const municipalityDelegations = await MunicipalityService.getDelegationsByGovernorate(selectedGovernorate.name);
          setDelegations(municipalityDelegations);
          
          // Auto-select current station's delegation if it matches
          if (stationConfig && municipalityDelegations.length > 0) {
            const matchingDelegation = municipalityDelegations.find(
              del => del.name.toLowerCase().includes(stationConfig.delegation.toLowerCase()) ||
                     stationConfig.delegation.toLowerCase().includes(del.name.toLowerCase())
            );
            if (matchingDelegation) {
              setForm(f => ({ ...f, originDelegationId: matchingDelegation.id }));
            }
          }
          
          console.log(`🗺️ Fetched ${municipalityDelegations.length} delegations for ${selectedGovernorate.name}`);
        } catch (error) {
          console.error('Failed to fetch delegations:', error);
          setDelegations([]);
        } finally {
          setIsLoadingMunicipalities(false);
        }
      };
      
      fetchDelegationsForGovernorate();
    } else {
      setDelegations([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.originGovernorateId, governorates, stationConfig]);

  // Auto-select current station's governorate when form opens and data is available
  useEffect(() => {
    if (showRequestForm && stationConfig && governorates.length > 0 && !form.originGovernorateId) {
      const matchingGovernorate = governorates.find(
        gov => gov.name.toLowerCase() === stationConfig.governorate.toLowerCase()
      );
      
      if (matchingGovernorate) {
        setForm(f => ({ 
          ...f, 
          originGovernorateId: matchingGovernorate.id,
          // Also auto-select current station in authorized stations if available
          authorizedStationIds: stations.length > 0 && stationConfig.id 
            ? [stationConfig.id] 
            : f.authorizedStationIds
        }));
        console.log(`🎯 Auto-selected governorate: ${matchingGovernorate.name} for station: ${stationConfig.stationName}`);
      }
    }
  }, [showRequestForm, stationConfig, governorates, stations, form.originGovernorateId]);

  // Handle governorate change for new station creation
  useEffect(() => {
    if (showCreateStation && newStation.governorateId && governorates.length > 0) {
      const fetchDelegationsForNewStation = async () => {
        setIsLoadingMunicipalities(true);
        
        try {
          const selectedGovernorate = governorates.find(gov => gov.id === newStation.governorateId);
          if (!selectedGovernorate) {
            return;
          }

          const municipalityDelegations = await MunicipalityService.getDelegationsByGovernorate(selectedGovernorate.name);
          setDelegations(municipalityDelegations);
          
          console.log(`🗺️ Fetched ${municipalityDelegations.length} delegations for new station in ${selectedGovernorate.name}`);
        } catch (error) {
          console.error('Failed to fetch delegations for new station:', error);
          setDelegations([]);
        } finally {
          setIsLoadingMunicipalities(false);
        }
      };
      
      fetchDelegationsForNewStation();
    }
  }, [showCreateStation, newStation.governorateId, governorates]);

  // Approve request
  const handleApprove = async (id: string) => {
    const res = await api.post<{ success: boolean; message?: string }>(`/api/vehicles/${id}/approve`);
    if (res.success) {
      addNotification({ type: 'success', title: 'Approuvé', message: 'Demande de conducteur approuvée.' });
      fetchVehicles();
      fetchPendingRequests();
    } else {
      addNotification({ type: 'error', title: 'Erreur', message: res.message || 'Échec de l\'approbation.' });
    }
  };

  // Deny request
  const handleDeny = async (id: string) => {
    const res = await api.post<{ success: boolean; message?: string }>(`/api/vehicles/${id}/deny`);
    if (res.success) {
      addNotification({ type: 'success', title: 'Refusé', message: 'Demande de conducteur refusée.' });
      fetchVehicles();
      fetchPendingRequests();
    } else {
      addNotification({ type: 'error', title: 'Erreur', message: res.message || 'Échec du refus.' });
    }
  };

  // Handle form input
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (name === 'authorizedStationIds') {
      // Multi-select
      const options = (e.target as HTMLSelectElement).options;
      const values: string[] = [];
      for (let i = 0; i < options.length; i++) {
        if (options[i].selected) values.push(options[i].value);
      }
      
      // Clear default destination if it's no longer in authorized stations
      const updatedForm = { ...form, authorizedStationIds: values };
      if (form.defaultDestinationId && !values.includes(form.defaultDestinationId)) {
        updatedForm.defaultDestinationId = '';
      }
      
      setForm(updatedForm);
    } else {
      setForm({ ...form, [name]: type === 'number' ? Number(value) : value });
      if (name === 'licensePlate') {
        if (value && !tunisianPlateRegex.test(value.trim())) {
          setLicensePlateError('Format: 123 TUN 4567 (2-3 digits, TUN, 4 digits)');
        } else {
          setLicensePlateError(null);
        }
      }
    }
  };

  // Submit new driver request and auto-approve
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.licensePlate && !tunisianPlateRegex.test(form.licensePlate.trim())) {
      setLicensePlateError('Format: 123 TUN 4567 (2-3 digits, TUN, 4 digits)');
      return;
    }
    setIsSubmitting(true);
    // Build request payload
    const payload = {
      cin: form.cin,
      phoneNumber: form.phoneNumber,
      firstName: form.firstName,
      lastName: form.lastName,
      originGovernorateId: form.originGovernorateId,
      originDelegationId: form.originDelegationId,
      licensePlate: form.licensePlate,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      authorizedStationIds: form.authorizedStationIds,
      defaultDestinationId: form.defaultDestinationId,
    };
    const res = await api.post<{ id: string } | undefined>('/api/vehicles/request', payload);
    if (res.success && res.data && res.data.id) {
      // Defensive check: ensure token is present before auto-approve
      if (!(api as any).token) {
        addNotification({ type: 'error', title: 'Erreur de session', message: 'Vous n\'êtes pas authentifié. Veuillez vous reconnecter.' });
        setIsSubmitting(false);
        return;
      }
      // Auto-approve
      await handleApprove(res.data.id);
      setShowRequestForm(false);
      setForm({
        cin: '', phoneNumber: '', firstName: '', lastName: '', originGovernorateId: '', originDelegationId: '', 
        licensePlate: '', capacity: '', model: '', year: '', color: '', authorizedStationIds: [], defaultDestinationId: ''
      });
      addNotification({ type: 'success', title: 'Créé & Approuvé', message: 'Demande de conducteur créée et approuvée.' });
      // Refresh vehicles and pending requests immediately
      fetchVehicles();
      fetchPendingRequests();
    } else {
      addNotification({ type: 'error', title: 'Erreur', message: res.message || 'Échec de la création de la demande.' });
    }
    setIsSubmitting(false);
  };

  // Fetch vehicle details by ID (optional: if you want to fetch fresh data)
  const fetchVehicleDetails = async (id: string) => {
    setIsVehicleDetailsLoading(true);
    const res = await api.get<Vehicle>(`/api/vehicles/${id}`);
    if (res.success && res.data) {
      setVehicleDetails(res.data);
    } else {
      setVehicleDetails(null);
    }
    setIsVehicleDetailsLoading(false);
  };

  // Create station handler
  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingStation(true);
    setCreateStationError(null);
    try {
      const res = await api.post('/api/vehicles/stations/create', newStation);
      if (res.success && res.data) {
        addNotification({ type: 'success', title: 'Station Créée', message: 'Nouvelle station créée avec succès.' });
        setShowCreateStation(false);
        setNewStation({ name: '', governorateId: '', delegationId: '', address: '' });
        // Refresh stations and select the new one
        const stationsRes = await api.get('/api/vehicles/stations');
        if (stationsRes.success && stationsRes.data && Array.isArray(stationsRes.data)) {
          setStations(stationsRes.data);
          setForm(f => ({ ...f, authorizedStationIds: [(res.data as any).id] }));
        }
      } else {
        setCreateStationError(res.message || 'Échec de la création de la station.');
      }
    } catch (err: any) {
      setCreateStationError(err.message || 'Échec de la création de la station.');
    }
    setIsCreatingStation(false);
  };

  // Add the banVehicle function at the top level of the component
  const banVehicle = async (vehicleId: string) => {
    const res = await api.banVehicle(vehicleId);
    if (res.success) {
      addNotification({ type: 'success', title: 'Véhicule banni', message: 'Le véhicule a été banni avec succès.' });
      fetchVehicles();
      setIsVehicleModalOpen(false);
    } else {
      addNotification({ type: 'error', title: 'Erreur', message: res.message || 'Échec du bannissement du véhicule.' });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Car className="h-6 w-6" /> Gestion des véhicules
        </h1>
        <Button onClick={() => {
          if (stationConfig && governorates.length > 0 && delegations.length > 0 && stations.length > 0) {
            // Find governorate and delegation IDs by name
            const gov = governorates.find(g => g.name === stationConfig.governorate);
            const del = delegations.find(d => d.name === stationConfig.delegation);
            setForm(f => ({
              ...f,
              originGovernorateId: gov ? gov.id : '',
              originDelegationId: del ? del.id : '',
              authorizedStationIds: stationConfig.id ? [stationConfig.id] : [],
            }));
          }
          setShowRequestForm(true);
        }}>
          <Plus className="h-4 w-4 mr-2" /> Nouvelle demande de conducteur
        </Button>
      </div>

      {/* Vehicles Table */}
      <Card className="p-4 mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Car className="h-5 w-5" /> Véhicules
          </h2>
          <Button variant="outline" size="sm" onClick={fetchVehicles} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Rafraîchir
          </Button>
        </div>
        <div className="overflow-x-auto">
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3">Plaque d'immatriculation</th>
                  <th className="text-left py-2 px-3">CIN du conducteur</th>
                  <th className="text-left py-2 px-3">Conducteur</th>
                  <th className="text-left py-2 px-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id} className="border-b hover:bg-muted cursor-pointer" onClick={async () => { setSelectedVehicle(v); setIsVehicleModalOpen(true); fetchVehicleDetails(v.id); }}>
                    <td className="py-2 px-3 font-medium">{v.licensePlate}</td>
                    <td className="py-2 px-3">{v.driver ? v.driver.cin : '-'}</td>
                    <td className="py-2 px-3">{v.driver ? `${v.driver.firstName} ${v.driver.lastName}` : '-'}</td>
                    <td className="py-2 px-3">
                      <Badge variant={v.isActive ? 'default' : 'secondary'}>
                        {v.isActive ? 'Actif' : 'Inactif'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-4 text-muted-foreground">Aucun véhicule trouvé.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Pending Requests Table */}
      <Card className="p-4 mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Demandes de conducteur en attente
          </h2>
          <Button variant="outline" size="sm" onClick={fetchPendingRequests} disabled={isLoadingRequests}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingRequests ? 'animate-spin' : ''}`} /> Rafraîchir
          </Button>
        </div>
        <div className="overflow-x-auto">
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3">Plaque d'immatriculation</th>
                  <th className="text-left py-2 px-3">Conducteur</th>
                  <th className="text-left py-2 px-3">Statut</th>
                  <th className="text-left py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted">
                    <td className="py-2 px-3 font-medium">{r.licensePlate}</td>
                    <td className="py-2 px-3">{r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : '-'}</td>
                    <td className="py-2 px-3">
                      <Badge variant={r.status === 'PENDING' ? 'secondary' : 'default'}>{r.status}</Badge>
                    </td>
                    <td className="py-2 px-3 flex gap-2">
                      <Button size="sm" variant="default" onClick={() => handleApprove(r.id)}><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeny(r.id)}><X className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
                {pendingRequests.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-4 text-muted-foreground">Aucune demande en attente.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* New Driver Request Form Dialog */}
      <Dialog open={showRequestForm} onOpenChange={setShowRequestForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <UserPlus className="h-5 w-5" />
              Nouvelle demande de conducteur et véhicule
            </DialogTitle>
            <div className="flex items-center gap-2 mt-2">
              {municipalityAPIStatus === 'checking' && (
                <div className="flex items-center gap-1 text-yellow-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs">Vérification des données...</span>
                </div>
              )}
              {municipalityAPIStatus === 'available' && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="text-xs">API des municipalités tunisiennes active</span>
                </div>
              )}
              {municipalityAPIStatus === 'unavailable' && (
                <div className="flex items-center gap-1 text-orange-600">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-xs">Utilisation des données locales</span>
                </div>
              )}
            </div>
          </DialogHeader>
          
          <form onSubmit={handleSubmitRequest} className="space-y-6">
            {/* Driver Information Section */}
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
              <h3 className="flex items-center gap-2 font-medium mb-4 text-blue-800 dark:text-blue-200">
                <Users className="h-4 w-4" />
                Informations du conducteur
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    CIN
                  </label>
                  <Input 
                    name="cin" 
                    value={form.cin} 
                    onChange={handleFormChange} 
                    required 
                    placeholder="Ex: 12345678"
                    maxLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    Numéro de téléphone
                  </label>
                  <Input 
                    name="phoneNumber" 
                    value={form.phoneNumber} 
                    onChange={handleFormChange} 
                    required 
                    placeholder="Ex: +216 12 345 678"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Prénom</label>
                  <Input 
                    name="firstName" 
                    value={form.firstName} 
                    onChange={handleFormChange} 
                    required 
                    placeholder="Prénom du conducteur"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nom de famille</label>
                  <Input 
                    name="lastName" 
                    value={form.lastName} 
                    onChange={handleFormChange} 
                    required 
                    placeholder="Nom de famille"
                  />
                </div>
              </div>
            </div>

            {/* Location Information Section */}
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
              <h3 className="flex items-center gap-2 font-medium mb-4 text-green-800 dark:text-green-200">
                <MapPin className="h-4 w-4" />
                Localisation du conducteur
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Gouvernorat d'origine
                  </label>
                  <Select 
                    name="originGovernorateId" 
                    value={form.originGovernorateId} 
                    onChange={handleFormChange} 
                    options={governorates.map(g => ({ 
                      value: g.id, 
                      label: `${g.name}${g.nameAr ? ` (${g.nameAr})` : ''}` 
                    }))} 
                    placeholder={isLoadingMunicipalities ? "Chargement..." : "Sélectionner le gouvernorat"} 
                    required 
                    disabled={governorates.length === 0 || isLoadingMunicipalities} 
                  />
                  {stationConfig && (
                    <div className="text-xs text-green-600 mt-1">
                      Station actuelle: {stationConfig.governorate}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Délégation d'origine
                  </label>
                  <Select 
                    name="originDelegationId" 
                    value={form.originDelegationId} 
                    onChange={handleFormChange} 
                    options={delegations.map(d => ({ 
                      value: d.id, 
                      label: `${d.name}${d.nameAr ? ` (${d.nameAr})` : ''}` 
                    }))} 
                    placeholder={
                      !form.originGovernorateId ? "Sélectionner d'abord le gouvernorat" :
                      isLoadingMunicipalities ? "Chargement..." : 
                      "Sélectionner la délégation"
                    } 
                    required 
                    disabled={!form.originGovernorateId || delegations.length === 0 || isLoadingMunicipalities} 
                  />
                  {stationConfig && (
                    <div className="text-xs text-green-600 mt-1">
                      Station actuelle: {stationConfig.delegation}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Vehicle Information Section */}
            <div className="bg-purple-50 dark:bg-purple-950 rounded-lg p-4">
              <h3 className="flex items-center gap-2 font-medium mb-4 text-purple-800 dark:text-purple-200">
                <Car className="h-4 w-4" />
                Informations du véhicule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2 lg:col-span-1">
                  <label className="block text-sm font-medium mb-1">Plaque d'immatriculation *</label>
                  <Input 
                    name="licensePlate" 
                    value={form.licensePlate} 
                    onChange={handleFormChange} 
                    required 
                    maxLength={12} 
                    placeholder="123 TUN 4567" 
                    className={licensePlateError ? "border-red-500" : ""}
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Format: 2-3 chiffres, TUN, 4 chiffres
                  </div>
                  {licensePlateError && (
                    <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {licensePlateError}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Capacité (places) *</label>
                  <Input 
                    name="capacity" 
                    value={form.capacity} 
                    onChange={handleFormChange} 
                    type="number" 
                    min="1" 
                    max="50"
                    required 
                    placeholder="Ex: 9"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Modèle</label>
                  <Input 
                    name="model" 
                    value={form.model} 
                    onChange={handleFormChange} 
                    placeholder="Ex: Peugeot 807"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Année</label>
                  <Input 
                    name="year" 
                    value={form.year} 
                    onChange={handleFormChange} 
                    type="number" 
                    min="1980" 
                    max={new Date().getFullYear() + 1}
                    placeholder="Ex: 2018"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Couleur</label>
                  <Input 
                    name="color" 
                    value={form.color} 
                    onChange={handleFormChange} 
                    placeholder="Ex: Blanc"
                  />
                </div>
              </div>
            </div>

            {/* Stations Authorization Section */}
            <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-4">
              <h3 className="flex items-center gap-2 font-medium mb-4 text-orange-800 dark:text-orange-200">
                <Building className="h-4 w-4" />
                Autorisations de transport
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Stations autorisées *</label>
                  <div className="flex gap-2 items-start">
                    <select 
                      name="authorizedStationIds" 
                      multiple 
                      value={form.authorizedStationIds} 
                      onChange={handleFormChange} 
                      className="w-full border rounded-lg p-3 min-h-[120px] bg-white dark:bg-gray-800" 
                      required 
                      disabled={stations.length === 0}
                    >
                      {stations.length === 0 ? (
                        <option value="">Aucune station disponible</option>
                      ) : stations.map(s => (
                        <option key={s.id} value={s.id} className="py-1">
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowCreateStation(true)}
                      className="whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Nouvelle station
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Maintenez Ctrl (Windows) ou Cmd (Mac) pour sélectionner plusieurs stations.
                  </div>
                  {stationConfig && form.authorizedStationIds.includes(stationConfig.id) && (
                    <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Station actuelle sélectionnée: {stationConfig.stationName}
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Destination par défaut</label>
                  <select 
                    name="defaultDestinationId" 
                    value={form.defaultDestinationId} 
                    onChange={handleFormChange} 
                    className="w-full border rounded-lg p-3 bg-white dark:bg-gray-800"
                    disabled={form.authorizedStationIds.length === 0}
                  >
                    <option value="">Sélectionner la destination par défaut (optionnel)</option>
                    {stations
                      .filter(s => form.authorizedStationIds.includes(s.id))
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                  <div className="text-xs text-muted-foreground mt-1">
                    La destination par défaut sera utilisée automatiquement lors de l'ajout à la file d'attente.
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => setShowRequestForm(false)} 
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || isLoadingMunicipalities}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Créer & Approuver
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Vehicle Details Modal */}
      <Dialog open={isVehicleModalOpen} onOpenChange={open => { setIsVehicleModalOpen(open); if (!open) { setVehicleDetails(null); setSelectedVehicle(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Détails du véhicule & du conducteur</DialogTitle>
          </DialogHeader>
          {isVehicleDetailsLoading ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Chargement...</div>
          ) : vehicleDetails ? (
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-6 border flex flex-col gap-4">
                <div className="flex items-center gap-4 border-b pb-3 mb-2">
                  <Car className="h-7 w-7 text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold">{vehicleDetails.licensePlate}</span>
                      {vehicleDetails.isBanned && <Badge variant="destructive">Banni</Badge>}
                      {!vehicleDetails.isBanned && !vehicleDetails.isActive && <Badge variant="secondary">Inactif</Badge>}
                      {vehicleDetails.isActive && !vehicleDetails.isBanned && <Badge variant="default">Actif</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">Modèle: {vehicleDetails.model || '-'}</div>
                  </div>
                  <div>
                    <Badge variant={vehicleDetails.isAvailable ? 'default' : 'secondary'}>
                      {vehicleDetails.isAvailable ? 'Disponible' : 'Indisponible'}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-200">Stations autorisées</div>
                  <div className="flex flex-wrap gap-2">
                    {vehicleDetails.authorizedStations && vehicleDetails.authorizedStations.length > 0 ? (
                      vehicleDetails.authorizedStations.map((s: any) => (
                        <Badge key={s.id} variant="outline" className="bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200">
                          {s.stationId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
                <div className="pt-2">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Conducteur</div>
                  {vehicleDetails.driver ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-xs text-muted-foreground">CIN</span><br /><span className="font-mono">{vehicleDetails.driver.cin}</span></div>
                      <div><span className="text-xs text-muted-foreground">Nom</span><br />{vehicleDetails.driver.firstName} {vehicleDetails.driver.lastName}</div>
                      <div><span className="text-xs text-muted-foreground">Téléphone</span><br />{vehicleDetails.driver.phoneNumber}</div>
                      <div><span className="text-xs text-muted-foreground">Statut du compte</span><br />{vehicleDetails.driver.accountStatus}</div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">Aucun conducteur assigné.</div>
                  )}
                </div>
                <div className="pt-4 flex justify-end">
                  <Button variant="destructive" onClick={async () => {
                    if (!vehicleDetails) return;
                    await banVehicle(vehicleDetails.id);
                  }} disabled={vehicleDetails.isBanned}>
                    Bannir ce véhicule
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">Aucun détail trouvé.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create New Station Dialog */}
      <Dialog open={showCreateStation} onOpenChange={setShowCreateStation}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Créer une nouvelle station
            </DialogTitle>
            <div className="flex items-center gap-2 mt-2">
              {municipalityAPIStatus === 'available' && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="text-xs">Données des municipalités tunisiennes disponibles</span>
                </div>
              )}
              {municipalityAPIStatus === 'unavailable' && (
                <div className="flex items-center gap-1 text-orange-600">
                  <AlertCircle className="h-3 w-3" />
                  <span className="text-xs">Utilisation des données locales</span>
                </div>
              )}
            </div>
          </DialogHeader>
          <form onSubmit={handleCreateStation} className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h3 className="flex items-center gap-2 font-medium mb-4">
                <MapPin className="h-4 w-4" />
                Informations de la station
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom de la station *</label>
                  <Input 
                    name="name" 
                    value={newStation.name} 
                    onChange={e => setNewStation({ ...newStation, name: e.target.value })} 
                    required 
                    placeholder="Ex: Station de Tunis Centre"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      Gouvernorat *
                    </label>
                    <select 
                      name="governorateId" 
                      value={newStation.governorateId} 
                      onChange={e => setNewStation({ ...newStation, governorateId: e.target.value, delegationId: '' })} 
                      required 
                      className="w-full border rounded-lg p-3 bg-white dark:bg-gray-800" 
                      disabled={governorates.length === 0 || isLoadingMunicipalities}
                    >
                      <option value="">
                        {governorates.length === 0 ? 'Aucun gouvernorat disponible' : 'Sélectionner le gouvernorat'}
                      </option>
                      {governorates.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name}{g.nameAr ? ` (${g.nameAr})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Délégation *
                    </label>
                    <select 
                      name="delegationId" 
                      value={newStation.delegationId} 
                      onChange={e => setNewStation({ ...newStation, delegationId: e.target.value })} 
                      required 
                      className="w-full border rounded-lg p-3 bg-white dark:bg-gray-800" 
                      disabled={!newStation.governorateId || delegations.length === 0 || isLoadingMunicipalities}
                    >
                      <option value="">
                        {!newStation.governorateId ? 'Sélectionner d\'abord le gouvernorat' :
                         delegations.length === 0 ? 'Aucune délégation disponible' : 
                         'Sélectionner la délégation'}
                      </option>
                      {delegations.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}{d.nameAr ? ` (${d.nameAr})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Adresse *</label>
                  <Input 
                    name="address" 
                    value={newStation.address} 
                    onChange={e => setNewStation({ ...newStation, address: e.target.value })} 
                    required 
                    placeholder="Ex: Avenue Habib Bourguiba, Tunis"
                  />
                </div>
              </div>
            </div>
            
            {createStationError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Erreur</span>
                </div>
                <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {createStationError}
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => {
                  setShowCreateStation(false);
                  setCreateStationError(null);
                  setNewStation({ name: '', governorateId: '', delegationId: '', address: '' });
                }} 
                disabled={isCreatingStation}
              >
                Annuler
              </Button>
              <Button 
                type="submit" 
                disabled={isCreatingStation || isLoadingMunicipalities}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isCreatingStation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Création...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Créer la station
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupervisorVehicleManagement; 