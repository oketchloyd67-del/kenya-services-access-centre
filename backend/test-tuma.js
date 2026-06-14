require('dotenv').config();
const TumaService = require('./services/tumaService');

async function testTuma() {
    console.log('🧪 Testing TUMA Service...\n');
    
    try {
        // Test 1: Get Access Token
        console.log('1. Testing Authentication...');
        const token = await TumaService.getAccessToken();
        console.log('   ✅ Authentication successful\n');
        
        // Test 2: Initiate STK Push (use a real phone number for testing)
        console.log('2. Testing STK Push...');
        const result = await TumaService.initiateSTKPush('0712345678', 10, 'Test Payment');
        
        if (result.success) {
            console.log('   ✅ STK Push successful');
            console.log(`   Payment ID: ${result.paymentId}`);
            console.log(`   Checkout ID: ${result.checkoutRequestId}\n`);
            
            // Test 3: Check Payment Status (wait a few seconds)
            console.log('3. Testing Payment Status...');
            setTimeout(async () => {
                const status = await TumaService.checkPaymentStatus(result.paymentId);
                console.log('   Payment Status:', status);
            }, 5000);
        } else {
            console.log('   ❌ STK Push failed:', result.message);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testTuma();