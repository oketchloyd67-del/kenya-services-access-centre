// backend/test-tuma.js
require('dotenv').config();
const TumaService = require('./services/tumaService');

async function testTuma() {
    console.log('\n🧪 Testing TUMA Service...\n');

    try {
        // 1. Test Authentication
        console.log('1. Testing Authentication...');
        const token = await TumaService.getAccessToken();
        console.log('   ✅ Authentication successful\n');

        // 2. Initiate STK Push (Use your real M-PESA number)
        console.log('2. Testing STK Push...');
        // IMPORTANT: Replace this number with your actual M-PESA registered phone number
        const phoneNumber = '254708043146';
        const result = await TumaService.initiateSTKPush(phoneNumber, 10, 'Test Payment');
        
        if (result.success) {
            console.log(`   ✅ STK Push successful`);
            console.log(`   Payment ID: ${result.paymentId}`);
            console.log(`   Checkout ID: ${result.checkoutRequestId}\n`);
            
            // 3. Check Payment Status (wait a few seconds for the prompt)
            if (result.paymentId) {
                console.log('3. Checking Payment Status...');
                // Wait 15 seconds for the user to enter their PIN
                await new Promise(resolve => setTimeout(resolve, 15000));
                
                const status = await TumaService.checkPaymentStatus(result.paymentId);
                console.log('   Payment Status:', status);
            } else {
                console.log('   ⚠️ Could not check status: Payment ID missing in response.');
                console.log('   Full API response may have a different structure.');
            }
        } else {
            console.log(`   ❌ STK Push failed: ${result.message}`);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testTuma();