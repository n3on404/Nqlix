import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';

async function testStandardTicket() {
    try {
        console.log('🔧 Initializing printer for standard ticket...');
        
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            width: 48,
            interface: 'tcp://192.168.192.168:9100', // Your printer's IP
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {
                timeout: 5000
            }
        });

        console.log('🔍 Testing connection...');
        const isConnected = await printer.isPrinterConnected();
        
        if (!isConnected) {
            throw new Error('❌ Printer not connected. Please check:');
        }
        
        console.log('✅ Printer connected successfully!');
        
        console.log('🖨️  Printing standard STE ticket...');
        
        // Print logo centered at the top
        printer.alignCenter();
        try {
            await printer.printImage("./public/logo.png");
            console.log('✅ Logo printed successfully (centered)');
        } catch (logoError) {
            console.log('⚠️  Logo not found, continuing without logo');
        }

        // Company header
        printer.alignCenter();
        printer.bold(true);
        printer.setTextDoubleHeight();
        printer.println("STE Dhraiff Services Transport");
        printer.setTextNormal();
        printer.bold(false);
        printer.drawLine();
        
        // Sample ticket content
        printer.alignLeft();
        printer.println("N° Ticket: STE-001");
        printer.println("Passager: Ahmed Ben Ali");
        printer.println("Trajet: Tunis - Sfax");
        printer.println("Départ: 14:30");
        printer.println("Siège: A12");
        printer.println("Prix: 25.500 TND");
        printer.println("");
        printer.println("Merci de votre confiance!");
        
        // Footer
        printer.drawLine();
        printer.alignCenter();
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("STE Dhraiff Services Transport");
        printer.cut();
        
        console.log('📄 Executing print job...');
        await printer.execute();
        
        console.log('✅ Standard ticket printed successfully!');
        
    } catch (error) {
        console.error('❌ Standard ticket print failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check if the printer IP address is correct');
        console.log('2. Ensure the printer is connected to the network');
        console.log('3. Verify the printer is powered on');
        console.log('4. Check if port 9100 is accessible');
        console.log('5. Try pinging the printer: ping 192.168.192.168');
        process.exit(1);
    }
}

// Run the test
testStandardTicket();