
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

async function printTicket() {
    try {
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            width: 48,
            interface: 'tcp://192.168.192.12:9100',
            characterSet: CharacterSet.PC852_LATIN2,
            removeSpecialCharacters: false,
            lineCharacter: "=",
            breakLine: BreakLine.WORD,
            options: {
                timeout: 5000
            }
        });

        // Test connection
        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            throw new Error('Printer not connected');
        }

        // Configure printer based on job settings
        printer.alignCenter();
        printer.bold(true);
        printer.setTextNormal();
        
        
        // Print content
        printer.println("CONNECTION TEST");
        
        
        
        // Execute print job
        await printer.execute();
        console.log('Print job completed successfully');
        
    } catch (error) {
        console.error('Print error:', error.message);
        process.exit(1);
    }
}

printTicket();
