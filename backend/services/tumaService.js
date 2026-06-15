const axios = require('axios');

class TumaService {
    constructor() {
        const environment = process.env.TUMA_ENVIRONMENT || 'sandbox';
        
        // Use sandbox URL for testing
        if (environment === 'production') {
            this.baseURL = 'https://api.tuma.co.ke';
        } else {
            this.baseURL = 'https://sandbox.tuma.co.ke';
        }
        
        this.businessEmail = process.env.TUMA_BUSINESS_EMAIL;
        this.apiKey = process.env.TUMA_API_KEY;
        this.callbackURL = process.env.TUMA_CALLBACK_URL;
        this.token = null;
        this.tokenExpiry = null;
        
        console.log('=== TUMA SERVICE INITIALIZED ===');
        console.log('Environment:', environment);
        console.log('Base URL:', this.baseURL);
        console.log('Business Email:', this.businessEmail);
        console.log('API Key (first 10 chars):', this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'MISSING');
    }

    async getAccessToken() {
        // Check for existing valid token
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        // Validate credentials are present
        if (!this.businessEmail || !this.apiKey) {
            throw new Error('TUMA credentials missing. Check TUMA_BUSINESS_EMAIL and TUMA_API_KEY in .env');
        }

        try {
            console.log('Requesting TUMA token with email:', this.businessEmail);
            
            const response = await axios.post(`${this.baseURL}/auth/token`, {
                email: this.businessEmail,
                api_key: this.apiKey
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });

            if (response.data && response.data.success) {
                this.token = response.data.data.token;
                this.tokenExpiry = Date.now() + 3300000;
                console.log('✅ TUMA Authentication successful');
                return this.token;
            } else {
                const errorMsg = response.data?.message || 'Authentication failed';
                console.error('❌ TUMA auth failed:', errorMsg);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('❌ TUMA Auth Error Details:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            
            // Handle specific error cases
            if (error.response?.status === 401) {
                throw new Error('Invalid TUMA credentials. Check your Business Email and API Key.');
            }
            if (error.code === 'ECONNREFUSED') {
                throw new Error(`Cannot connect to TUMA at ${this.baseURL}. Check your internet.`);
            }
            if (error.response?.data?.error_code === 'IPRS_VERIFICATION_REQUIRED') {
                throw new Error('IPRS verification required. Please complete verification in TUMA dashboard.');
            }
            
            throw new Error(`TUMA authentication failed: ${error.message}`);
        }
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

    formatPhoneNumber(phoneNumber) {
        let cleaned = phoneNumber.replace(/\D/g, '');
        if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
        if (cleaned.startsWith('254')) cleaned = cleaned.substring(3);
        return '254' + cleaned;
    }
}

module.exports = new TumaService();