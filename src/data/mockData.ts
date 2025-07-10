// Mock data for the station desktop app - will replace with real API calls later

export interface Staff {
  id: string;
  cin: string;
  firstName: string;
  lastName: string;
  role: 'WORKER' | 'SUPERVISOR';
  phoneNumber: string;
  isActive: boolean;
}

export interface Vehicle {
  id: string;
  licensePlate: string;
  driverId: string;
  driverName: string;
  driverCin: string;
  capacity: number;
  isActive: boolean;
  assignedDestinationId?: string;
  assignedDestinationName?: string;
}

export interface VehicleQueue {
  id: string;
  vehicleId: string;
  destinationId: string;
  destinationName: string;
  queueType: 'OVERNIGHT' | 'REGULAR';
  queuePosition: number;
  status: 'WAITING' | 'LOADING' | 'READY' | 'DEPARTED';
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  estimatedDeparture?: string;
  enteredAt: string;
}

export interface OvernightQueue {
  id: string;
  vehicleId: string;
  destinationId: string;
  destinationName: string;
  driverLicenseId: string;
  position: number;
  enteredAt: string;
  supervisorId: string;
  supervisorName: string;
  notes?: string;
  status: 'PARKED' | 'READY_FOR_QUEUE';
}

export interface Booking {
  id: string;
  queueId: string;
  customerName: string;
  customerPhone?: string;
  seatsBooked: number;
  totalAmount: number;
  paymentStatus: 'PENDING' | 'PAID';
  verificationCode: string;
  isVerified: boolean;
  createdAt: string;
  createdBy: string;
}

export interface Station {
  id: string;
  name: string;
  governorate: string;
  delegation: string;
  isOnline: boolean;
  basePrice?: number;
  estimatedTravelTime?: string;
  distance?: number;
}

export interface Transaction {
  id: string;
  fromStation: string;
  toStation: string;
  amount: number;
  staffId: string;
  staffName: string;
  bookingId: string;
  customerName: string;
  createdAt: string;
  type: 'BOOKING' | 'VERIFICATION';
}

export interface IncomingVehicle {
  id: string;
  licensePlate: string;
  driverName: string;
  driverPhone: string;
  fromStationId: string;
  fromStationName: string;
  departureTime: string;
  estimatedArrival: string;
  status: 'EN_ROUTE' | 'ARRIVED' | 'DELAYED';
  passengerCount: number;
  capacity: number;
  distance: number;
  lastUpdated: string;
  isNewArrival?: boolean;
}

// Mock current station
export const currentStation: Station = {
  id: 'station-monastir',
  name: 'Monastir Central Station',
  governorate: 'Monastir',
  delegation: 'Monastir',
  isOnline: true,
};

// Mock destination stations
export const mockDestinationStations: Station[] = [
  // Tunis
  {
    id: 'station-tunis-centre',
    name: 'Tunis Centre',
    governorate: 'Tunis',
    delegation: 'Tunis',
    isOnline: true,
    basePrice: 15.0,
    estimatedTravelTime: '2h 30min',
    distance: 160,
  },
  {
    id: 'station-carthage',
    name: 'Carthage Station',
    governorate: 'Tunis',
    delegation: 'Carthage',
    isOnline: true,
    basePrice: 16.0,
    estimatedTravelTime: '2h 45min',
    distance: 170,
  },
  {
    id: 'station-ariana',
    name: 'Ariana Terminal',
    governorate: 'Ariana',
    delegation: 'Ariana Ville',
    isOnline: true,
    basePrice: 17.0,
    estimatedTravelTime: '2h 50min',
    distance: 175,
  },
  
  // Sfax
  {
    id: 'station-sfax-centre',
    name: 'Sfax Centre',
    governorate: 'Sfax',
    delegation: 'Sfax Ville',
    isOnline: true,
    basePrice: 12.0,
    estimatedTravelTime: '1h 45min',
    distance: 120,
  },
  {
    id: 'station-sfax-jadida',
    name: 'Sfax Jadida',
    governorate: 'Sfax',
    delegation: 'Sfax Ouest',
    isOnline: true,
    basePrice: 13.0,
    estimatedTravelTime: '1h 50min',
    distance: 125,
  },
  
  // Sousse
  {
    id: 'station-sousse-centre',
    name: 'Sousse Centre',
    governorate: 'Sousse',
    delegation: 'Sousse Ville',
    isOnline: true,
    basePrice: 8.0,
    estimatedTravelTime: '45min',
    distance: 50,
  },
  {
    id: 'station-port-el-kantaoui',
    name: 'Port El Kantaoui',
    governorate: 'Sousse',
    delegation: 'Hammam Sousse',
    isOnline: true,
    basePrice: 10.0,
    estimatedTravelTime: '1h 10min',
    distance: 65,
  },
  
  // Nabeul
  {
    id: 'station-nabeul',
    name: 'Nabeul Station',
    governorate: 'Nabeul',
    delegation: 'Nabeul',
    isOnline: true,
    basePrice: 18.0,
    estimatedTravelTime: '3h 15min',
    distance: 200,
  },
  {
    id: 'station-hammamet',
    name: 'Hammamet Terminal',
    governorate: 'Nabeul',
    delegation: 'Hammamet',
    isOnline: true,
    basePrice: 20.0,
    estimatedTravelTime: '3h 30min',
    distance: 220,
  },
  
  // Kairouan
  {
    id: 'station-kairouan',
    name: 'Kairouan Central',
    governorate: 'Kairouan',
    delegation: 'Kairouan Sud',
    isOnline: true,
    basePrice: 14.0,
    estimatedTravelTime: '2h 15min',
    distance: 140,
  },
  
  // Bizerte
  {
    id: 'station-bizerte',
    name: 'Bizerte Port',
    governorate: 'Bizerte',
    delegation: 'Bizerte Nord',
    isOnline: true,
    basePrice: 22.0,
    estimatedTravelTime: '4h 00min',
    distance: 280,
  },
  
  // Offline stations
  {
    id: 'station-gabes',
    name: 'Gabès Terminal',
    governorate: 'Gabès',
    delegation: 'Gabès Ville',
    isOnline: false,
    basePrice: 25.0,
    estimatedTravelTime: '4h 30min',
    distance: 320,
  },
];

// Mock staff data
export const mockStaff: Staff[] = [
  {
    id: 'staff-1',
    cin: '12345678',
    firstName: 'Ahmed',
    lastName: 'Ben Ali',
    role: 'SUPERVISOR',
    phoneNumber: '+216 20 123 456',
    isActive: true,
  },
  {
    id: 'staff-2', 
    cin: '87654321',
    firstName: 'Fatma',
    lastName: 'Gharbi',
    role: 'WORKER',
    phoneNumber: '+216 20 987 654',
    isActive: true,
  },
];

// Mock vehicles
export const mockVehicles: Vehicle[] = [
  {
    id: 'vehicle-1',
    licensePlate: 'TN-1234',
    driverId: 'driver-1',
    driverName: 'Mohamed Trabelsi',
    driverCin: '11223344',
    capacity: 12,
    isActive: true,
    assignedDestinationId: 'station-tunis-centre',
    assignedDestinationName: 'Tunis Centre',
  },
  {
    id: 'vehicle-2',
    licensePlate: 'TN-5678', 
    driverId: 'driver-2',
    driverName: 'Salim Hajji',
    driverCin: '55667788',
    capacity: 10,
    isActive: true,
    assignedDestinationId: 'station-sfax-centre',
    assignedDestinationName: 'Sfax Centre',
  },
  {
    id: 'vehicle-3',
    licensePlate: 'TN-9012',
    driverId: 'driver-3', 
    driverName: 'Karim Bouaziz',
    driverCin: '99887766',
    capacity: 8,
    isActive: true,
    assignedDestinationId: 'station-sousse-centre',
    assignedDestinationName: 'Sousse Centre',
  },
];

