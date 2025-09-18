import { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } from 'node-thermal-printer';

async function testAllTickets() {
  console.log('🔧 Testing all 3 ticket types...');
  
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

    console.log('🔍 Testing connection...');
    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      throw new Error('Printer not connected');
    }
    console.log('✅ Printer connected successfully!');

    // Test 1: Booking Ticket
    console.log('\n🎫 Testing Booking Ticket...');
    printer.alignCenter();
    try {
      await printer.printImage("./public/logo.png");
      console.log('✅ Logo printed successfully');
    } catch (logoError) {
      console.log('⚠️  Logo not found, continuing without logo');
    }

    printer.alignCenter();
    printer.bold(true);
    printer.setTextDoubleHeight();
    printer.println("STE Dhraiff Services Transport");
    printer.bold(false);
    printer.drawLine();
    
    printer.alignCenter();
    printer.bold(true);
    printer.println("TICKET DE RÉSERVATION / تذكرة الحجز");
    printer.bold(false);
    printer.drawLine();
    
    printer.alignLeft();
    printer.println("N° Ticket: BK-001");
    printer.println("Passager: Ahmed Ben Ali");
    printer.println("Station départ: Tunis Central");
    printer.println("Destination: Sfax");
    printer.println("Véhicule: 123-456-TN");
    printer.println("Places: 2");
    printer.println("Siège: A12, A13");
    printer.println("Prix: 25.500 TND");
    printer.println("Date réservation: 16/09/2025 14:30");
    
    printer.drawLine();
    printer.alignCenter();
    printer.println("Date: " + new Date().toLocaleString('fr-FR'));
    printer.println("Merci de votre confiance! / شكرا لثقتكم!");
    printer.cut();

    await printer.execute();
    console.log('✅ Booking ticket printed successfully!');

    // Wait a moment between tickets
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Entry Ticket
    console.log('\n🚪 Testing Entry Ticket...');
    printer.alignCenter();
    try {
      await printer.printImage("./public/logo.png");
    } catch (logoError) {
      console.log('⚠️  Logo not found, continuing without logo');
    }

    printer.alignCenter();
    printer.bold(true);
    printer.setTextDoubleHeight();
    printer.println("STE Dhraiff Services Transport");
    printer.bold(false);
    printer.drawLine();
    
    printer.alignCenter();
    printer.bold(true);
    printer.println("TICKET D'ENTRÉE / تذكرة الدخول");
    printer.bold(false);
    printer.drawLine();
    
    printer.alignLeft();
    printer.println("N° Ticket: EN-001");
    printer.println("Véhicule: 789-012-TN");
    printer.println("Station: Tunis Central");
    printer.println("Destination: Sfax");
    printer.println("Position file: #3");
    printer.println("Véhicule suivant: 345-678-TN");
    printer.println("Frais d'entrée: 2.000 TND");
    printer.println("Heure d'entrée: 16/09/2025 14:30");
    
    printer.drawLine();
    printer.alignCenter();
    printer.println("Date: " + new Date().toLocaleString('fr-FR'));
    printer.println("Bon voyage! / رحلة سعيدة!");
    printer.cut();

    await printer.execute();
    console.log('✅ Entry ticket printed successfully!');

    // Wait a moment between tickets
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Exit Ticket
    console.log('\n🚪 Testing Exit Ticket...');
    printer.alignCenter();
    try {
      await printer.printImage("./public/logo.png");
    } catch (logoError) {
      console.log('⚠️  Logo not found, continuing without logo');
    }

    printer.alignCenter();
    printer.bold(true);
    printer.setTextDoubleHeight();
    printer.println("STE Dhraiff Services Transport");
    printer.bold(false);
    printer.drawLine();
    
    printer.alignCenter();
    printer.bold(true);
    printer.println("TICKET DE SORTIE / تذكرة الخروج");
    printer.bold(false);
    printer.drawLine();
    
    printer.alignLeft();
    printer.println("N° Ticket: EX-001");
    printer.println("Véhicule: 789-012-TN");
    printer.println("Station départ: Tunis Central");
    printer.println("Destination: Sfax");
    printer.println("Heure de sortie: 16/09/2025 16:45");
    
    printer.drawLine();
    printer.alignCenter();
    printer.println("Date: " + new Date().toLocaleString('fr-FR'));
    printer.println("Merci! / شكرا!");
    printer.cut();

    await printer.execute();
    console.log('✅ Exit ticket printed successfully!');

    console.log('\n🎉 All 3 ticket types tested successfully!');
    console.log('📋 Summary:');
    console.log('   ✅ Booking Ticket (TICKET DE RÉSERVATION)');
    console.log('   ✅ Entry Ticket (TICKET D\'ENTRÉE)');
    console.log('   ✅ Exit Ticket (TICKET DE SORTIE)');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAllTickets();