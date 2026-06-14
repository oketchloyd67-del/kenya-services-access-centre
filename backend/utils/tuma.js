const axios = require('axios');
const crypto = require('crypto');

class TUMApi {
    constructor() {
        this.baseURL = process.env.TUMA_ENVIRONMENT === 'production' 
            ? 'https://api.tuma.ke/v1' 
            : 'https://sandbox.tuma.ke/v1';
        this.apiKey = process.env.TUMA_API_KEY;
        this.apiSecret = process.env.TUMA_API_SECRET;
        this.shortcode = process.env.TUMA_SHORTCODE;
        this.passkey = process.env.TUMA_PASSKEY;
        this.callbackURL = process.env.TUMA_CALLBACK_URL;
    }

    async getAccessToken() {
        try {
            const auth = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
            const response = await axios.post(
                `${this.baseURL}/oauth/token`,
                { grant_type: 'client_credentials' },
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            return response.data.access_token;
        } catch (error) {
            console.error('TUMA Token Error:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with TUMA');
        }
    }

    generatePassword() {
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
        return { timestamp, password };
    }

    async initiateSTKPush(phoneNumber, amount, accountReference, transactionDesc) {
        try {
            const token = await this.getAccessToken();
            const { timestamp, password } = this.generatePassword();
            
            const formattedPhone = phoneNumber.replace(/^0+/, '254').replace(/^\+/, '');
            
            const payload = {
                shortcode: this.shortcode,
                amount: Math.round(amount),
                phone_number: formattedPhone,
                account_reference: accountReference,
                transaction_desc: transactionDesc,
                passkey: this.passkey,
                timestamp: timestamp,
                password: password,
                callback_url: this.callbackURL
            };
            
            const response = await axios.post(`${this.baseURL}/stkpush`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            return {
                success: true,
                checkoutRequestID: response.data.CheckoutRequestID,
                responseCode: response.data.ResponseCode,
                responseDesc: response.data.ResponseDescription
            };
        } catch (error) {
            console.error('STK Push Error:', error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.errorMessage || 'Payment initiation failed. Please try again.'
            };
        }
    }

    async queryTransactionStatus(checkoutRequestID) {
        try {
            const token = await this.getAccessToken();
            const response = await axios.post(
                `${this.baseURL}/stkpushquery`,
                {
                    shortcode: this.shortcode,
                    checkout_request_id: checkoutRequestID
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            
            return response.data;
        } catch (error) {
            console.error('Query Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async registerURLs() {
        try {
            const token = await this.getAccessToken();
            const response = await axios.post(
                `${this.baseURL}/registerurl`,
                {
                    shortcode: this.shortcode,
                    response_type: 'completed',
                    confirmation_url: `${process.env.APP_URL}/api/payments/mpesa/confirmation`,
                    validation_url: `${process.env.APP_URL}/api/payments/mpesa/validation`
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            
            console.log('TUMA URLs registered successfully');
            return response.data;
        } catch (error) {
            console.error('Register URL Error:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSettlementBalance() {
        try {
            const token = await this.getAccessToken();
            const response = await axios.get(`${this.baseURL}/accountbalance`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            return {
                success: true,
                balance: response.data,
                currency: 'KES'
            };
        } catch (error) {
            console.error('Balance Error:', error.response?.data || error.message);
            return {
                success: false,
                message: 'Failed to fetch balance'
            };
        }
    }

    async getBankDetails() {
        return {
            bank_name: process.env.BANK_NAME,
            account_name: process.env.BANK_ACCOUNT_NAME,
            account_number: process.env.BANK_ACCOUNT_NUMBER,
            bank_branch: process.env.BANK_BRANCH,
            swift_code: process.env.BANK_SWIFT_CODE,
            settlement_schedule: 'Daily (T+1)',
            settlement_currency: 'KES',
            settlement_minimum: 500
        };
    }
}

module.exports = new TUMApi();