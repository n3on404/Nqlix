import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';

async function testPrinter() {
    try {
        console.log('🔧 Initializing printer...');
        
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            width: 48,
            interface: 'tcp://192.168.192.168:9100', // Change this to your printer's IP
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
        
        console.log('🖨️  Printing test content...');
        
        // Test basic printing
        printer.alignCenter();
        printer.bold(true);
        printer.println("LOUAJ TRANSPORT");
        printer.bold(false);
        printer.drawLine();
        printer.alignLeft();
        printer.println("Test d'impression");
        printer.println("Date: " + new Date().toLocaleString('fr-FR'));
        printer.println("Imprimante: Epson TM-T20X");
        printer.drawLine();
        
        // Test QR Code
        printer.alignCenter();
        printer.printQR("https://louaj.tn", {
            cellSize: 3,
            correction: 'M',
            model: 2
        });
        
        // Test Barcode
        printer.printBarcode("1234567890", 73, {
            hriPos: 2,
            hriFont: 0,
            width: 3,
            height: 168
        });
        
        printer.cut();
        
        console.log('📄 Executing print job...');
        await printer.execute();
        
        console.log('✅ Print job completed successfully!');
        
    } catch (error) {
        console.error('❌ Print test failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check if the printer IP address is correct');
        console.log('2. Ensure the printer is connected to the network');
        console.log('3. Verify the printer is powered on');
        console.log('4. Check if port 9100 is accessible');
        console.log('5. Try pinging the printer: ping 192.168.1.100');
        process.exit(1);
    }
}

// Run the test
testPrinter();