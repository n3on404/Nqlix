const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

async function testLogo() {
    try {
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            width: 48,
            interface: 'tcp://192.168.0.100:9100',
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

        console.log('Testing logo printing...');
        
        // Try to print a simple test
        printer.alignCenter();
        printer.println('LOGO TEST');
        printer.drawLine();
        
        // Try to print logo
        try {
            await printer.printImage('./src-tauri/icons/logo_ste_mono.png');
            console.log('Logo printed successfully');
        } catch (logoError) {
            console.log('Logo failed:', logoError.message);
        }
        
        printer.cut();
        await printer.execute();
        console.log('Test completed');
        
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testLogo();