// Mock vehicle queues (destination-based)
export const mockVehicleQueues: VehicleQueue[] = [
  // Tunis queue
  {
    id: 'queue-1',
    vehicleId: 'vehicle-1',
    destinationId: 'station-tunis-centre',
    destinationName: 'Tunis Centre',
    queueType: 'OVERNIGHT',
    queuePosition: 1,
    status: 'LOADING',
    availableSeats: 3,
    totalSeats: 12,
    basePrice: 15.0,
    estimatedDeparture: '2025-01-15T08:00:00Z',
    enteredAt: '2025-01-14T22:00:00Z',
  },
  {
    id: 'queue-2', 
    vehicleId: 'vehicle-2',
    destinationId: 'station-tunis-centre',
    destinationName: 'Tunis Centre',
    queueType: 'REGULAR',
    queuePosition: 2,
    status: 'WAITING',
    availableSeats: 10,
    totalSeats: 10,
    basePrice: 15.0,
    estimatedDeparture: '2025-01-15T09:00:00Z',
    enteredAt: '2025-01-15T06:30:00Z',
  },
  // Third vehicle for Tunis queue
  {
    id: 'queue-4',
    vehicleId: 'vehicle-3',
    destinationId: 'station-tunis-centre',
    destinationName: 'Tunis Centre',
    queueType: 'REGULAR',
    queuePosition: 3,
    status: 'WAITING',
    availableSeats: 8,
    totalSeats: 8,
    basePrice: 15.0,
    estimatedDeparture: '2025-01-15T10:00:00Z',
    enteredAt: '2025-01-15T07:00:00Z',
  },
  // Sfax queue
  {
    id: 'queue-3',
    vehicleId: 'vehicle-3',
    destinationId: 'station-sfax-centre',
    destinationName: 'Sfax Centre',
    queueType: 'REGULAR',
    queuePosition: 1,
    status: 'WAITING',
    availableSeats: 8,
    totalSeats: 8,
    basePrice: 12.0,
    estimatedDeparture: '2025-01-15T10:00:00Z',
    enteredAt: '2025-01-15T07:00:00Z',
  },
  // Second vehicle for Sfax queue
  {
    id: 'queue-5',
    vehicleId: 'vehicle-1',
    destinationId: 'station-sfax-centre',
    destinationName: 'Sfax Centre',
    queueType: 'OVERNIGHT',
    queuePosition: 2,
    status: 'READY',
    availableSeats: 12,
    totalSeats: 12,
    basePrice: 12.0,
    estimatedDeparture: '2025-01-15T11:00:00Z',
    enteredAt: '2025-01-14T21:00:00Z',
  },
];

// Mock overnight queue
export const mockOvernightQueue: OvernightQueue[] = [
  {
    id: 'overnight-1',
    vehicleId: 'vehicle-1',
    destinationId: 'station-tunis-centre',
    destinationName: 'Tunis Centre',
    driverLicenseId: 'DL123456789',
    position: 1,
    enteredAt: '2025-01-14T22:00:00Z',
    supervisorId: 'staff-1',
    supervisorName: 'Ahmed Ben Ali',
    notes: 'Driver: Mohamed Trabelsi - License held overnight',
    status: 'PARKED'
  },
  {
    id: 'overnight-2',
    vehicleId: 'vehicle-2',
    destinationId: 'station-sfax-centre',
    destinationName: 'Sfax Centre',
    driverLicenseId: 'DL987654321',
    position: 1,
    enteredAt: '2025-01-14T21:30:00Z',
    supervisorId: 'staff-1',
    supervisorName: 'Ahmed Ben Ali',
    notes: 'Driver: Salim Hajji - Early morning departure',
    status: 'PARKED'
  },
  {
    id: 'overnight-3',
    vehicleId: 'vehicle-3',
    destinationId: 'station-tunis-centre',
    destinationName: 'Tunis Centre',
    driverLicenseId: 'DL456789123',
    position: 2,
    enteredAt: '2025-01-14T23:15:00Z',
    supervisorId: 'staff-1',
    supervisorName: 'Ahmed Ben Ali',
    notes: 'Driver: Karim Bouaziz - Reserved for morning',
    status: 'PARKED'
  }
];

// Mock bookings
export const mockBookings: Booking[] = [
  {
    id: 'booking-1',
    queueId: 'queue-1',
    customerName: 'Amira Sassi',
    customerPhone: '+216 25 111 222',
    seatsBooked: 2,
    totalAmount: 30.0,
    paymentStatus: 'PAID',
    verificationCode: 'TN2501A123',
    isVerified: false,
    createdAt: '2025-01-15T07:30:00Z',
    createdBy: 'staff-1',
  },
  {
    id: 'booking-2',
    queueId: 'queue-1', 
    customerName: 'Youssef Mejri',
    customerPhone: '+216 25 333 444',
    seatsBooked: 3,
    totalAmount: 45.0,
    paymentStatus: 'PAID',
    verificationCode: 'TN2501B456',
    isVerified: true,
    createdAt: '2025-01-15T07:45:00Z',
    createdBy: 'staff-2',
  },
  {
    id: 'booking-3',
    queueId: 'queue-2',
    customerName: 'Leila Ben Salem',
    customerPhone: '+216 25 555 666',
    seatsBooked: 1,
    totalAmount: 15.0,
    paymentStatus: 'PENDING',
    verificationCode: 'TN2501C789',
    isVerified: false,
    createdAt: '2025-01-15T08:00:00Z',
    createdBy: 'staff-1',
  },
  {
    id: 'booking-4',
    queueId: 'queue-3',
    customerName: 'Omar Khelifi',
    customerPhone: '+216 25 777 888',
    seatsBooked: 2,
    totalAmount: 24.0,
    paymentStatus: 'PAID',
    verificationCode: 'TN2501D012',
    isVerified: false,
    createdAt: '2025-01-15T08:15:00Z',
    createdBy: 'staff-1',
  },
  {
    id: 'booking-5',
    queueId: 'queue-3',
    customerName: 'Nadia Zouari',
    customerPhone: '+216 25 999 000',
    seatsBooked: 1,
    totalAmount: 12.0,
    paymentStatus: 'PAID',
    verificationCode: 'TN2501E345',
    isVerified: false,
    createdAt: '2025-01-15T08:30:00Z',
    createdBy: 'staff-2',
  },
];

