#!/usr/bin/env node

/**
 * Test script for day pass printing functionality
 * This script tests the day pass printing when entering a vehicle to queue
 */

const { invoke } = require('@tauri-apps/api/tauri');

async function testDayPassPrinting() {
    console.log('🧪 Testing Day Pass Printing Functionality...\n');
    
    try {
        // Test 1: Check printer status
        console.log('1. Checking printer status...');
        const printerStatus = await invoke('debug_printer_status');
        console.log('Printer Status:', printerStatus);
        console.log('---\n');
        
        // Test 2: Test day pass printing directly
        console.log('2. Testing day pass printing directly...');
        const testResult = await invoke('test_day_pass_printing', {
            licensePlate: 'TEST123',
            destinationName: 'Test Destination'
        });
        console.log('Day Pass Printing Test Result:', testResult);
        console.log('---\n');
        
        // Test 3: Test entering a vehicle to queue (this should trigger day pass printing)
        console.log('3. Testing entering vehicle to queue...');
        try {
            const queueResult = await invoke('db_enter_queue', {
                licensePlate: 'TEST123',
                destinationId: 'test-destination-id',
                destinationName: 'Test Destination'
            });
            console.log('Queue Entry Result:', queueResult);
        } catch (error) {
            console.log('Queue Entry Error (expected if vehicle doesn\'t exist):', error);
        }
        console.log('---\n');
        
        console.log('✅ Day pass printing tests completed!');
        console.log('\n📋 Next steps:');
        console.log('1. Check the console logs for any error messages');
        console.log('2. Verify printer configuration in /etc/environment or /etc/profile.d/printer-env.sh');
        console.log('3. Test with a real vehicle license plate that exists in the database');
        console.log('4. Check if the printer is connected and working');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testDayPassPrinting();