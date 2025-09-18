// Test script to verify Tauri commands are working
// This should be run from within the Tauri app context

console.log('🧪 Testing Tauri print_booking_ticket command...');

// Mock booking data similar to what would come from the API
const mockBookingData = {
  verificationCode: 'TEST-123',
  customerName: 'Ahmed Ben Ali',
  startStationName: 'Tunis Central',
  destinationName: 'Sfax',
  vehicleLicensePlate: '123-456-TN',
  seatsBooked: 2,
  seatNumber: 'A12, A13',
  totalAmount: 25.500,
  bookingTime: new Date().toISOString()
};

// Format the data like the service would
let ticketContent = '';

if (mockBookingData.verificationCode || mockBookingData.ticketId || mockBookingData.id) {
  ticketContent += `N° Ticket: ${mockBookingData.verificationCode || mockBookingData.ticketId || mockBookingData.id}\n`;
}

if (mockBookingData.customerName) {
  ticketContent += `Passager: ${mockBookingData.customerName}\n`;
}

if (mockBookingData.startStationName) {
  ticketContent += `Station départ: ${mockBookingData.startStationName}\n`;
}

if (mockBookingData.destinationName) {
  ticketContent += `Destination: ${mockBookingData.destinationName}\n`;
}

if (mockBookingData.vehicleLicensePlate) {
  ticketContent += `Véhicule: ${mockBookingData.vehicleLicensePlate}\n`;
}

if (mockBookingData.seatsBooked || mockBookingData.seats) {
  ticketContent += `Places: ${mockBookingData.seatsBooked || mockBookingData.seats}\n`;
}

if (mockBookingData.seatNumber) {
  ticketContent += `Siège: ${mockBookingData.seatNumber}\n`;
}

if (mockBookingData.totalAmount || (mockBookingData.basePrice && mockBookingData.seatsBooked)) {
  const amount = mockBookingData.totalAmount || (mockBookingData.basePrice * (mockBookingData.seatsBooked || 1));
  ticketContent += `Prix: ${amount} TND\n`;
}

if (mockBookingData.bookingTime || mockBookingData.createdAt) {
  const date = new Date(mockBookingData.bookingTime || mockBookingData.createdAt);
  ticketContent += `Date réservation: ${date.toLocaleString('fr-FR')}\n`;
}

console.log('📄 Formatted ticket content:');
console.log(ticketContent);

console.log('✅ Test data prepared. This should be called from within the Tauri app context.');
console.log('🔧 To test: Open browser console in the Tauri app and run:');
console.log('   thermalPrinter.printBookingTicket(`' + ticketContent.replace(/\n/g, '\\n') + '`)');