// Helper functions for mock data
export const getVehicleQueuesByDestination = (destination: string): VehicleQueue[] => {
  return mockVehicleQueues
    .filter(q => q.destinationName === destination)
    .sort((a, b) => a.queuePosition - b.queuePosition);
};

export const getBookingsForQueue = (queueId: string): Booking[] => {
  return mockBookings.filter(b => b.queueId === queueId);
};

export const getAvailableDestinations = (): string[] => {
  const destinations = [...new Set(mockVehicleQueues.map(q => q.destinationName))];
  return destinations.sort();
};

export const getVehicleById = (vehicleId: string): Vehicle | undefined => {
  return mockVehicles.find(v => v.id === vehicleId);
};

export const getVehicleByLicensePlate = (licensePlate: string): Vehicle | undefined => {
  return mockVehicles.find(v => v.licensePlate.toLowerCase() === licensePlate.toLowerCase());
};

export const getVehicleByDriverCin = (driverCin: string): Vehicle | undefined => {
  return mockVehicles.find(v => v.driverCin === driverCin);
};

export const findVehicleByIdentifier = (identifier: string): Vehicle | undefined => {
  // Try to find by license plate first
  let vehicle = getVehicleByLicensePlate(identifier);
  if (vehicle) return vehicle;
  
  // Then try by driver CIN
  vehicle = getVehicleByDriverCin(identifier);
  if (vehicle) return vehicle;
  
  return undefined;
};

export const getQueueStats = () => {
  const destinations = getAvailableDestinations();
  return destinations.map(dest => {
    const queues = getVehicleQueuesByDestination(dest);
    const totalSeats = queues.reduce((sum, q) => sum + q.totalSeats, 0);
    const availableSeats = queues.reduce((sum, q) => sum + q.availableSeats, 0);
    const vehicleCount = queues.length;
    
    return {
      destination: dest,
      vehicleCount,
      totalSeats,
      availableSeats,
      occupancyRate: totalSeats > 0 ? ((totalSeats - availableSeats) / totalSeats * 100) : 0,
    };
  });
};

// Helper functions for destination stations
export const getAvailableGovernorates = (): string[] => {
  const governorates = [...new Set(mockDestinationStations.filter(s => s.isOnline).map(s => s.governorate))];
  return governorates.sort();
};

export const getDelegationsByGovernorate = (governorate: string): string[] => {
  const delegations = [...new Set(
    mockDestinationStations
      .filter(s => s.isOnline && s.governorate === governorate)
      .map(s => s.delegation)
  )];
  return delegations.sort();
};

export const getStationsByFilters = (governorate?: string, delegation?: string): Station[] => {
  return mockDestinationStations.filter(station => {
    if (!station.isOnline) return false;
    if (governorate && station.governorate !== governorate) return false;
    if (delegation && station.delegation !== delegation) return false;
    return true;
  });
};

export const getStationById = (stationId: string): Station | undefined => {
  return mockDestinationStations.find(s => s.id === stationId);
};

