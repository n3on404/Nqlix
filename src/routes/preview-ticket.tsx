import { useState } from "react";
import { TicketPrintout } from "../components/TicketPrintout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

// Example booking data for preview
const exampleBooking = {
  ticketId: "123456",
  customerName: "John Doe",
  startStationName: "Tunis",
  destinationName: "Sousse",
  vehicleLicensePlate: "123 TU 4567",
  seatsBooked: 1,
  seatNumber: "A1",
  totalAmount: 12.5,
  verificationCode: "ABCDEF",
  bookingTime: new Date().toISOString(),
  qrCodeData: "ABCDEF"
};

export default function PreviewTicket() {
  const [booking] = useState(exampleBooking);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <Card className="max-w-md w-full p-6">
        <h1 className="text-xl font-bold mb-4 text-center">Aperçu du Ticket</h1>
        <div className="mb-4">
          <TicketPrintout booking={booking} />
        </div>
        <Button onClick={() => window.print()} className="w-full mt-2">
          Imprimer cette page
        </Button>
      </Card>
    </div>
  );
}
