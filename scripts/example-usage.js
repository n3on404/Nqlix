import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';

async function exampleUsage() {
    try {
        console.log('🚀 STE Dhraiff Services Transport - Example Usage');
        
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

        console.log('✅ Printer connected!');

        // Example 1: Simple standard ticket
        console.log('\n📄 Example 1: Simple Standard Ticket');
        printer.clear();
        
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
        printer.setTextNormal();
        printer.bold(false);
        printer.drawLine();
        
        // Content
        printer.alignLeft();
        printer.println("N° Ticket: STE-001");
        printer.println("Passager: Ahmed Ben Ali");
        printer.println("Trajet: Tunis - Sfax");
        printer.println("Départ: 14:30");
        printer.println("Siège: A12");
        printer.println("Prix: 25.500 TND");
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci de votre confiance!");
        printer.cut();
        
        await printer.execute();
        console.log('✅ Example 1 printed successfully!');

        // Example 2: Receipt with QR code
        console.log('\n📄 Example 2: Receipt with QR Code');
        printer.clear();
        
        // Print logo centered at the top
        printer.alignCenter();
        try {
            await printer.printImage("./public/logo.png");
        } catch (logoError) {
            console.log('Logo not found, continuing without logo');
        }

        // Header
        printer.alignCenter();
        printer.bold(true);
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        
        // Receipt content
        printer.alignLeft();
        printer.println("REÇU DE PAIEMENT");
        printer.println("N°: RCP-001");
        printer.println("Montant: 25.500 TND");
        printer.println("Méthode: Espèces");
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        
        // QR Code
        printer.alignCenter();
        printer.printQR("https://ste-dhraiff.tn/ticket/STE-001", {
            cellSize: 3,
            correction: 'M',
            model: 2
        });
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Merci!");
        printer.cut();
        
        await printer.execute();
        console.log('✅ Example 2 printed successfully!');

        // Example 3: Barcode ticket
        console.log('\n📄 Example 3: Barcode Ticket');
        printer.clear();
        
        // Print logo centered at the top
        printer.alignCenter();
        try {
            await printer.printImage("./public/logo.png");
        } catch (logoError) {
            console.log('Logo not found, continuing without logo');
        }

        // Header
        printer.alignCenter();
        printer.bold(true);
        printer.println("STE Dhraiff Services Transport");
        printer.bold(false);
        printer.drawLine();
        
        // Ticket content
        printer.alignLeft();
        printer.println("TICKET DE RÉSERVATION");
        printer.println("N°: STE-002");
        printer.println("Passager: Fatma Ben Salem");
        printer.println("Trajet: Sfax - Monastir");
        printer.println("Départ: 16:45");
        printer.println("Prix: 18.000 TND");
        
        // Barcode
        printer.alignCenter();
        printer.printBarcode("STE002", 73, {
            hriPos: 2,
            hriFont: 0,
            width: 3,
            height: 168
        });
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Merci de votre confiance!");
        printer.cut();
        
        await printer.execute();
        console.log('✅ Example 3 printed successfully!');

        console.log('\n🎉 All examples printed successfully!');
        
    } catch (error) {
        console.error('❌ Example failed:', error.message);
        process.exit(1);
    }
}

// Run the examples
exampleUsage();