// Mock transaction history
export const mockTransactions: Transaction[] = [
  {
    id: 'trans-1',
    fromStation: 'Monastir Central Station',
    toStation: 'Tunis Centre',
    amount: 30.0,
    staffId: 'staff-1',
    staffName: 'Ahmed Ben Ali',
    bookingId: 'booking-1',
    customerName: 'Amira Sassi',
    createdAt: '2025-01-15T07:30:00Z',
    type: 'BOOKING'
  },
  {
    id: 'trans-2',
    fromStation: 'Monastir Central Station',
    toStation: 'Tunis Centre',
    amount: 45.0,
    staffId: 'staff-2',
    staffName: 'Fatma Gharbi',
    bookingId: 'booking-2',
    customerName: 'Youssef Mejri',
    createdAt: '2025-01-15T07:45:00Z',
    type: 'BOOKING'
  },
  {
    id: 'trans-3',
    fromStation: 'Monastir Central Station',
    toStation: 'Tunis Centre',
    amount: 15.0,
    staffId: 'staff-1',
    staffName: 'Ahmed Ben Ali',
    bookingId: 'booking-3',
    customerName: 'Leila Ben Salem',
    createdAt: '2025-01-15T08:00:00Z',
    type: 'BOOKING'
  },
  {
    id: 'trans-4',
    fromStation: 'Monastir Central Station',
    toStation: 'Sfax Centre',
    amount: 24.0,
    staffId: 'staff-1',
    staffName: 'Ahmed Ben Ali',
    bookingId: 'booking-4',
    customerName: 'Omar Khelifi',
    createdAt: '2025-01-15T08:15:00Z',
    type: 'BOOKING'
  },
  {
    id: 'trans-5',
    fromStation: 'Monastir Central Station',
    toStation: 'Sfax Centre',
    amount: 12.0,
    staffId: 'staff-2',
    staffName: 'Fatma Gharbi',
    bookingId: 'booking-5',
    customerName: 'Nadia Zouari',
    createdAt: '2025-01-15T08:30:00Z',
    type: 'BOOKING'
  },
  {
    id: 'trans-6',
    fromStation: 'Monastir Central Station',
    toStation: 'Sousse Centre',
    amount: 16.0,
    staffId: 'staff-1',
    staffName: 'Ahmed Ben Ali',
    bookingId: 'booking-6',
    customerName: 'Karim Benali',
    createdAt: '2025-01-14T16:20:00Z',
    type: 'BOOKING'
  },
  {
    id: 'trans-7',
    fromStation: 'Monastir Central Station',
    toStation: 'Nabeul Station',
    amount: 36.0,
    staffId: 'staff-2',
    staffName: 'Fatma Gharbi',
    bookingId: 'booking-7',
    customerName: 'Sarra Hamdi',
    createdAt: '2025-01-14T14:45:00Z',
    type: 'BOOKING'
  },
  {
    id: 'trans-8',
    fromStation: 'Monastir Central Station',
    toStation: 'Kairouan Central',
    amount: 28.0,
    staffId: 'staff-1',
    staffName: 'Ahmed Ben Ali',
    bookingId: 'booking-8',
    customerName: 'Mehdi Jomaa',
    createdAt: '2025-01-14T11:30:00Z',
    type: 'BOOKING'
  }
];

// Helper functions for supervisor dashboard
export const getTodayIncome = (): number => {
  const today = new Date().toISOString().split('T')[0];
  return mockTransactions
    .filter(t => t.createdAt.startsWith(today))
    .reduce((sum, t) => sum + t.amount, 0);
};

export const getMonthIncome = (): number => {
  const currentMonth = new Date().toISOString().substr(0, 7); // YYYY-MM
  return mockTransactions
    .filter(t => t.createdAt.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0);
};

export const getTransactionHistory = (limit?: number): Transaction[] => {
  const sorted = [...mockTransactions].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return limit ? sorted.slice(0, limit) : sorted;
};

export const getStaffTransactions = (staffId: string): Transaction[] => {
  return mockTransactions.filter(t => t.staffId === staffId);
};

// Update queue positions for a specific destination
export const updateQueuePositions = (destination: string, newOrder: string[]): void => {
  console.log(`🔧 updateQueuePositions called for ${destination} with order:`, newOrder);
  
  // Get all queues for this destination before update
  const destinationQueues = mockVehicleQueues.filter(q => q.destinationName === destination);
  console.log(`📊 Before update - ${destination} queues:`, destinationQueues.map(q => ({ id: q.id, position: q.queuePosition })));
  
  // Update positions based on new order
  newOrder.forEach((queueId, index) => {
    const queue = mockVehicleQueues.find(q => q.id === queueId);
    if (queue) {
      const oldPosition = queue.queuePosition;
      queue.queuePosition = index + 1;
      console.log(`📝 Updated queue ${queueId}: position ${oldPosition} → ${index + 1}`);
    }
  });
  
  // Sort queues by position to maintain consistency
  mockVehicleQueues.sort((a, b) => {
    if (a.destinationName !== b.destinationName) {
      return a.destinationName.localeCompare(b.destinationName);
    }
    return a.queuePosition - b.queuePosition;
  });
  
  // Verify the update worked
  const updatedQueues = mockVehicleQueues.filter(q => q.destinationName === destination);
  console.log(`✅ After update - ${destination} queues:`, updatedQueues.map(q => ({ id: q.id, position: q.queuePosition })));
};

