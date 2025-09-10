// Mock data for incoming vehicles
export interface IncomingVehicle {
  id: string;
  licensePlate: string;
  destination: string;
  fromStationName: string;
  status: 'EN_ROUTE' | 'ARRIVED' | 'DEPARTED';
  estimatedArrival: string;
  departureTime: string;
  currentLocation: string;
  driverName: string;
  driverPhone: string;
  totalSeats: number;
  availableSeats: number;
  lastUpdate: string;
  isNewArrival?: boolean;
}

export const getIncomingVehicles = (): IncomingVehicle[] => [
  {
    id: '1',
    licensePlate: '123-TUN-456',
    destination: 'Tunis',
    fromStationName: 'Sousse',
    status: 'EN_ROUTE',
    estimatedArrival: '2024-01-15T10:30:00Z',
    departureTime: '2024-01-15T09:00:00Z',
    currentLocation: 'Sousse',
    driverName: 'Ahmed Ben Ali',
    driverPhone: '+216 71 123 456',
    totalSeats: 15,
    availableSeats: 8,
    lastUpdate: '2024-01-15T09:45:00Z',
    isNewArrival: false
  },
  {
    id: '2',
    licensePlate: '789-TUN-012',
    destination: 'Sfax',
    fromStationName: 'Monastir',
    status: 'EN_ROUTE',
    estimatedArrival: '2024-01-15T11:15:00Z',
    departureTime: '2024-01-15T09:30:00Z',
    currentLocation: 'Monastir',
    driverName: 'Fatma Mansouri',
    driverPhone: '+216 73 456 789',
    totalSeats: 12,
    availableSeats: 3,
    lastUpdate: '2024-01-15T10:00:00Z',
    isNewArrival: false
  },
  {
    id: '3',
    licensePlate: '345-TUN-678',
    destination: 'Gabès',
    fromStationName: 'Sousse',
    status: 'ARRIVED',
    estimatedArrival: '2024-01-15T09:30:00Z',
    departureTime: '2024-01-15T08:00:00Z',
    currentLocation: 'Station',
    driverName: 'Mohamed Karray',
    driverPhone: '+216 75 789 012',
    totalSeats: 18,
    availableSeats: 0,
    lastUpdate: '2024-01-15T09:30:00Z',
    isNewArrival: false
  },
  {
    id: '4',
    licensePlate: '901-TUN-234',
    destination: 'Gafsa',
    fromStationName: 'Kairouan',
    status: 'EN_ROUTE',
    estimatedArrival: '2024-01-15T12:00:00Z',
    departureTime: '2024-01-15T10:00:00Z',
    currentLocation: 'Kairouan',
    driverName: 'Samira Trabelsi',
    driverPhone: '+216 77 012 345',
    totalSeats: 14,
    availableSeats: 6,
    lastUpdate: '2024-01-15T10:30:00Z',
    isNewArrival: false
  },
  {
    id: '5',
    licensePlate: '567-TUN-890',
    destination: 'Tozeur',
    fromStationName: 'Kasserine',
    status: 'EN_ROUTE',
    estimatedArrival: '2024-01-15T13:45:00Z',
    departureTime: '2024-01-15T11:00:00Z',
    currentLocation: 'Kasserine',
    driverName: 'Hassan Ben Salem',
    driverPhone: '+216 78 345 678',
    totalSeats: 16,
    availableSeats: 11,
    lastUpdate: '2024-01-15T11:15:00Z',
    isNewArrival: false
  }
];

export const updateVehicleStatus = (vehicleId: string, status: IncomingVehicle['status']): IncomingVehicle[] => {
  return getIncomingVehicles().map(vehicle => 
    vehicle.id === vehicleId ? { ...vehicle, status } : vehicle
  );
};

// Simulate vehicle movement
export const simulateVehicleMovement = (): void => {
  // This would typically update vehicle positions and arrival times
  console.log('Simulating vehicle movement...');
};

// Remove arrived vehicle
export const removeArrivedVehicle = (vehicleId: string): void => {
  console.log(`Removing arrived vehicle: ${vehicleId}`);
}; 