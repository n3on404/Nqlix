import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export interface QueueSummaryDto {
  destinationId: string;
  destinationName: string;
  totalVehicles: number;
  waitingVehicles: number;
  loadingVehicles: number;
  readyVehicles: number;
  governorate?: string | null;
  delegation?: string | null;
}

export interface QueueItemDto {
  id: string;
  destinationId: string;
  destinationName: string;
  queuePosition: number;
  status: 'WAITING' | 'LOADING' | 'READY' | string;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  licensePlate: string;
}

export interface AuthorizedDestinationDto {
  stationId: string;
  stationName: string;
  basePrice: number;
  isDefault: boolean;
  priority: number;
}

export const dbClient = {
  async getQueueSummaries(routeFilter?: string): Promise<QueueSummaryDto[]> {
    return invoke<QueueSummaryDto[]>('db_get_queue_summaries', { routeFilter });
  },

  async getQueueByDestination(destinationId: string): Promise<QueueItemDto[]> {
    return invoke<QueueItemDto[]>('db_get_queue_by_destination', { destinationId });
  },

  async getVehicleAuthorizedDestinations(licensePlate: string): Promise<AuthorizedDestinationDto[]> {
    return invoke<AuthorizedDestinationDto[]>('db_get_vehicle_authorized_destinations', { licensePlate });
  },

  async enterQueueWithDestination(licensePlate: string, destinationId: string, destinationName?: string, staffId?: string) {
    return invoke<string>('db_enter_queue', { licensePlate, destinationId, destinationName, staffId });
  },

  async exitQueue(licensePlate: string) {
    return invoke<number>('db_exit_queue', { licensePlate });
  },

  async updateVehicleStatus(licensePlate: string, status: string) {
    return invoke<number>('db_update_vehicle_status', { licensePlate, status });
  },

  // Booking flows
  async getAvailableBookingDestinations(filters?: { governorate?: string; delegation?: string; routeFilter?: string }) {
    return invoke<any>('db_get_available_booking_destinations', {
      governorate: filters?.governorate,
      delegation: filters?.delegation,
      routeFilter: filters?.routeFilter,
    });
  },

  async getAvailableSeatsForDestination(destinationId: string) {
    return invoke<any>('db_get_available_seats_for_destination', { destinationId });
  },

  async createQueueBooking(destinationId: string, seatsRequested: number, createdBy?: string) {
    return invoke<any>('db_create_queue_booking', { destinationId, seatsRequested, createdBy });
  },

  async createVehicleSpecificBooking(queueId: string, seatsRequested: number, createdBy?: string) {
    return invoke<any>('db_create_vehicle_specific_booking', { queueId, seatsRequested, createdBy });
  },

  async cancelQueueBooking(bookingId: string) {
    return invoke<void>('db_cancel_queue_booking', { bookingId });
  },

  async cancelSeatFromDestination(destinationId: string, createdBy?: string) {
    return invoke<string>('db_cancel_seat_from_destination', { destinationId, createdBy });
  },

  async health(): Promise<boolean> {
    return invoke<boolean>('db_health');
  },

  async hasDayPassToday(licensePlate: string): Promise<boolean> {
    return invoke<boolean>('db_has_day_pass_today', { licensePlate });
  },

  async hasDayPassTodayBatch(licensePlates: string[]): Promise<Record<string, boolean>> {
    return invoke<Record<string, boolean>>('db_has_day_pass_today_batch', { licensePlates });
  },

  // Pass Journalier dashboard
  async getTodayDayPasses() {
    return invoke<any>('db_get_today_day_passes');
  },

  async getTodayExitPasses() {
    return invoke<any>('db_get_today_exit_passes');
  },

  async getRecentExitPasses() {
    return invoke<any>('db_get_recent_exit_passes');
  },

  async getQueuedWithoutDayPass() {
    return invoke<any>('db_get_queued_without_day_pass');
  },

  // End trip with partial capacity
  async endTripWithPartialCapacity(queueId: string, createdBy?: string) {
    return invoke<string>('db_end_trip_with_partial_capacity', { queueId, createdBy });
  },

  // Queue management
  async updateQueuePositions(destinationId: string, vehiclePositions: Array<{queueId: string, position: number}>) {
    const positions = vehiclePositions.map(vp => [vp.queueId, vp.position] as [string, number]);
    return invoke<string>('db_update_queue_positions', { destinationId, vehiclePositions: positions });
  },

  async moveVehicleToFront(queueId: string, destinationId: string) {
    return invoke<string>('db_move_vehicle_to_front', { queueId, destinationId });
  },

  // Enhanced queue management methods
  async getAllVehicles() {
    return invoke<VehicleDto[]>('db_get_all_vehicles');
  },

  async getAvailableDestinations(routeFilter?: string) {
    return invoke<DestinationDto[]>('db_get_available_destinations', { routeFilter });
  },

  async getStationsByGovernorate(governorate: string) {
    return invoke<DestinationDto[]>('db_get_stations_by_governorate', { governorate });
  },

  async addVehicleToQueue(licensePlate: string, destinationId: string, destinationName?: string) {
    return invoke<string>('db_add_vehicle_to_queue', { licensePlate, destinationId, destinationName });
  },

  async removeVehicleFromQueue(licensePlate: string) {
    return invoke<string>('db_remove_vehicle_from_queue', { licensePlate });
  },

  async updateQueuePosition(queueId: string, newPosition: number) {
    return invoke<string>('db_update_queue_position', { queueId, newPosition });
  },

  async getVehicleQueueStatus(licensePlate: string) {
    return invoke<VehicleQueueStatusDto | null>('db_get_vehicle_queue_status', { licensePlate });
  },

  // Day pass operations
  async purchaseDayPass(licensePlate: string, vehicleId: string, price: number, createdBy?: string) {
    return invoke<string>('db_purchase_day_pass', { licensePlate, vehicleId, price, createdBy });
  },

  async getDayPassPrice() {
    return invoke<number>('db_get_day_pass_price');
  },

  // Vehicle management functions
  async createVehicle(licensePlate: string, capacity: number, phoneNumber?: string) {
    return invoke<string>('db_create_vehicle', { licensePlate, capacity, phoneNumber });
  },
  async updateVehiclePhone(vehicleId: string, phoneNumber?: string) {
    return invoke<string>('db_update_vehicle_phone', { vehicleId, phoneNumber });
  },
  async getVehicleActivity72h(licensePlate: string) {
    return invoke<Array<{eventType: string; timestamp: string; destinationName?: string}>>('db_get_vehicle_activity_72h', { licensePlate });
  },

  async authorizeVehicleStation(vehicleId: string, stationId: string, stationName: string) {
    return invoke<string>('db_authorize_vehicle_station', { vehicleId, stationId, stationName });
  },

  async banVehicle(vehicleId: string) {
    return invoke<string>('db_ban_vehicle', { vehicleId });
  },

  // Report functions
  async getVehicleDailyReport(vehicleId: string, date: string) {
    return invoke<VehicleDailyReport>('db_get_vehicle_daily_report', { vehicleId, date });
  },

  async getAllVehiclesDailyReport(date: string) {
    return invoke<AllVehiclesDailyReport>('db_get_all_vehicles_daily_report', { date });
  },

  // Add new method for transferring seats and removing vehicle
  async transferSeatsAndRemoveVehicle(licensePlate: string, destinationId: string) {
    return invoke<string>('db_transfer_seats_and_remove_vehicle', { licensePlate, destinationId });
  },

  // Emergency remove vehicle with booked seats (cancel all bookings)
  async emergencyRemoveVehicle(licensePlate: string) {
    return invoke<{cancelledBookings: number, totalRefund: number, message: string}>('db_emergency_remove_vehicle', { licensePlate });
  },

  // Check if vehicle has a recently purchased day pass (within last 10 minutes)
  async hasRecentlyPurchasedDayPass(licensePlate: string) {
    return invoke<boolean>('db_has_recently_purchased_day_pass', { licensePlate });
  },

  // Print day pass for vehicle in queue
  async printDayPassForVehicle(licensePlate: string) {
    return invoke<string>('db_print_day_pass_for_vehicle', { licensePlate });
  },

  // Realtime functionality
  async startRealtimeListening() {
    return invoke<void>('start_realtime_listening');
  },

  async stopRealtimeListening() {
    return invoke<void>('stop_realtime_listening');
  },

  async getRealtimeStatus() {
    return invoke<boolean>('get_realtime_status');
  },

  // Event listeners
  onRealtimeEvent(callback: (event: RealtimeEvent) => void) {
    return listen<RealtimeEvent>('realtime-event', (event) => {
      callback(event.payload);
    });
  },

  onBookingUpdate(callback: (event: BookingUpdateEvent) => void) {
    return listen<BookingUpdateEvent>('booking-update', (event) => {
      callback(event.payload);
    });
  },

  onQueueUpdate(callback: (event: QueueUpdateEvent) => void) {
    return listen<QueueUpdateEvent>('queue-update', (event) => {
      callback(event.payload);
    });
  }
};