// Debug function to get current queue state
export const getDebugQueueState = (): Record<string, any> => {
  const destinations = getAvailableDestinations();
  const state: Record<string, any> = {};
  
  destinations.forEach(dest => {
    const queues = getVehicleQueuesByDestination(dest);
    state[dest] = queues.map(q => ({
      id: q.id,
      vehicleId: q.vehicleId,
      position: q.queuePosition,
      licensePlate: getVehicleById(q.vehicleId)?.licensePlate
    }));
  });
  
  return state;
};

// Overnight queue management functions
export const getOvernightQueueByDestination = (destination: string): OvernightQueue[] => {
  return mockOvernightQueue
    .filter(q => q.destinationName === destination)
    .sort((a, b) => a.position - b.position);
};

export const getAllOvernightQueues = (): OvernightQueue[] => {
  return mockOvernightQueue.sort((a, b) => {
    if (a.destinationName !== b.destinationName) {
      return a.destinationName.localeCompare(b.destinationName);
    }
    return a.position - b.position;
  });
};

export const addToOvernightQueue = (
  vehicleId: string, 
  destinationId: string, 
  destinationName: string, 
  driverLicenseId: string, 
  supervisorId: string, 
  supervisorName: string,
  notes?: string
): string => {
  const existingQueues = getOvernightQueueByDestination(destinationName);
  const newPosition = existingQueues.length + 1;
  
  const newOvernightEntry: OvernightQueue = {
    id: `overnight-${Date.now()}`,
    vehicleId,
    destinationId,
    destinationName,
    driverLicenseId,
    position: newPosition,
    enteredAt: new Date().toISOString(),
    supervisorId,
    supervisorName,
    notes,
    status: 'PARKED'
  };
  
  mockOvernightQueue.push(newOvernightEntry);
  console.log(`✅ Added vehicle to overnight queue: ${newOvernightEntry.id}`);
  return newOvernightEntry.id;
};

// Simplified function to add vehicle by driver CIN only
export const addVehicleByCinToOvernightQueue = (
  driverCin: string,
  supervisorId: string,
  supervisorName: string
): { success: boolean; message: string; id?: string } => {
  // Find vehicle by driver CIN
  const vehicle = getVehicleByDriverCin(driverCin);
  
  if (!vehicle) {
    return { success: false, message: 'Driver CIN not found in our records.' };
  }

  if (!vehicle.assignedDestinationId || !vehicle.assignedDestinationName) {
    return { success: false, message: 'This vehicle does not have an assigned destination route.' };
  }

  // Check if vehicle is already in overnight queue
  const existingQueues = getAllOvernightQueues();
  const alreadyInQueue = existingQueues.find(q => q.vehicleId === vehicle.id);
  if (alreadyInQueue) {
    return { 
      success: false, 
      message: `Vehicle ${vehicle.licensePlate} is already in the overnight queue for ${alreadyInQueue.destinationName}.`
    };
  }

  // Auto-generate license ID based on CIN
  const autoLicenseId = `DL${driverCin}${Date.now().toString().slice(-3)}`;
  
  // Auto-generate notes with driver and vehicle info
  const autoNotes = `Driver: ${vehicle.driverName} | Vehicle: ${vehicle.licensePlate} | Added via CIN: ${driverCin}`;

  const id = addToOvernightQueue(
    vehicle.id,
    vehicle.assignedDestinationId,
    vehicle.assignedDestinationName,
    autoLicenseId,
    supervisorId,
    supervisorName,
    autoNotes
  );

  return { 
    success: true, 
    message: `Successfully added ${vehicle.driverName} (${vehicle.licensePlate}) to ${vehicle.assignedDestinationName} overnight queue.`,
    id 
  };
};

