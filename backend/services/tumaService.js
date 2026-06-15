const axios = require('axios');

class TumaService {
    constructor() {
        // Use the correct API URL (no separate sandbox subdomain)
        this.baseURL = 'https://api.tuma.co.ke';
        this.businessEmail = process.env.TUMA_BUSINESS_EMAIL;
        this.apiKey = process.env.TUMA_API_KEY;
        this.callbackURL = process.env.TUMA_CALLBACK_URL;
        this.token = null;
        this.tokenExpiry = null;
        
        console.log('✅ TUMA Service Initialized');
        console.log('   Base URL:', this.baseURL);
    }

    async getAccessToken() {
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        try {
            const response = await axios.post(`${this.baseURL}/auth/token`, {
                email: this.businessEmail,
                api_key: this.apiKey
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });

            if (response.data && response.data.success) {
                this.token = response.data.data.token;
                // Token expires in 24 hours (86400000 ms)
                this.tokenExpiry = Date.now() + 86400000;
                console.log('✅ TUMA Authentication successful');
                return this.token;
            } else {
                throw new Error(response.data?.message || 'Authentication failed');
            }
        } catch (error) {
            console.error('❌ TUMA Auth Error:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with TUMA');
        }
    }

    formatPhoneNumber(phoneNumber) {
        let cleaned = phoneNumber.replace(/\D/g, '');
        if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
        if (cleaned.startsWith('254')) cleaned = cleaned.substring(3);
        return '254' + cleaned;
    }

    async initiateSTKPush(phoneNumber, amount, description, reference = null) {
        try {
            const token = await this.getAccessToken();
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            const payload = {
                amount: parseFloat(amount),
                phone: formattedPhone,
                description: description || 'Payment for Kenya Services',
                callback_url: this.callbackURL
            };
            
            if (reference) payload.reference = reference;
            
            console.log(`📤 Initiating STK Push: ${formattedPhone} for KES ${amount}`);
            
            const response = await axios.post(`${this.baseURL}/payment/stk-push`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            });
            
            if (response.data && response.data.success) {
                return {
                    success: true,
                    paymentId: response.data.data.payment_id,
                    checkoutRequestId: response.data.data.checkout_request_id,
                    message: response.data.message || 'STK Push sent successfully'
                };
            } else {
                throw new Error(response.data?.message || 'Payment initiation failed');
            }
        } catch (error) {
            console.error('❌ STK Push Error:', error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Payment initiation failed'
            };
        }
    }

    async checkPaymentStatus(paymentId) {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(`${this.baseURL}/payment/status/${paymentId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            return response.data;
        } catch (error) {
            console.error('❌ Payment Status Error:', error.response?.data || error.message);
            return { success: false, message: 'Failed to check payment status' };
        }
    }
}

module.exports = new TumaService();