// Report interfaces
export interface VehicleInfo {
  id: string;
  licensePlate: string;
  capacity: number;
  isActive: boolean;
  isAvailable: boolean;
  isBanned: boolean;
}

export interface TripInfo {
  id: string;
  destinationId: string;
  destinationName: string;
  queuePosition: number;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  enteredAt: string;
  createdAt: string;
}

export interface DestinationSummary {
  destinationName: string;
  tripCount: number;
  totalSeatsSold: number;
  totalIncome: number;
}

export interface VehicleDailyReport {
  vehicle: VehicleInfo;
  date: string;
  trips: TripInfo[];
  totalTrips: number;
  totalIncome: number;
  totalSeatsSold: number;
  destinations: DestinationSummary[];
}

export interface VehicleReport {
  vehicle: VehicleInfo;
  totalTrips: number;
  totalIncome: number;
  totalSeatsSold: number;
  trips: TripInfo[];
}

export interface AllVehiclesDailyReport {
  date: string;
  vehicles: VehicleReport[];
  totalVehicles: number;
  totalTrips: number;
  totalIncome: number;
  totalSeatsSold: number;
}

// New TypeScript interfaces for the enhanced queue management
export interface VehicleDto {
  id: string;
  licensePlate: string;
  capacity: number;
  isActive: boolean;
  isAvailable: boolean;
  isBanned: boolean;
  phoneNumber?: string | null;
  defaultDestinationId?: string;
  defaultDestinationName?: string;
  createdAt?: string;
}

export interface DestinationDto {
  stationId: string;
  stationName: string;
  basePrice: number;
  governorate?: string;
  delegation?: string;
}

export interface VehicleQueueStatusDto {
  id: string;
  vehicleId: string;
  licensePlate: string;
  destinationId: string;
  destinationName: string;
  queuePosition: number;
  status: string;
  availableSeats: number;
  totalSeats: number;
  basePrice: number;
  enteredAt: string;
}

// Realtime event interfaces
export interface RealtimeEvent {
  event_type: string;
  table: string;
  id: string;
  timestamp: string;
  data?: any;
}

export interface BookingUpdateEvent {
  event_type: string;
  destination_id: string;
  destination_name: string;
  available_seats: number;
  total_seats: number;
  vehicle_count: number;
  timestamp: string;
}

export interface QueueUpdateEvent {
  event_type: string;
  destination_id: string;
  destination_name: string;
  queue_changes: QueueChange[];
  timestamp: string;
}

export interface QueueChange {
  license_plate: string;
  status: string;
  available_seats: number;
  queue_position: number;
}

