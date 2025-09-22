
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

async function printBookingTicket() {
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
            await printer.printImage("./icons/ste_260.png");
        } catch (logoError) {
            console.log('Logo not found, continuing without logo');
        }

        // Company header
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        
        // Ticket type header
        printer.alignCenter();
        printer.bold(true);
        printer.println("TICKET DE RÉSERVATION");
        printer.bold(false);
        printer.drawLine();
        
        // Content
        const bookingContent = `N° Ticket: IBXICN-7
Station départ: Monastir Main Station
Destination: BEKALTA
Véhicule: 888TUN8884
Position file: #1
Prix de base: 2.000 TND
Frais de service: 0.200 TND
Total: 2.200 TND
Date réservation: 22/09/2025, 02:07:02
`;
        
        // Debug: Log what will be printed
        console.log('🎫 DEBUG: Ticket content that will be printed:');
        console.log('='.repeat(80));
        console.log(bookingContent);
        console.log('='.repeat(80));
        
        printer.alignLeft();
        printer.println(bookingContent);
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci de votre confiance!");
        
        // Staff information in bottom right corner
        printer.alignRight();
        printer.println("Émis par: ivan n3on404");

        printer.cut();
        
        // Debug: Show complete ticket structure
        console.log('🎫 DEBUG: Complete ticket structure:');
        console.log('='.repeat(80));
        console.log('HEADER:');
        console.log('- Logo: STE 260 image');
        console.log('- Company: STE Dhraiff Services Transport');
        console.log('- Title: TICKET DE RÉSERVATION');
        console.log('- Separator line');
        console.log('');
        console.log('CONTENT:');
        console.log(bookingContent);
        console.log('');
        console.log('PRICE BREAKDOWN:');
        console.log('- Base Price: [Shown in ticket content]');
        console.log('- Service Fee: [Shown in ticket content]');
        console.log('- Total: [Shown in ticket content]');
        console.log('');
        console.log('FOOTER:');
        console.log('- Separator line');
        console.log('- Date: ' + new Date().toLocaleString('fr-FR'));
        console.log('- Message: Merci de votre confiance!');
        console.log('- Staff: Émis par: ivan n3on404');
        console.log('- Paper cut');
        console.log('='.repeat(80));
        
        await printer.execute();
        console.log('✅ Booking ticket printed successfully');
        
    } catch (error) {
        console.error('Booking ticket print error:', error.message);
        process.exit(1);
    }
}

printBookingTicket();
