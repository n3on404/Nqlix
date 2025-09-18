// Test script to check printer connection from frontend
// This should be run from within the Tauri app context

console.log('🔧 Testing printer connection from frontend...');

// Test printer connection
async function testPrinterConnection() {
  try {
    console.log('📡 Calling test_printer_connection...');
    const result = await invoke('test_printer_connection');
    console.log('✅ Printer connection result:', result);
    return result;
  } catch (error) {
    console.error('❌ Printer connection failed:', error);
    return null;
  }
}

// Test printer config
async function testPrinterConfig() {
  try {
    console.log('📡 Calling get_printer_config...');
    const config = await invoke('get_printer_config');
    console.log('✅ Printer config:', config);
    return config;
  } catch (error) {
    console.error('❌ Failed to get printer config:', error);
    return null;
  }
}

// Test simple print
async function testSimplePrint() {
  try {
    console.log('📡 Calling print_ticket...');
    const result = await invoke('print_ticket', { content: 'Test print from frontend' });
    console.log('✅ Simple print result:', result);
    return result;
  } catch (error) {
    console.error('❌ Simple print failed:', error);
    return null;
  }
}

// Run all tests
async function runTests() {
  console.log('🧪 Running printer tests...');
  
  const config = await testPrinterConfig();
  const connection = await testPrinterConnection();
  const print = await testSimplePrint();
  
  console.log('📋 Test Summary:');
  console.log('   Config:', config ? '✅' : '❌');
  console.log('   Connection:', connection ? '✅' : '❌');
  console.log('   Print:', print ? '✅' : '❌');
}

// Export for use in browser console
window.testPrinter = {
  testPrinterConnection,
  testPrinterConfig,
  testSimplePrint,
  runTests
};

console.log('🔧 Printer test functions available as window.testPrinter');
console.log('💡 Run: testPrinter.runTests() to test all functions');