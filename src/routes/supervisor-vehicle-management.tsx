import React, { useEffect, useState } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthProvider';
import { useNotifications } from '../context/NotificationProvider';
import api from '../lib/api';
import { dbClient } from '../services/dbClient';
import { Loader2, Plus, Check, X, RefreshCw, Car, UserPlus, MapPin, Globe, AlertCircle, CheckCircle2, Users, Phone, Hash, Building, Printer, Search, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Select } from '../components/ui/select';
import MunicipalityService from '../services/municipalityService';
import { keyboardShortcuts } from '../services/keyboardShortcuts';

interface Vehicle {
  id: string;
  licensePlate: string;
  capacity: number;
  isActive: boolean;
  isAvailable: boolean;
  phoneNumber?: string | null;
  driver?: {
    id: string;
    cin: string;
    accountStatus: string;
  };
  authorizedStations?: { id: string; name: string }[];
  isBanned: boolean;
}


const SupervisorVehicleManagement: React.FC = () => {
  const { currentStaff } = useAuth();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const todayStr = () => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; };
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [form, setForm] = useState({
    licensePlate: '',
    capacity: '8', // Default to 8 seats
    phoneNumber: '',
    authorizedStationIds: [] as string[],
    defaultDestinationId: '',
  });
  const [governorates, setGovernorates] = useState<{ id: string; name: string; nameAr?: string }[]>([]);
  const [delegations, setDelegations] = useState<{ id: string; name: string; nameAr?: string; governorateId: string }[]>([]);
  // Remove separate stations state - we'll use routes data instead
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState(false);
  const [municipalityAPIStatus, setMunicipalityAPIStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<Vehicle | null>(null);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isVehicleFloatingOpen, setIsVehicleFloatingOpen] = useState(false);
  const [vehicleActivity, setVehicleActivity] = useState<Array<{eventType: string; timestamp: string; destinationName?: string}>>([]);
  const [isVehicleDetailsLoading, setIsVehicleDetailsLoading] = useState(false);
  const [stationConfig, setStationConfig] = useState<any>(null);
  const tunisianPlateRegex = /^\d{2,3} ?TUN ?\d{1,4}$/i;
  const [licensePlateError, setLicensePlateError] = useState<string | null>(null);
  const [stationSearchTerm, setStationSearchTerm] = useState('');
  const [destinationSearchTerm, setDestinationSearchTerm] = useState('');
  const [isLoadingMonastir, setIsLoadingMonastir] = useState(false);
  const [licensePlateFirst, setLicensePlateFirst] = useState('');
  const [licensePlateSecond, setLicensePlateSecond] = useState('');
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [editingPhoneVehicleId, setEditingPhoneVehicleId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  // Helper
  const formatTND = (value: any) => {
    const n = typeof value === 'number' ? value : parseFloat(value || '0');
    return `${(Number.isFinite(n) ? n : 0).toFixed(3)} TND`;
  };

  // Handle license plate first part input
  const handleLicensePlateFirst = (value: string) => {
    // Only allow numbers, max 3 digits
    const numericValue = value.replace(/\D/g, '').slice(0, 3);
    setLicensePlateFirst(numericValue);
    
    // Auto-update the full license plate
    const fullPlate = numericValue && licensePlateSecond 
      ? `${numericValue} TUN ${licensePlateSecond}` 
      : numericValue;
    
    setForm(prev => ({ ...prev, licensePlate: fullPlate }));
    setLicensePlateError(null);
  };

  // Handle license plate second part input
  const handleLicensePlateSecond = (value: string) => {
    // Only allow numbers, max 4 digits
    const numericValue = value.replace(/\D/g, '').slice(0, 4);
    setLicensePlateSecond(numericValue);
    
    // Auto-update the full license plate
    const fullPlate = licensePlateFirst && numericValue 
      ? `${licensePlateFirst} TUN ${numericValue}` 
      : licensePlateFirst;
    
    setForm(prev => ({ ...prev, licensePlate: fullPlate }));
    setLicensePlateError(null);
  };

  // Function to select all stations for a specific governorate using database
  const selectAllStationsByGovernorate = async (governorate: string) => {
    setIsLoadingMonastir(true);
    try {
      // Get all stations for the specified governorate from database
      const stations = await dbClient.getStationsByGovernorate(governorate);
      
      const stationIds = stations.map(station => station.stationId);
      setForm(prev => ({
        ...prev,
        authorizedStationIds: stationIds
      }));
      
      addNotification({
        type: 'success',
        title: 'Succès',
        message: `${stationIds.length} stations de ${governorate} sélectionnées`
      });
    } catch (error: any) {
      console.error(`Error fetching ${governorate} stations:`, error);
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: `Impossible de charger les stations de ${governorate}`
      });
    } finally {
      setIsLoadingMonastir(false);
    }
  };

  // Function to select all Monastir delegations using database
  const selectAllMonastirDelegations = () => {
    selectAllStationsByGovernorate('Monastir');
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
  const filteredStations = routes.filter(route =>
    route.stationName.toLowerCase().includes(stationSearchTerm.toLowerCase())
  ).map(route => ({ id: route.stationId, name: route.stationName }));

  // Filter vehicles based on search (license plate or phone)
  const filteredVehicles = vehicles.filter(v => {
    if (!vehicleSearchTerm.trim()) return true;
    const q = vehicleSearchTerm.toLowerCase();
    return (
      v.licensePlate.toLowerCase().includes(q) ||
      (v.phoneNumber || '').toLowerCase().includes(q)
    );
  }).filter(v => (showActiveOnly ? v.isActive : true))
    .filter(v => (showAvailableOnly ? v.isAvailable : true))
    .sort((a: any, b: any) => {
      // newest first, fallback to plate if missing
      const ad = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bd = b.createdAt ? Date.parse(b.createdAt) : 0;
      if (ad !== bd) return bd - ad;
      return a.licensePlate.localeCompare(b.licensePlate);
    });

  const startEditPhone = (vehicleId: string, currentPhone?: string | null) => {
    setEditingPhoneVehicleId(vehicleId);
    setPhoneDraft(currentPhone || '');
  };

  const cancelEditPhone = () => {
    setEditingPhoneVehicleId(null);
    setPhoneDraft('');
  };

  const savePhone = async (vehicleId: string) => {
    try {
      setIsSavingPhone(true);
      await dbClient.updateVehiclePhone(vehicleId, phoneDraft.trim() ? phoneDraft.trim() : undefined);
      setVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, phoneNumber: phoneDraft.trim() || null } : v));
      if (vehicleDetails && vehicleDetails.id === vehicleId) {
        setVehicleDetails({ ...vehicleDetails, phoneNumber: phoneDraft.trim() || null });
      }
      addNotification({ type: 'success', title: 'Téléphone mis à jour', message: 'Numéro enregistré avec succès.' });
      setEditingPhoneVehicleId(null);
      setPhoneDraft('');
    } catch (e: any) {
      addNotification({ type: 'error', title: 'Erreur', message: e?.message || "Échec de la mise à jour du numéro." });
    } finally {
      setIsSavingPhone(false);
    }
  };

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
  const authorizedStations = routes.filter(route =>
    form.authorizedStationIds.includes(route.stationId)
  ).map(route => ({ id: route.stationId, name: route.stationName }));

  // Filter authorized stations based on destination search term
  const filteredDestinations = authorizedStations.filter(station =>
    station.name.toLowerCase().includes(destinationSearchTerm.toLowerCase())
  );

  // Only supervisors and admins can access
  if (currentStaff?.role !== 'SUPERVISOR' && currentStaff?.role !== 'ADMIN') {
    return <div className="p-8 text-center text-lg">Accès refusé. Réservé au superviseur.</div>;
  }

  // Fetch vehicles using direct database access
  const fetchVehicles = async () => {
    setIsLoading(true);
    try {
      const vehiclesData = await dbClient.getAllVehicles();
      // Filter out banned vehicles
      const activeVehicles = vehiclesData.filter((vehicle: any) => !vehicle.isBanned);
      setVehicles(activeVehicles);
    } catch (error: any) {
      console.error('Error fetching vehicles:', error);
      addNotification({ type: 'error', title: 'Erreur', message: 'Impossible de charger la liste des véhicules' });
    }
    setIsLoading(false);
  };

  // Fetch routes for station selection using direct database access
  const fetchRoutes = async () => {
    try {
      const routesData = await dbClient.getAvailableDestinations();
      setRoutes(routesData);
    } catch (error) {
      console.error('Error loading routes:', error);
      addNotification({ type: 'error', title: 'Erreur', message: 'Impossible de charger les destinations' });
    }
  };


  // Polling for real-time updates and keyboard shortcuts setup
  useEffect(() => {
    fetchVehicles();
    fetchRoutes();
    
    // Setup keyboard shortcuts for this page
    keyboardShortcuts.setNavigate(navigate);
    
    // Register page-specific shortcuts
    keyboardShortcuts.registerShortcut({
      key: 'Ctrl+A',
      description: 'Ajouter un véhicule',
      category: 'action',
      action: () => setShowRequestForm(true)
    });

    keyboardShortcuts.registerShortcut({
      key: 'Ctrl+R',
      description: 'Actualiser la liste',
      category: 'action',
      action: () => {
        fetchVehicles();
        fetchRoutes();
      }
    });

    // Real-time polling with shorter interval for better responsiveness
    const interval = setInterval(() => {
      fetchVehicles();
      fetchRoutes();
    }, 5000); // Reduced from 10s to 5s for better real-time updates
    
    // Cleanup shortcuts and interval on unmount
    return () => {
      clearInterval(interval);
      keyboardShortcuts.unregisterShortcut('Ctrl+A');
      keyboardShortcuts.unregisterShortcut('Ctrl+R');
    };
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


    const fetchStationConfig = async () => {
      try {
        const res = await api.getStationConfig();
        if (res.success && res.data) {
          setStationConfig(res.data);
          console.log("station config", res.data);
        }
      } catch (error) {
        console.warn('Station config not available:', error);
        // Continue without station config
      }
    };

    initializeMunicipalityData();
    fetchStationConfig();
  }, []);

  // Auto-select current station in authorized stations when form opens
  useEffect(() => {
    if (showRequestForm && routes.length > 0 && stationConfig?.id) {
        setForm(f => ({ 
          ...f, 
        authorizedStationIds: [stationConfig.id]
      }));
      console.log(`🎯 Auto-selected current station: ${stationConfig.stationName}`);
    }
  }, [showRequestForm, routes, stationConfig]);


  // Approve request


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
          setLicensePlateError('Format: 123 TUN 4567 (2-3 digits, TUN, 1-4 digits)');
        } else {
          setLicensePlateError(null);
        }
      }
    }
  };

  // Submit new vehicle creation using direct database operations
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.licensePlate && !tunisianPlateRegex.test(form.licensePlate.trim())) {
      setLicensePlateError('Format: 123 TUN 4567 (2-3 digits, TUN, 1-4 digits)');
      return;
    }
    setIsSubmitting(true);
    
    try {
      // Create vehicle using direct database operation
      const capacity = form.capacity ? Number(form.capacity) : 8;
      const result = await dbClient.createVehicle(form.licensePlate, capacity, form.phoneNumber || undefined);
      
      // Extract vehicle ID from the result message
      const vehicleIdMatch = result.match(/ID: ([a-f0-9-]+)/);
      const vehicleId = vehicleIdMatch ? vehicleIdMatch[1] : null;
      
      if (vehicleId) {
        // Add authorized stations if any are selected
        if (form.authorizedStationIds && form.authorizedStationIds.length > 0) {
          for (const stationId of form.authorizedStationIds) {
            // Find station name from routes
            const station = routes.find(r => r.stationId === stationId);
            if (station) {
              try {
                await dbClient.authorizeVehicleStation(vehicleId, stationId, station.stationName);
              } catch (authError: any) {
                console.warn('Failed to authorize station:', authError);
                // Continue with other stations even if one fails
              }
            }
          }
        }
        
        // Create the new vehicle object for immediate display
        const newVehicle = {
          id: vehicleId,
          licensePlate: form.licensePlate,
          capacity: capacity,
          isActive: true,
          isAvailable: true,
          isBanned: false,
          defaultDestinationId: form.defaultDestinationId || null,
          defaultDestinationName: form.defaultDestinationId ? 
            routes.find(r => r.stationId === form.defaultDestinationId)?.stationName || null : null
        };
        
        // Immediately add the new vehicle to the local state for instant display
        setVehicles(prevVehicles => [...prevVehicles, newVehicle]);
        
        setShowRequestForm(false);
        setForm({
          licensePlate: '', 
          capacity: '8', 
          phoneNumber: '',
          authorizedStationIds: [], 
          defaultDestinationId: ''
        });
        setLicensePlateFirst('');
        setLicensePlateSecond('');
        addNotification({ type: 'success', title: 'Véhicule créé', message: 'Le véhicule a été créé avec succès.' });
        
        // Optional: Refresh routes to ensure we have the latest data
        fetchRoutes();
      } else {
        addNotification({ type: 'error', title: 'Erreur', message: 'Impossible de récupérer l\'ID du véhicule créé.' });
      }
    } catch (error: any) {
      addNotification({ type: 'error', title: 'Erreur', message: error.message || 'Une erreur est survenue.' });
    }
    
    setIsSubmitting(false);
  };

  // Fetch vehicle details by ID (optional: if you want to fetch fresh data)
  const fetchVehicleDetails = async (id: string) => {
    setIsVehicleDetailsLoading(true);
    // Use already loaded vehicle data instead of making API call
    const vehicle = vehicles.find(v => v.id === id);
    if (vehicle) {
      setVehicleDetails(vehicle);
      try {
        const activity = await dbClient.getVehicleActivity72h(vehicle.licensePlate);
        setVehicleActivity(activity);
      } catch (e) {
        setVehicleActivity([]);
      }
    } else {
      setVehicleDetails(null);
    }
    setIsVehicleDetailsLoading(false);
  };


  // Add the banVehicle function using direct database access
  const banVehicle = async (vehicleId: string) => {
    try {
      await dbClient.banVehicle(vehicleId);
      
      // Immediately update the local state to remove the banned vehicle
      setVehicles(prevVehicles => prevVehicles.filter(v => v.id !== vehicleId));
      
      addNotification({ type: 'success', title: 'Véhicule banni', message: 'Le véhicule a été banni avec succès.' });
      setIsVehicleModalOpen(false);
    } catch (error: any) {
      addNotification({ type: 'error', title: 'Erreur', message: error.message || 'Échec du bannissement du véhicule.' });
    }
  };

  return (
    <div className="container mx-auto p-6 h-screen flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Car className="h-6 w-6" /> Gestion des véhicules
        </h1>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => navigate('/vehicle-reports')}
          >
            <FileText className="h-4 w-4 mr-2" /> Rapports
          </Button>
          <Button 
            data-shortcut="add-vehicle"
            onClick={() => {
              if (stationConfig && governorates.length > 0 && delegations.length > 0 && routes.length > 0) {
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
      </div>

      {/* 3-column layout: Filters | Table | Details */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Filters */}
        <div className="col-span-12 md:col-span-3 lg:col-span-3 min-h-0">
          <Card className="p-4 h-full flex flex-col">
            <div className="text-lg font-semibold mb-3">Filtres</div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Rechercher (plaque ou téléphone)"
                value={vehicleSearchTerm}
                onChange={(e) => setVehicleSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 mb-3">
              <Button type="button" variant={showActiveOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowActiveOnly(v => !v)}>
                {showActiveOnly ? 'Actifs' : 'Tous statuts'}
              </Button>
              <Button type="button" variant={showAvailableOnly ? 'default' : 'outline'} size="sm" onClick={() => setShowAvailableOnly(v => !v)}>
                {showAvailableOnly ? 'Disponibles' : 'Tous véhicules'}
              </Button>
            </div>
            {/* Sorting controls removed; list now sorted by date de création */}
            <div className="mt-auto pt-3 border-t">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const date = todayStr();
                    const res = await api.get(`/api/vehicles/trips/daily?date=${encodeURIComponent(date)}`);
                    if (res.success && res.data) {
                      try { sessionStorage.setItem(`allVehicleTrips:${date}`, JSON.stringify(res.data)); } catch {}
                      navigate(`/print-all-vehicle-trips?date=${encodeURIComponent(date)}`);
                    } else {
                      addNotification({ type: 'error', title: 'Erreur', message: res.message || 'Échec du chargement du rapport' });
                    }
                  } catch (error) {
                    addNotification({ type: 'error', title: 'Erreur', message: 'Fonction d\'impression non disponible' });
                  }
                }}>
                  <Printer className="h-4 w-4 mr-2" /> Imprimer A4
                </Button>
                <Button variant="outline" size="sm" onClick={fetchVehicles} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Rafraîchir
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Table */}
        <div className="col-span-12 md:col-span-5 lg:col-span-5 min-h-0">
          <Card className="p-0 h-full flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Car className="h-5 w-5" /> Véhicules
              </h2>
              <div className="text-sm text-muted-foreground">{filteredVehicles.length} véhicule(s)</div>
            </div>
            <div className="overflow-x-auto flex-1 min-h-0">
              <div className="h-full overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3">Plaque</th>
                      <th className="text-left py-2 px-3">Capacité</th>
                      <th className="text-left py-2 px-3">Téléphone</th>
                      <th className="text-left py-2 px-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVehicles.map(v => (
                      <tr key={v.id} className={`border-b hover:bg-muted cursor-pointer ${selectedVehicle?.id === v.id ? 'bg-muted/50' : ''}`} onClick={async () => { setSelectedVehicle(v); fetchVehicleDetails(v.id); }}>
                        <td className="py-2 px-3 font-medium">{v.licensePlate}</td>
                        <td className="py-2 px-3">{v.capacity} places</td>
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          {editingPhoneVehicleId === v.id ? (
                            <div className="flex items-center gap-2">
                              <Input value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} placeholder="Téléphone" className="w-40" />
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={isSavingPhone} onClick={() => savePhone(v.id)}>
                                {isSavingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEditPhone}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{v.phoneNumber || '-'}</span>
                              <Button size="sm" variant="outline" onClick={() => startEditPhone(v.id, v.phoneNumber)}>Modifier</Button>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={v.isActive ? 'default' : 'secondary'}>
                              {v.isActive ? 'Actif' : 'Inactif'}
                            </Badge>
                            <Badge variant={v.isAvailable ? 'default' : 'secondary'}>
                              {v.isAvailable ? 'Disponible' : 'Indispo'}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredVehicles.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-4 text-muted-foreground">Aucun véhicule trouvé.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>

        {/* Details */}
        <div className="col-span-12 md:col-span-4 lg:col-span-4 min-h-0">
          <Card className="p-0 h-full flex flex-col">
            <div className="p-4 border-b">
              <div className="flex items-center gap-3">
                <Car className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="text-lg font-semibold">Détails</div>
                  {vehicleDetails && (
                    <div className="text-xs text-muted-foreground mt-0.5">{vehicleDetails.licensePlate}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1 min-h-0">
              {!vehicleDetails ? (
                <div className="text-sm text-muted-foreground">Sélectionnez un véhicule pour voir les détails.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {vehicleDetails.isBanned && <Badge variant="destructive">Banni</Badge>}
                    {!vehicleDetails.isBanned && !vehicleDetails.isActive && <Badge variant="secondary">Inactif</Badge>}
                    {vehicleDetails.isActive && !vehicleDetails.isBanned && <Badge variant="default">Actif</Badge>}
                    <Badge variant={vehicleDetails.isAvailable ? 'default' : 'secondary'}>
                      {vehicleDetails.isAvailable ? 'Disponible' : 'Indisponible'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-800 border">
                      <div className="text-xs text-muted-foreground">Capacité</div>
                      <div className="text-lg font-semibold">{vehicleDetails.capacity} places</div>
                    </div>
                    <div className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-800 border">
                      <div className="text-xs text-muted-foreground">Téléphone</div>
                      {editingPhoneVehicleId === vehicleDetails.id ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} placeholder="Téléphone" className="w-full" />
                          <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={isSavingPhone} onClick={() => savePhone(vehicleDetails.id)}>
                            {isSavingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEditPhone}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm">{vehicleDetails.phoneNumber || '-'}</span>
                          <Button size="sm" variant="outline" onClick={() => startEditPhone(vehicleDetails.id, vehicleDetails.phoneNumber)}>Modifier</Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2">Stations autorisées</div>
                    <div className="flex flex-wrap gap-2">
                      {vehicleDetails.authorizedStations && vehicleDetails.authorizedStations.length > 0 ? (
                        vehicleDetails.authorizedStations.map((s: any) => (
                          <Badge key={s.id} variant="outline" className="bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200">
                            {s.stationId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Aucune station autorisée</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2 flex items-center gap-2">
                      <span>Activité (72h)</span>
                      <span className="text-xs text-muted-foreground">(Entrées/Sorties récentes)</span>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-auto">
                      {vehicleActivity.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Aucune activité récente.</div>
                      ) : vehicleActivity.map((it, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${it.eventType === 'ENTRY' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              {it.eventType === 'ENTRY' ? 'Entrée' : 'Sortie'}
                            </span>
                            <span className="truncate max-w-[140px]">{it.destinationName || '-'}</span>
                          </div>
                          <div className="text-muted-foreground font-mono whitespace-nowrap">{new Date(it.timestamp).toLocaleString('fr-FR')}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2">Conducteur</div>
                    {vehicleDetails.driver ? (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Plaque</div>
                          <div className="font-mono">{vehicleDetails.licensePlate}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Statut du compte</div>
                          <div>{vehicleDetails.driver.accountStatus}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Aucun conducteur assigné.</div>
                    )}
                  </div>

                  <div className="pt-2 border-t">
                    <div className="flex justify-end">
                      <Button variant="destructive" onClick={async () => {
                        if (!vehicleDetails) return;
                        await banVehicle(vehicleDetails.id);
                      }} disabled={vehicleDetails.isBanned}>
                        Bannir ce véhicule
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>


      {/* New Vehicle Form Dialog */}
      <Dialog open={showRequestForm} onOpenChange={setShowRequestForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Car className="h-5 w-5" />
              Nouveau véhicule
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmitRequest} className="space-y-6">

            {/* Vehicle Information Section */}
            <div className="bg-purple-50 dark:bg-purple-950 rounded-lg p-4">
              <h3 className="flex items-center gap-2 font-medium mb-4 text-purple-800 dark:text-purple-200">
                <Car className="h-4 w-4" />
                Informations du véhicule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Plaque d'immatriculation *</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input 
                        value={licensePlateFirst} 
                        onChange={(e) => handleLicensePlateFirst(e.target.value)} 
                        placeholder="123" 
                        maxLength={3}
                        className={licensePlateError ? "border-red-500" : ""}
                      />
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        Première partie
                      </div>
                    </div>
                    <div className="text-lg font-bold text-gray-500 px-2">
                      TUN
                    </div>
                    <div className="flex-1">
                      <Input 
                        value={licensePlateSecond} 
                        onChange={(e) => handleLicensePlateSecond(e.target.value)} 
                        placeholder="4567" 
                        maxLength={4}
                        className={licensePlateError ? "border-red-500" : ""}
                      />
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        Deuxième partie
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 text-center">
                    Résultat: <span className="font-mono font-semibold">{form.licensePlate || '___ TUN ____'}</span>
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
              <div>
                <label className="block text-sm font-medium mb-1">Téléphone (optionnel)</label>
                <Input 
                  name="phoneNumber"
                  value={form.phoneNumber}
                  onChange={handleFormChange}
                  placeholder="Ex: 23 456 789"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Numéro de téléphone du propriétaire/conducteur (vide par défaut)
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
                        onClick={() => selectAllMonastirDelegations()}
                        disabled={isLoadingMonastir}
                        className="whitespace-nowrap bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 disabled:opacity-50"
                      >
                        {isLoadingMonastir ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Globe className="h-4 w-4 mr-1" />
                        )}
                        {isLoadingMonastir ? 'Chargement...' : 'Tout Monastir'}
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
                    {routes.length === 0 ? (
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
                          const station = routes.find(r => r.stationId === id);
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
                            {routes.find(r => r.stationId === form.defaultDestinationId)?.stationName}
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
                data-shortcut="close-modal"
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

      {/* Floating details dialog removed in favor of inline panel */}
    </div>
  );
};

export default SupervisorVehicleManagement; 