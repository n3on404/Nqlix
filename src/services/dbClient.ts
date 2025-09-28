import { invoke } from '@tauri-apps/api/tauri';

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
  async getQueueSummaries(): Promise<QueueSummaryDto[]> {
    return invoke<QueueSummaryDto[]>('db_get_queue_summaries');
  },

  async getQueueByDestination(destinationId: string): Promise<QueueItemDto[]> {
    return invoke<QueueItemDto[]>('db_get_queue_by_destination', { destinationId });
  },

  async getVehicleAuthorizedDestinations(licensePlate: string): Promise<AuthorizedDestinationDto[]> {
    return invoke<AuthorizedDestinationDto[]>('db_get_vehicle_authorized_destinations', { licensePlate });
  },

  async enterQueueWithDestination(licensePlate: string, destinationId: string, destinationName?: string) {
    return invoke<string>('db_enter_queue', { licensePlate, destinationId, destinationName });
  },

  async exitQueue(licensePlate: string) {
    return invoke<number>('db_exit_queue', { licensePlate });
  },

  async updateVehicleStatus(licensePlate: string, status: string) {
    return invoke<number>('db_update_vehicle_status', { licensePlate, status });
  },

  // Booking flows
  async getAvailableBookingDestinations(filters?: { governorate?: string; delegation?: string }) {
    return invoke<any>('db_get_available_booking_destinations', {
      governorate: filters?.governorate,
      delegation: filters?.delegation,
    });
  },

  async getAvailableSeatsForDestination(destinationId: string) {
    return invoke<any>('db_get_available_seats_for_destination', { destinationId });
  },

  async createQueueBooking(destinationId: string, seatsRequested: number, createdBy?: string) {
    return invoke<any>('db_create_queue_booking', { destinationId, seatsRequested, createdBy });
  },

  async cancelQueueBooking(bookingId: string) {
    return invoke<void>('db_cancel_queue_booking', { bookingId });
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

  async getAvailableDestinations() {
    return invoke<DestinationDto[]>('db_get_available_destinations');
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
};

// New TypeScript interfaces for the enhanced queue management
export interface VehicleDto {
  id: string;
  licensePlate: string;
  capacity: number;
  isActive: boolean;
  isAvailable: boolean;
  isBanned: boolean;
  defaultDestinationId?: string;
  defaultDestinationName?: string;
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

