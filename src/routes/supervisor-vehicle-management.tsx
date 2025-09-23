import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthProvider';
import { useNotifications } from '../context/NotificationProvider';
import api from '../lib/api';
import { Loader2, Plus, Check, X, RefreshCw, Car, UserPlus, MapPin, Globe, AlertCircle, CheckCircle2, Users, Phone, Hash, Building, Printer, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Select } from '../components/ui/select';
import MunicipalityService from '../services/municipalityService';

interface Vehicle {
  id: string;
  licensePlate: string;
  capacity: number;
  isActive: boolean;
  isAvailable: boolean;
  driver?: {
    id: string;
    cin: string;
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
  };
  status: string;
}

const SupervisorVehicleManagement: React.FC = () => {
  const { currentStaff } = useAuth();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const todayStr = () => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; };
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DriverRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [form, setForm] = useState({
    cin: '',
    licensePlate: '',
    capacity: '8', // Default to 8 seats
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
  const [stationSearchTerm, setStationSearchTerm] = useState('');
  const [destinationSearchTerm, setDestinationSearchTerm] = useState('');
  const [newStation, setNewStation] = useState({
    name: '',
    governorateId: '',
    delegationId: '',
    address: '',
  });
  const [isCreatingStation, setIsCreatingStation] = useState(false);
  const [createStationError, setCreateStationError] = useState<string | null>(null);

  // Helper
  const formatTND = (value: any) => {
    const n = typeof value === 'number' ? value : parseFloat(value || '0');
    return `${(Number.isFinite(n) ? n : 0).toFixed(3)} TND`;
  };

  // Function to select all Monastir delegations
  const selectAllMonastirDelegations = () => {
    const monastirStations = stations.filter(station => 
      station.name.includes('MONASTIR') || 
      station.name.includes('SAHLINE') || 
      station.name.includes('KSIBET EL MEDIOUNI') || 
      station.name.includes('JEMMAL') || 
      station.name.includes('BENI HASSEN') || 
      station.name.includes('SAYADA LAMTA BOU HAJAR') || 
      station.name.includes('TEBOULBA') || 
      station.name.includes('KSAR HELAL') || 
      station.name.includes('BEMBLA') || 
      station.name.includes('MOKNINE') || 
      station.name.includes('ZERAMDINE') || 
      station.name.includes('OUERDANINE') || 
      station.name.includes('BEKALTA')
    );
    
    const stationIds = monastirStations.map(station => station.id);
    setForm(prev => ({
      ...prev,
      authorizedStationIds: stationIds
    }));
    
    addNotification({
      type: 'success',
      title: 'Succès',
      message: `${stationIds.length} stations de Monastir sélectionnées`
    });
  };

  // Function to toggle station selection
  const toggleStationSelection = (stationId: string) => {
    setForm(prev => {
      const isSelected = prev.authorizedStationIds.includes(stationId);
      if (isSelected) {
        return {
          ...prev,
          authorizedStationIds: prev.authorizedStationIds.filter(id => id !== stationId),
          defaultDestinationId: prev.defaultDestinationId === stationId ? '' : prev.defaultDestinationId
        };
      } else {
        return {
          ...prev,
          authorizedStationIds: [...prev.authorizedStationIds, stationId]
        };
      }
    });
  };

  // Function to clear all selected stations
  const clearAllStations = () => {
    setForm(prev => ({
      ...prev,
      authorizedStationIds: [],
      defaultDestinationId: ''
    }));
  };

  // Filter stations based on search term
  const filteredStations = stations.filter(station =>
    station.name.toLowerCase().includes(stationSearchTerm.toLowerCase())
  );

  // Function to select default destination
  const selectDefaultDestination = (stationId: string) => {
    setForm(prev => ({
      ...prev,
      defaultDestinationId: prev.defaultDestinationId === stationId ? '' : stationId
    }));
  };

  // Function to clear default destination
  const clearDefaultDestination = () => {
    setForm(prev => ({
      ...prev,
      defaultDestinationId: ''
    }));
  };

  // Filter authorized stations for destination selection
  const authorizedStations = stations.filter(station => 
    form.authorizedStationIds.includes(station.id)
  );

  // Filter authorized stations based on destination search term
  const filteredDestinations = authorizedStations.filter(station =>
    station.name.toLowerCase().includes(destinationSearchTerm.toLowerCase())
  );

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

  // Auto-select current station in authorized stations when form opens
  useEffect(() => {
    if (showRequestForm && stations.length > 0 && stationConfig?.id) {
        setForm(f => ({ 
          ...f, 
        authorizedStationIds: [stationConfig.id]
      }));
      console.log(`🎯 Auto-selected current station: ${stationConfig.stationName}`);
    }
  }, [showRequestForm, stations, stationConfig]);

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
      licensePlate: form.licensePlate,
      capacity: form.capacity ? Number(form.capacity) : 8,
      authorizedStationIds: form.authorizedStationIds,
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
        cin: '', 
        licensePlate: '', 
        capacity: '8', 
        authorizedStationIds: [], 
        defaultDestinationId: ''
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
      // Fetch today's income via exit passes
      try {
        const lp = res.data?.licensePlate;
        if (lp) {
          const today = todayStr();
          const incomeRes = await api.getDriverIncome(lp, today);
          if (incomeRes.success && incomeRes.data) {
            const incomeEl = document.getElementById('driver-income-today');
            const listEl = document.getElementById('driver-income-list');
            const totalIncome = incomeRes.data?.totals?.totalIncome || 0;
            if (incomeEl) incomeEl.textContent = formatTND(totalIncome);
            if (listEl) {
              listEl.innerHTML = '';
              const items = Array.isArray(incomeRes.data.items) ? incomeRes.data.items : [];
              items.forEach((it: any) => {
                const div = document.createElement('div');
                div.className = 'flex justify-between border-b py-1';
                const when = it.exitTime ? new Date(it.exitTime).toLocaleTimeString() : '';
                div.innerHTML = `<span>${it.destinationName || '—'} • ${when}</span><span class="font-semibold">${(Number(it.amount || 0)).toFixed(3)} TND</span>`;
                listEl.appendChild(div);
              });
              if (items.length === 0) {
                const div = document.createElement('div');
                div.className = 'text-muted-foreground';
                div.textContent = 'Aucune sortie aujourd\'hui';
                listEl.appendChild(div);
              }
            }
          }
        }
      } catch {}
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              const date = todayStr();
              const res = await api.get(`/api/vehicles/trips/daily?date=${encodeURIComponent(date)}`);
              if (res.success && res.data) {
                try { sessionStorage.setItem(`allVehicleTrips:${date}`, JSON.stringify(res.data)); } catch {}
                navigate(`/print-all-vehicle-trips?date=${encodeURIComponent(date)}`);
              } else {
                addNotification({ type: 'error', title: 'Erreur', message: res.message || 'Échec du chargement du rapport' });
              }
            }}>
              <Printer className="h-4 w-4 mr-2" /> Imprimer tous les trajets (A4)
            </Button>
            <Button variant="outline" size="sm" onClick={fetchVehicles} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Rafraîchir
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3">Plaque d'immatriculation</th>
                  <th className="text-left py-2 px-3">Capacité</th>
                  <th className="text-left py-2 px-3">CIN du conducteur</th>
                  <th className="text-left py-2 px-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id} className="border-b hover:bg-muted cursor-pointer" onClick={async () => { setSelectedVehicle(v); setIsVehicleModalOpen(true); fetchVehicleDetails(v.id); }}>
                    <td className="py-2 px-3 font-medium">{v.licensePlate}</td>
                    <td className="py-2 px-3">{v.capacity} places</td>
                    <td className="py-2 px-3">{v.driver ? v.driver.cin : '-'}</td>
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
                  <th className="text-left py-2 px-3">CIN du conducteur</th>
                  <th className="text-left py-2 px-3">Statut</th>
                  <th className="text-left py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map(r => (
                  <tr key={r.id} className="border-b hover:bg-muted">
                    <td className="py-2 px-3 font-medium">{r.licensePlate}</td>
                    <td className="py-2 px-3">{r.driver ? r.driver.cin : '-'}</td>
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
                    CIN *
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
                <div className="flex items-end">
                  <div className="text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 inline mr-1" />
                    Origine: Monastir (automatique)
                </div>
                </div>
              </div>
            </div>

            {/* Vehicle Information Section */}
            <div className="bg-purple-50 dark:bg-purple-950 rounded-lg p-4">
              <h3 className="flex items-center gap-2 font-medium mb-4 text-purple-800 dark:text-purple-200">
                <Car className="h-4 w-4" />
                Informations du véhicule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
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
                    placeholder="8 (par défaut)"
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Nombre de places disponibles (défaut: 8)
                </div>
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
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium">Stations autorisées *</label>
                    <div className="flex gap-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={selectAllMonastirDelegations}
                        className="whitespace-nowrap bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                      >
                        <Globe className="h-4 w-4 mr-1" />
                        Tout Monastir
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={clearAllStations}
                        className="whitespace-nowrap bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Tout désélectionner
                      </Button>
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
                  </div>

                  {/* Search Input */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Rechercher une station..."
                      value={stationSearchTerm}
                      onChange={(e) => setStationSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Station Selection Boxes */}
                  <div className="border rounded-lg p-4 min-h-[200px] max-h-[300px] overflow-y-auto bg-gray-50 dark:bg-gray-800">
                    {stations.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        <Building className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        Aucune station disponible
                      </div>
                    ) : filteredStations.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        Aucune station trouvée pour "{stationSearchTerm}"
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredStations.map(station => {
                          const isSelected = form.authorizedStationIds.includes(station.id);
                          const isCurrentStation = stationConfig && station.id === stationConfig.id;
                          
                          return (
                            <div
                              key={station.id}
                              onClick={() => toggleStationSelection(station.id)}
                              className={`
                                relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                                ${isSelected 
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                                  : 'border-gray-200 bg-white dark:bg-gray-700 hover:border-gray-300'
                                }
                                ${isCurrentStation ? 'ring-2 ring-green-200' : ''}
                              `}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-sm">
                                    {station.name}
                                  </div>
                                  {isCurrentStation && (
                    <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                                      Station actuelle
                                    </div>
                                  )}
                                </div>
                                <div className="ml-2">
                                  {isSelected ? (
                                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                      <Check className="h-4 w-4 text-white" />
                                    </div>
                                  ) : (
                                    <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selection Summary */}
                  {form.authorizedStationIds.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <div className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="font-medium">{form.authorizedStationIds.length} station(s) sélectionnée(s)</span>
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                        {form.authorizedStationIds.map(id => {
                          const station = stations.find(s => s.id === id);
                          return station?.name;
                        }).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium">Destination par défaut (optionnel)</label>
                    {form.defaultDestinationId && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={clearDefaultDestination}
                        className="whitespace-nowrap bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Effacer
                      </Button>
                    )}
                  </div>

                  {form.authorizedStationIds.length === 0 ? (
                    <div className="border rounded-lg p-6 text-center bg-gray-50 dark:bg-gray-800">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-gray-500 text-sm">
                        Sélectionnez d'abord des stations autorisées pour choisir une destination par défaut
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Destination Search Input */}
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          type="text"
                          placeholder="Rechercher une destination..."
                          value={destinationSearchTerm}
                          onChange={(e) => setDestinationSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>

                      {/* Destination Selection Boxes */}
                      <div className="border rounded-lg p-4 min-h-[150px] max-h-[250px] overflow-y-auto bg-gray-50 dark:bg-gray-800">
                        {filteredDestinations.length === 0 ? (
                          <div className="text-center text-gray-500 py-6">
                            <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            {destinationSearchTerm ? 
                              `Aucune destination trouvée pour "${destinationSearchTerm}"` :
                              'Aucune station autorisée disponible'
                            }
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {filteredDestinations.map(station => {
                              const isSelected = form.defaultDestinationId === station.id;
                              const isCurrentStation = stationConfig && station.id === stationConfig.id;
                              
                              return (
                                <div
                                  key={station.id}
                                  onClick={() => selectDefaultDestination(station.id)}
                                  className={`
                                    relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                                    ${isSelected 
                                      ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                                      : 'border-gray-200 bg-white dark:bg-gray-700 hover:border-gray-300'
                                    }
                                    ${isCurrentStation ? 'ring-2 ring-blue-200' : ''}
                                  `}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">
                                        {station.name}
                                      </div>
                                      {isCurrentStation && (
                                        <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                          <CheckCircle2 className="h-3 w-3" />
                                          Station actuelle
                                        </div>
                                      )}
                                    </div>
                                    <div className="ml-2">
                                      {isSelected ? (
                                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                          <Check className="h-4 w-4 text-white" />
                                        </div>
                                      ) : (
                                        <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Destination Selection Summary */}
                      {form.defaultDestinationId && (
                        <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                          <div className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="font-medium">Destination par défaut sélectionnée</span>
                          </div>
                          <div className="text-xs text-green-600 dark:text-green-300 mt-1">
                            {stations.find(s => s.id === form.defaultDestinationId)?.name}
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                    La destination par défaut sera utilisée automatiquement lors de l'ajout à la file d'attente.
                  </div>
                    </>
                  )}
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
                    <div className="text-sm text-muted-foreground">Capacité: {vehicleDetails.capacity} places</div>
                  </div>
                  <div>
                    <Badge variant={vehicleDetails.isAvailable ? 'default' : 'secondary'}>
                      {vehicleDetails.isAvailable ? 'Disponible' : 'Indisponible'}
                    </Badge>
                  </div>
                </div>
                  {/* Driver Income (today, from exit passes) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-card p-3 rounded border">
                      <div className="text-xs text-muted-foreground">Revenus d'aujourd'hui</div>
                      <div className="text-lg font-semibold" id="driver-income-today">
                        {/* Filled dynamically below */}
                      </div>
                    </div>
                    <div className="md:col-span-2 bg-card p-3 rounded border">
                      <div className="text-xs text-muted-foreground mb-1">Sorties aujourd'hui</div>
                      <div className="space-y-1 text-sm max-h-32 overflow-auto" id="driver-income-list"></div>
                    </div>
                  </div>
                <div className="flex flex-col gap-2">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-200">Stations autorisées</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {vehicleDetails.authorizedStations && vehicleDetails.authorizedStations.length > 0 ? (
                      vehicleDetails.authorizedStations.map((s: any) => (
                        <Badge key={s.id} variant="outline" className="bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200">
                          {s.stationId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                    <Button size="sm" variant="secondary" className="ml-auto" onClick={async () => {
                      if (!vehicleDetails) return;
                      const date = todayStr();
                      const res = await api.getVehicleTrips(vehicleDetails.id, date);
                      if (res.success && res.data) {
                        try { sessionStorage.setItem(`vehicleTrips:${vehicleDetails.id}:${date}`, JSON.stringify(res.data)); } catch {}
                        navigate(`/print-vehicle-trips?vehicleId=${encodeURIComponent(vehicleDetails.id)}&date=${encodeURIComponent(date)}`);
                      } else {
                        addNotification({ type: 'error', title: 'Erreur', message: res.message || 'Échec du chargement des trajets' });
                      }
                    }}>
                      <Printer className="h-4 w-4 mr-2" /> Imprimer trajets (A4)
                    </Button>
                  </div>
                </div>
                <div className="pt-2">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">Conducteur</div>
                  {vehicleDetails.driver ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-xs text-muted-foreground">CIN</span><br /><span className="font-mono">{vehicleDetails.driver.cin}</span></div>
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