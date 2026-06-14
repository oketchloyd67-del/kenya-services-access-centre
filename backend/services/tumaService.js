const axios = require('axios');

class TumaService {
    constructor() {
        // Determine environment
        const environment = process.env.TUMA_ENVIRONMENT || 'sandbox';
        
        // Set base URL based on environment
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
        
        console.log(`✅ TUMA Service Initialized`);
        console.log(`   Environment: ${environment}`);
        console.log(`   Base URL: ${this.baseURL}`);
        console.log(`   Business Email: ${this.businessEmail}`);
    }

    /**
     * Get authentication token from TUMA
     * Token expires in 1 hour
     */
    async getAccessToken() {
        // Check if token is still valid (within 55 minutes to be safe)
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }

        try {
            const response = await axios.post(`${this.baseURL}/auth/token`, {
                email: this.businessEmail,
                api_key: this.apiKey
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (response.data && response.data.success) {
                this.token = response.data.data.token;
                // Token expires in 1 hour (3600000 ms), set to 55 minutes for safety
                this.tokenExpiry = Date.now() + 3300000;
                console.log('✅ TUMA Authentication successful');
                return this.token;
            } else {
                throw new Error(response.data?.message || 'Authentication failed');
            }
        } catch (error) {
            console.error('❌ TUMA Auth Error:', error.response?.data || error.message);
            
            // Handle specific error cases
            if (error.response?.data?.error_code === 'IPRS_VERIFICATION_REQUIRED') {
                throw new Error('IPRS verification required. Please complete verification in TUMA dashboard.');
            }
            
            throw new Error('Failed to authenticate with TUMA');
        }
    }

    /**
     * Format phone number to international format (254XXXXXXXXX)
     */
    formatPhoneNumber(phoneNumber) {
        // Remove any non-digit characters
        let cleaned = phoneNumber.replace(/\D/g, '');
        
        // Remove leading zero if present
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.substring(1);
        }
        
        // Remove leading +254 if present
        if (cleaned.startsWith('254')) {
            cleaned = cleaned.substring(3);
        }
        
        // Add 254 prefix
        return '254' + cleaned;
    }

    /**
     * Initiate STK Push payment
     * @param {string} phoneNumber - Customer's phone number (07XX or 2547XX)
     * @param {number} amount - Amount to charge in KES
     * @param {string} description - Transaction description
     * @param {string} reference - Optional reference number
     */
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
            
            // Add reference if provided
            if (reference) {
                payload.reference = reference;
            }
            
            console.log(`📤 Initiating STK Push:`);
            console.log(`   Phone: ${formattedPhone}`);
            console.log(`   Amount: KES ${amount}`);
            console.log(`   Description: ${description}`);
            
            const response = await axios.post(`${this.baseURL}/payment/stk-push`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            if (response.data && response.data.success) {
                console.log(`✅ STK Push initiated successfully`);
                console.log(`   Payment ID: ${response.data.data.payment_id}`);
                console.log(`   Checkout Request ID: ${response.data.data.checkout_request_id}`);
                
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
            
            // Handle specific error codes
            if (error.response?.data?.error_code === 'IPRS_VERIFICATION_REQUIRED') {
                return {
                    success: false,
                    message: 'Identity verification required. Please complete IPRS verification in TUMA dashboard.',
                    requiresVerification: true
                };
            }
            
            if (error.response?.data?.error_code === 'INSUFFICIENT_BALANCE') {
                return {
                    success: false,
                    message: 'Insufficient balance in your TUMA account. Please top up.',
                    requiresTopup: true
                };
            }
            
            return {
                success: false,
                message: error.response?.data?.message || error.message || 'Payment initiation failed'
            };
        }
    }

    /**
     * Check payment status
     * @param {string} paymentId - The payment ID from initiateSTKPush response
     */
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
            
            if (response.data && response.data.success) {
                return {
                    success: true,
                    status: response.data.data.status,
                    amount: response.data.data.amount,
                    phone: response.data.data.phone,
                    transactionId: response.data.data.transaction_id,
                    mpesaReceipt: response.data.data.mpesa_receipt,
                    completedAt: response.data.data.completed_at
                };
            } else {
                return {
                    success: false,
                    message: response.data?.message || 'Failed to get payment status'
                };
            }
        } catch (error) {
            console.error('❌ Payment Status Error:', error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to check payment status'
            };
        }
    }

    /**
     * Get account balance
     */
    async getAccountBalance() {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(`${this.baseURL}/account/balance`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            if (response.data && response.data.success) {
                return {
                    success: true,
                    balance: response.data.data.balance,
                    currency: response.data.data.currency || 'KES'
                };
            } else {
                return {
                    success: false,
                    message: response.data?.message || 'Failed to get balance'
                };
            }
        } catch (error) {
            console.error('❌ Balance Error:', error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to get account balance'
            };
        }
    }

    /**
     * Get transaction details
     * @param {string} transactionId - The transaction ID from TUMA
     */
    async getTransactionDetails(transactionId) {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(`${this.baseURL}/transaction/${transactionId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            if (response.data && response.data.success) {
                return {
                    success: true,
                    transaction: response.data.data
                };
            } else {
                return {
                    success: false,
                    message: response.data?.message || 'Failed to get transaction details'
                };
            }
        } catch (error) {
            console.error('❌ Transaction Details Error:', error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to get transaction details'
            };
        }
    }
}

// Export a single instance
module.exports = new TumaService();