export const removeFromOvernightQueue = (overnightId: string): boolean => {
  const index = mockOvernightQueue.findIndex(q => q.id === overnightId);
  if (index !== -1) {
    const removed = mockOvernightQueue.splice(index, 1)[0];
    // Reorder positions for the same destination
    const sameDestination = mockOvernightQueue.filter(q => q.destinationName === removed.destinationName);
    sameDestination.forEach((queue, idx) => {
      queue.position = idx + 1;
    });
    console.log(`✅ Removed vehicle from overnight queue: ${overnightId}`);
    return true;
  }
  return false;
};

export const updateOvernightQueuePositions = (destination: string, newOrder: string[]): void => {
  console.log(`🔧 updateOvernightQueuePositions called for ${destination} with order:`, newOrder);
  
  newOrder.forEach((queueId, index) => {
    const queue = mockOvernightQueue.find(q => q.id === queueId);
    if (queue) {
      const oldPosition = queue.position;
      queue.position = index + 1;
      console.log(`📝 Updated overnight queue ${queueId}: position ${oldPosition} → ${index + 1}`);
    }
  });
  
  console.log(`✅ Overnight queue positions updated for ${destination}`);
};

export const transferOvernightToRegularQueue = (destination: string): void => {
  const overnightQueues = getOvernightQueueByDestination(destination);
  console.log(`🌅 Transferring ${overnightQueues.length} overnight vehicles to regular queue for ${destination}`);
  
  // Get current regular queues for this destination
  const regularQueues = getVehicleQueuesByDestination(destination);
  let nextPosition = regularQueues.length + 1;
  
  overnightQueues.forEach(overnightQueue => {
    const vehicle = getVehicleById(overnightQueue.vehicleId);
    if (vehicle) {
      const newRegularQueue: VehicleQueue = {
        id: `queue-morning-${Date.now()}-${overnightQueue.vehicleId}`,
        vehicleId: overnightQueue.vehicleId,
        destinationId: overnightQueue.destinationId,
        destinationName: overnightQueue.destinationName,
        queueType: 'OVERNIGHT', // Mark as overnight priority
        queuePosition: nextPosition++,
        status: 'WAITING',
        availableSeats: vehicle.capacity,
        totalSeats: vehicle.capacity,
        basePrice: mockDestinationStations.find(s => s.id === overnightQueue.destinationId)?.basePrice || 15.0,
        estimatedDeparture: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        enteredAt: overnightQueue.enteredAt
      };
      
      mockVehicleQueues.push(newRegularQueue);
      console.log(`➡️ Transferred overnight vehicle ${vehicle.licensePlate} to regular queue at position ${newRegularQueue.queuePosition}`);
    }
  });
  
  // Remove from overnight queue
  overnightQueues.forEach(oq => {
    removeFromOvernightQueue(oq.id);
  });
  
  console.log(`✅ Morning transfer completed for ${destination}`);
};

// Mock incoming vehicles data
export const mockIncomingVehicles: IncomingVehicle[] = [
  {
    id: 'incoming-1',
    licensePlate: 'TN-5678',
    driverName: 'Karim Ben Salah',
    driverPhone: '+216 92 123 456',
    fromStationId: 'station-tunis-centre',
    fromStationName: 'Tunis Centre',
    departureTime: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // left 90 minutes ago
    estimatedArrival: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes from now
    status: 'EN_ROUTE',
    passengerCount: 14,
    capacity: 15,
    distance: 25, // km remaining
    lastUpdated: new Date().toISOString(),
  },
  {
    id: 'incoming-2',
    licensePlate: 'TN-9012',
    driverName: 'Fatma Gharbi',
    driverPhone: '+216 98 765 432',
    fromStationId: 'station-sfax-centre',
    fromStationName: 'Sfax Centre',
    departureTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // left 60 minutes ago
    estimatedArrival: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // 45 minutes from now
    status: 'EN_ROUTE',
    passengerCount: 12,
    capacity: 16,
    distance: 40, // km remaining
    lastUpdated: new Date().toISOString(),
  },
  {
    id: 'incoming-3',
    licensePlate: 'TN-3456',
    driverName: 'Mohamed Trabelsi',
    driverPhone: '+216 95 321 654',
    fromStationId: 'station-sousse-centre',
    fromStationName: 'Sousse Centre',
    departureTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // left 30 minutes ago
    estimatedArrival: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
    status: 'EN_ROUTE',
    passengerCount: 8,
    capacity: 12,
    distance: 12, // km remaining
    lastUpdated: new Date().toISOString(),
  },
  {
    id: 'incoming-4',
    licensePlate: 'TN-7890',
    driverName: 'Amina Bouazizi',
    driverPhone: '+216 93 456 789',
    fromStationId: 'station-nabeul',
    fromStationName: 'Nabeul Station',
    departureTime: new Date(Date.now() - 105 * 60 * 1000).toISOString(), // left 105 minutes ago
    estimatedArrival: new Date(Date.now() + 75 * 60 * 1000).toISOString(), // 75 minutes from now
    status: 'EN_ROUTE',
    passengerCount: 10,
    capacity: 14,
    distance: 85, // km remaining
    lastUpdated: new Date().toISOString(),
  },
  {
    id: 'incoming-5',
    licensePlate: 'TN-1357',
    driverName: 'Salim Khelifi',
    driverPhone: '+216 97 111 222',
    fromStationId: 'station-hammamet',
    fromStationName: 'Hammamet Terminal',
    departureTime: new Date(Date.now() - 55 * 60 * 1000).toISOString(), // left 55 minutes ago
    estimatedArrival: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes from now
    status: 'EN_ROUTE',
    passengerCount: 6,
    capacity: 10,
    distance: 5, // km remaining
    lastUpdated: new Date().toISOString(),
  }
];

