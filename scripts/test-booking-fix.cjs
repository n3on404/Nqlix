const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

async function testBookingTicket() {
    try {
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            width: 48,
            interface: 'tcp://192.168.192.168:9100',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {
                timeout: 5000
            }
        });

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            throw new Error('Printer not connected');
        }

        // Print logo centered at the top
        printer.alignCenter();
        try {
            await printer.printImage("./public/logo.png");
        } catch (logoError) {
            console.log('Logo not found, continuing without logo');
        }

        // Company header
        printer.alignCenter();
        printer.bold(true);
        printer.setTextDoubleHeight();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        
        // Ticket type header
        printer.alignCenter();
        printer.bold(true);
        printer.println("TICKET DE RÉSERVATION / تذكرة الحجز");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        printer.alignLeft();
        printer.println(`N° Ticket: TEST123
Station départ: Monastir Main Station
Destination: Tunis Main Station
Véhicule: TN-3456-012
Places: 1
Position file: #1
Prix: 50 TND
Type: CASH
Date réservation: 16/09/2025, 05:24:36`);
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci de votre confiance! / شكرا لثقتكم!");
        printer.cut();
        
        await printer.execute();
        console.log('✅ Test booking ticket printed successfully');
        
    } catch (error) {
        console.error('❌ Test booking ticket print error:', error.message);
        process.exit(1);
    }
}

testBookingTicket();