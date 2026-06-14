const axios = require('axios');

async function testLogin() {
    try {
        const response = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'admin@kenyaservices.co.ke',
            password: 'Admin@123'
        });
        console.log('SUCCESS!');
        console.log('Response:', response.data);
    } catch (error) {
        console.log('ERROR:');
        console.log('Status:', error.response?.status);
        console.log('Message:', error.response?.data?.message);
        console.log('Full error:', error.response?.data);
    }
}

testLogin();