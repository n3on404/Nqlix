// Test script to verify queue reordering functionality
const { invoke } = window.__TAURI__.tauri;

async function testQueueReorder() {
    try {
        console.log('🧪 Testing queue reordering...');
        
        // Test data - using the actual queue IDs from the database
        const destinationId = 'tunis-station';
        const vehiclePositions = [
            ['6238e1a3-a1fa-40df-9908-38d645c5e845', 1], // Move to position 1
            ['8bcd47f6-2eb1-483d-83ae-1e71a6b01261', 2]  // Move to position 2
        ];
        
        console.log('📤 Sending data:', { destinationId, vehiclePositions });
        
        const result = await invoke('db_update_queue_positions', {
            destinationId,
            vehiclePositions
        });
        
        console.log('✅ Result:', result);
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run the test
testQueueReorder();