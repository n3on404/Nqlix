import React, { useEffect, useState, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthProvider';
import { useDashboard } from '../context/DashboardProvider';
import { useNotifications } from '../context/NotificationProvider';
import { useSupervisorMode } from "../context/SupervisorModeProvider";
import { 
  DollarSign, TrendingUp, BarChart3, MapPin, User, Clock, RefreshCw, Car, Users, 
  Calendar, Bell, Loader2, AlertCircle, CheckCircle, XCircle, Activity, 
  Truck, Navigation, Ticket, Zap, Eye, EyeOff, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import api from '../lib/api';
import { getWebSocketClient, ConnectionState } from '../lib/websocket';
import { SystemStatus } from '../components/SystemStatus';

interface QueueData {
  destinationId: string;
  destinationName: string;
  vehicleCount: number;
  waitingVehicles: number;
  loadingVehicles: number;
  readyVehicles: number;
  totalSeats: number;
  availableSeats: number;
  basePrice: number;
  estimatedNextDeparture?: string;
}

interface VehicleData {
  id: string;
  licensePlate: string;
  destinationName: string;
  queuePosition: number;
  status: 'WAITING' | 'LOADING' | 'READY' | 'DEPARTED';
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  enteredAt: string;
  estimatedDeparture?: string;
  driver?: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
  };
}

interface BookingData {
  id: string;
  vehicleLicensePlate: string;
  destinationName: string;
  seatsBooked: number;
  totalAmount: number;
  bookingType: 'CASH' | 'ONLINE';
  createdAt: string;
  verificationCode: string;
}

interface DashboardStats {
  totalVehicles: number;
  totalQueues: number;
  totalBookings: number;
  todayBookings: number;
  todayRevenue: number;
  onlineBookings: number;
  cashBookings: number;
  activeDestinations: number;
  systemHealth: {
    database: boolean;
    websocket: boolean;
    centralServer: boolean;
  };
}

export default function Dashboard() {
  const { currentStaff } = useAuth();
  const { isSupervisorMode } = useSupervisorMode();
  const { isWebSocketConnected } = useDashboard();
  
  const isSupervisor = currentStaff?.role === 'SUPERVISOR';

  if (!currentStaff) {
    return <div>Loading...</div>;
  }

  if (isSupervisorMode && isSupervisor) {
    return <SupervisorDashboard />;
  }

  return <StaffDashboard />;
}

function StaffDashboard() {
  const { addNotification } = useNotifications();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queues, setQueues] = useState<QueueData[]>([]);
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [recentBookings, setRecentBookings] = useState<BookingData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showDetails, setShowDetails] = useState(false);

  // Fetch all dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch all data in parallel
      const [statsRes, queuesRes, vehiclesRes, bookingsRes] = await Promise.all([
        api.getDashboardStats(),
        api.getAvailableQueues(),
        api.getDashboardQueues(),
        api.getDashboardVehicles(),
        api.getDashboardBookings()
      ]);

      if (statsRes.success) {
        setStats(statsRes.data);
      }
      
      if (queuesRes.success) {
        setQueues(queuesRes.data || []);
      }
      
      if (vehiclesRes.success) {
        setVehicles(vehiclesRes.data || []);
      }
      
      if (bookingsRes.success) {
        setRecentBookings(bookingsRes.data?.slice(0, 10) || []);
      }
      
      setLastUpdate(new Date());
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to fetch dashboard data',
        duration: 4000
      });
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  // WebSocket real-time updates
  useEffect(() => {
    fetchDashboardData();
    const wsClient = getWebSocketClient();

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    wsClient.on('connected', handleConnect);
    wsClient.on('disconnected', handleDisconnect);
    setIsConnected(wsClient.isConnected());

    // Subscribe to real-time topics
    wsClient.subscribe(['queues', 'bookings', 'vehicles', 'dashboard']).catch(() => {});

    const queueHandler = (msg: any) => {
      if (msg?.payload?.queues) {
        setQueues(msg.payload.queues);
      }
      if (msg?.payload?.vehicles) {
        setVehicles(msg.payload.vehicles);
      }
      if (msg?.payload?.statistics) {
        setStats(msg.payload.statistics);
      }
      setLastUpdate(new Date());
    };

    const bookingHandler = (msg: any) => {
      if (msg?.payload?.type === 'booking_created') {
        fetchDashboardData(); // Refresh all data
        addNotification({
          type: 'success',
          title: 'New Booking',
          message: `New ${msg.payload.bookingType} booking for ${msg.payload.destinationName}`,
          duration: 4000
        });
      }
    };

    const vehicleHandler = (msg: any) => {
      if (msg?.payload?.type === 'vehicle_entered') {
        addNotification({
          type: 'info',
          title: 'Vehicle Entered',
          message: `Vehicle ${msg.payload.licensePlate} entered queue for ${msg.payload.destinationName}`,
          duration: 4000
        });
      }
    };

    wsClient.on('queue_update', queueHandler);
    wsClient.on('booking_update', bookingHandler);
    wsClient.on('vehicle_update', vehicleHandler);

    // Auto-refresh every 30 seconds if not connected
    const refreshInterval = setInterval(() => {
      if (!wsClient.isConnected()) {
        fetchDashboardData();
      }
    }, 30000);

    return () => {
      wsClient.removeListener('connected', handleConnect);
      wsClient.removeListener('disconnected', handleDisconnect);
      wsClient.removeListener('queue_update', queueHandler);
      wsClient.removeListener('booking_update', bookingHandler);
      wsClient.removeListener('vehicle_update', vehicleHandler);
      clearInterval(refreshInterval);
    };
  }, [fetchDashboardData, addNotification]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'WAITING': return 'bg-yellow-500';
      case 'LOADING': return 'bg-blue-500';
      case 'READY': return 'bg-green-500';
      case 'DEPARTED': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'WAITING': return 'En Attente';
      case 'LOADING': return 'Chargement';
      case 'READY': return 'Prêt';
      case 'DEPARTED': return 'Parti';
      default: return status;
    }
  };

  const formatCurrency = (amount: number | undefined | null) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '0.00 TND';
    return `${amount.toFixed(2)} TND`;
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full p-6 space-y-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tableau de Bord de la Station</h1>
          <p className="text-muted-foreground">Opérations en temps réel et gestion des files d'attente</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showDetails ? 'Masquer les Détails' : 'Afficher les Détails'}
          </Button>
          <SystemStatus compact />
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-muted-foreground">
              {isConnected ? 'En Ligne' : 'Hors Ligne'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Dernière mise à jour: {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Car className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-600">Véhicules Actifs</p>
              <p className="text-2xl font-bold text-blue-700">{stats?.totalVehicles ?? 0}</p>
              <p className="text-xs text-blue-600 mt-1">
                {vehicles.filter(v => v.status === 'WAITING').length} en attente
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <Navigation className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-600">Files d'Attente Actives</p>
              <p className="text-2xl font-bold text-green-700">{stats?.totalQueues ?? 0}</p>
              <p className="text-xs text-green-600 mt-1">
                {queues.length} destinations
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <Ticket className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-600">Réservations d'Aujourd'hui</p>
              <p className="text-2xl font-bold text-orange-700">{stats?.todayBookings ?? 0}</p>
              <p className="text-xs text-orange-600 mt-1">
                {formatCurrency(stats?.todayRevenue ?? 0)} recettes
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-600">État du Système</p>
              <p className="text-2xl font-bold text-purple-700">
                {stats?.systemHealth ? 
                  Object.values(stats.systemHealth).filter(Boolean).length : 0}/3
              </p>
              <p className="text-xs text-purple-600 mt-1">
                Services en ligne
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        {/* Queues Overview */}
        <Card className="lg:col-span-2 overflow-hidden flex flex-col">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Files d'Attente Actives
            </h2>
          </div>
          <div className="flex-1 overflow-auto">
            {queues.length > 0 ? (
              <div className="p-6 space-y-4">
                {queues.map((queue) => (
                  <div key={queue.destinationId} className="border rounded-lg p-4 hover:bg-muted">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{queue.destinationName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {queue.vehicleCount} véhicules • {queue.availableSeats} places disponibles
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600">
                          {formatCurrency(queue.basePrice)}
                        </p>
                        <p className="text-xs text-muted-foreground">par place</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                        <span>{queue.waitingVehicles} en attente</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        <span>{queue.loadingVehicles} en chargement</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span>{queue.readyVehicles} prêts</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune file d'attente active</p>
              </div>
            )}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="overflow-hidden flex flex-col">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Activité Récente
            </h2>
          </div>
          <div className="flex-1 overflow-auto">
            {recentBookings.length > 0 ? (
              <div className="p-6 space-y-4">
                {recentBookings.map((booking) => (
                  <div key={booking.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Badge variant={booking.bookingType === 'CASH' ? 'default' : 'secondary'}>
                          {booking.bookingType}
                        </Badge>
                        <span className="text-sm font-medium">{booking.vehicleLicensePlate}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatTime(booking.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{booking.destinationName}</p>
                      <p className="text-muted-foreground">
                        {booking.seatsBooked} places • {formatCurrency(booking.totalAmount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Aucune activité récente</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Vehicle Details (if showDetails is true) */}
      {showDetails && (
        <Card className="overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Détails des Véhicules
            </h2>
          </div>
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Véhicule</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Places</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entré</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="hover:bg-muted">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium">{vehicle.licensePlate}</div>
                      {vehicle.driver && (
                        <div className="text-sm text-muted-foreground">
                          {vehicle.driver.firstName} {vehicle.driver.lastName}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {vehicle.destinationName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge 
                        className={`${getStatusColor(vehicle.status)} text-white`}
                      >
                        {getStatusText(vehicle.status)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {vehicle.availableSeats}/{vehicle.totalSeats}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      #{vehicle.queuePosition}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatTime(vehicle.enteredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SupervisorDashboard() {
  const [financialData, setFinancialData] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState(false);

  // Load initial data
  const loadSupervisorData = async () => {
    try {
      setIsLoading(true);
      const response = await api.getSupervisorDashboard();
      
      if (response.success) {
        setFinancialData(response.data.financial);
        setTransactions(response.data.transactions || []);
        setLastUpdate(new Date());
      } else {
        console.error('Failed to load supervisor data:', response.message);
      }
    } catch (error) {
      console.error('Error loading supervisor data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Set up WebSocket for real-time updates
  useEffect(() => {
    const wsClient = getWebSocketClient();
    
    const handleConnect = () => {
      setIsConnected(true);
      console.log('🔌 Enhanced WebSocket connected for supervisor dashboard');
      
      // Subscribe to relevant topics
      wsClient.subscribe(['financial', 'bookings', 'dashboard']).catch(error => {
        console.error('Failed to subscribe to topics:', error);
      });
    };
    
    const handleDisconnect = () => {
      setIsConnected(false);
      console.log('🔌 Enhanced WebSocket disconnected for supervisor dashboard');
    };

    const handleStateChange = ({ newState }: { newState: ConnectionState }) => {
      setIsConnected(newState === ConnectionState.CONNECTED);
    };
    
    const handleFinancialUpdate = (data: any) => {
      console.log('📊 Received enhanced financial update:', data);
      setFinancialData(data.financial);
      setTransactions(data.recentTransactions || []);
      setLastUpdate(new Date());
    };

    const handleDashboardUpdate = (data: any) => {
      console.log('📈 Received enhanced dashboard update:', data);
      if (data.financial) {
        setFinancialData(data.financial);
      }
      if (data.recentTransactions) {
        setTransactions(data.recentTransactions);
      }
      setLastUpdate(new Date());
    };

    // Check initial connection state
    setIsConnected(wsClient.isConnected());

    // Register event listeners
    wsClient.on('connected', handleConnect);
    wsClient.on('disconnected', handleDisconnect);
    wsClient.on('state_changed', handleStateChange);
    wsClient.on('financial_update', handleFinancialUpdate);
    wsClient.on('dashboard_update', handleDashboardUpdate);
    
    // Load initial data
    loadSupervisorData();

    // Set up auto-refresh if WebSocket is not connected
    const refreshInterval = setInterval(() => {
      const currentlyConnected = wsClient.isConnected();
      setIsConnected(currentlyConnected);
      
      if (!currentlyConnected) {
        console.log('🔄 WebSocket disconnected, falling back to HTTP polling');
        loadSupervisorData();
      }
    }, 30000); // Refresh every 30 seconds

    return () => {
      wsClient.removeListener('connected', handleConnect);
      wsClient.removeListener('disconnected', handleDisconnect);
      wsClient.removeListener('state_changed', handleStateChange);
      wsClient.removeListener('financial_update', handleFinancialUpdate);
      wsClient.removeListener('dashboard_update', handleDashboardUpdate);
      clearInterval(refreshInterval);
    };
  }, []);

  const formatCurrency = (amount: number | undefined | null) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '0.00 TND';
    return `${amount.toFixed(2)} TND`;
  };

  const formatDate = (dateInput: string | Date) => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getConnectionStatusColor = () => {
    return isConnected ? 'bg-green-500' : 'bg-red-500';
  };

  if (isLoading && !financialData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading supervisor dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header and Income Cards */}
      <div className="p-6 border-b bg-muted/50">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Supervisor Dashboard</h1>
              <p className="text-muted-foreground">Real-time station income and transaction management</p>
            </div>
            <div className="flex items-center space-x-4">
              <SystemStatus compact />
              <span className="text-xs text-muted-foreground">
                Last update: {lastUpdate.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* Income Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="p-4 lg:p-6 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Today's Income</p>
                <p className="text-2xl lg:text-3xl font-bold text-green-700">
                  {formatCurrency(Number(financialData?.todayIncome) || 0)}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  {Number(financialData?.todayTransactions) || 0} transactions
                </p>
              </div>
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-green-500 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
              </div>
            </div>
          </Card>

          <Card className="p-4 lg:p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Month Income</p>
                <p className="text-2xl lg:text-3xl font-bold text-blue-700">
                  {formatCurrency(Number(financialData?.monthIncome) || 0)}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {Number(financialData?.monthTransactions) || 0} transactions
                </p>
              </div>
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
              </div>
            </div>
          </Card>

          <Card className="p-4 lg:p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Total Transactions</p>
                <p className="text-2xl lg:text-3xl font-bold text-purple-700">
                  {Number(financialData?.totalTransactions) || 0}
                </p>
                <p className="text-xs text-purple-600 mt-1">All time</p>
              </div>
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
              </div>
            </div>
          </Card>

          <Card className="p-4 lg:p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Avg Transaction</p>
                <p className="text-2xl lg:text-3xl font-bold text-orange-700">
                  {formatCurrency(Number(financialData?.avgTransactionAmount) || 0)}
                </p>
                <p className="text-xs text-orange-600 mt-1">Per transaction</p>
              </div>
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Transaction History - Full Height */}
      <div className="flex-1 p-6 overflow-hidden">
        <Card className="h-full flex flex-col">
          <div className="p-6 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-xl font-semibold">Recent Transactions</h2>
              <div className="flex items-center space-x-2">
                {isConnected && (
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    Live Updates
                  </Badge>
                )}
                                 <div className="text-sm text-muted-foreground">
                   {Array.isArray(transactions) ? transactions.length : 0} recent transactions
                 </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="min-w-full">
              <table className="w-full">
                <thead className="sticky top-0 bg-card border-b z-10">
                  <tr className="text-left">
                    <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Destination</th>
                    <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Vehicle</th>
                    <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Staff</th>
                    <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Amount</th>
                    <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Array.isArray(transactions) && transactions.map((transaction, index) => (
                    <tr key={transaction.id || `transaction-${index}`} className="hover:bg-muted transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{transaction.destinationName || 'Unknown'}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {transaction.seatsBooked || 0} seat{(transaction.seatsBooked || 0) !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium">{transaction.vehicleLicensePlate || 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{transaction.bookingType || 'CASH'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <span className="text-sm truncate">{transaction.staffName || 'Unknown'}</span>
                            <div className="text-xs text-muted-foreground">{transaction.staffRole || 'WORKER'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-green-600 whitespace-nowrap">
                          {formatCurrency(Number(transaction.amount) || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(transaction.createdAt?.toString() || new Date().toISOString())}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {(!Array.isArray(transactions) || transactions.length === 0) && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No transactions found</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
} 