// Functions for managing incoming vehicles
export const getIncomingVehicles = (): IncomingVehicle[] => {
  return mockIncomingVehicles
    .sort((a, b) => new Date(a.estimatedArrival).getTime() - new Date(b.estimatedArrival).getTime());
};

export const getIncomingVehiclesByStatus = (status: IncomingVehicle['status']): IncomingVehicle[] => {
  return mockIncomingVehicles.filter(vehicle => vehicle.status === status);
};

export const updateVehicleStatus = (vehicleId: string, status: IncomingVehicle['status']): boolean => {
  const vehicle = mockIncomingVehicles.find(v => v.id === vehicleId);
  if (vehicle) {
    vehicle.status = status;
    vehicle.lastUpdated = new Date().toISOString();
    
    // If vehicle has arrived, mark as new arrival for notifications
    if (status === 'ARRIVED') {
      vehicle.isNewArrival = true;
    }
    
    console.log(`📍 Vehicle ${vehicle.licensePlate} status updated to ${status}`);
    return true;
  }
  return false;
};

export const markVehicleAsArrived = (vehicleId: string): boolean => {
  return updateVehicleStatus(vehicleId, 'ARRIVED');
};

export const clearNewArrivalFlag = (vehicleId: string): boolean => {
  const vehicle = mockIncomingVehicles.find(v => v.id === vehicleId);
  if (vehicle) {
    vehicle.isNewArrival = false;
    return true;
  }
  return false;
};

export const getNewArrivals = (): IncomingVehicle[] => {
  return mockIncomingVehicles.filter(vehicle => vehicle.isNewArrival === true);
};

export const simulateVehicleMovement = (): void => {
  // Simulate vehicle movement by updating distances and arrival times
  mockIncomingVehicles.forEach(vehicle => {
    if (vehicle.status === 'EN_ROUTE') {
      const now = new Date();
      const arrivalTime = new Date(vehicle.estimatedArrival);
      const timeToArrival = arrivalTime.getTime() - now.getTime();
      
      // If vehicle should have arrived, mark as arrived
      if (timeToArrival <= 0) {
        vehicle.status = 'ARRIVED';
        vehicle.isNewArrival = true;
        vehicle.distance = 0;
        vehicle.lastUpdated = now.toISOString();
        console.log(`🚌 Vehicle ${vehicle.licensePlate} has arrived from ${vehicle.fromStationName}!`);
      } else {
        // Update distance based on estimated speed (simulate movement)
        const minutesToArrival = timeToArrival / (1000 * 60);
        const estimatedSpeed = 60; // km/h average
        const newDistance = Math.max(0, Math.round((minutesToArrival / 60) * estimatedSpeed));
        
        if (newDistance !== vehicle.distance) {
          vehicle.distance = newDistance;
          vehicle.lastUpdated = now.toISOString();
        }
      }
    }
  });
};

export const removeArrivedVehicle = (vehicleId: string): boolean => {
  const index = mockIncomingVehicles.findIndex(v => v.id === vehicleId);
  if (index !== -1) {
    const removedVehicle = mockIncomingVehicles.splice(index, 1)[0];
    console.log(`🚌 Removed arrived vehicle ${removedVehicle.licensePlate} from incoming list`);
    return true;
  }
  return false;
}; 