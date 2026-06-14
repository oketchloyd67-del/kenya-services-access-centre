const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
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

const TUMApiInstance = new TUMApi();

router.post('/mpesa/stkpush', async (req, res) => {
    const { phoneNumber, amount, transactionType, userId, metadata } = req.body;
    const db = req.app.get('db');
    
    const validAmounts = {
        'employer_registration': 700,
        'employer_subscription': 300,
        'job_view_requirements': 50,
        'employer_details': 100,
        'cv_upload': 50,
        'service_connection': 100
    };
    
    if (validAmounts[transactionType] && amount !== validAmounts[transactionType]) {
        return res.status(400).json({ 
            success: false, 
            message: `Invalid amount for ${transactionType}. Expected KES ${validAmounts[transactionType]}` 
        });
    }
    
    try {
        const accountReference = `KSAC${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const transactionDesc = `${transactionType.replace(/_/g, ' ')} - Kenya Services`;
        
        const result = await TUMApiInstance.initiateSTKPush(phoneNumber, amount, accountReference, transactionDesc);
        
        if (result.success) {
            const transactionId = uuidv4();
            await db.query(
                `INSERT INTO transactions (id, user_id, transaction_type, amount, checkout_request_id, phone_number, status, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [transactionId, userId, transactionType, amount, result.checkoutRequestID, phoneNumber, 'pending', JSON.stringify(metadata || {})]
            );
            
            res.json({
                success: true,
                checkoutRequestID: result.checkoutRequestID,
                message: 'STK Push sent. Please check your phone and enter M-PESA PIN.'
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message || 'Payment initiation failed'
            });
        }
        
    } catch (error) {
        console.error('STK Push error:', error);
        res.status(500).json({ success: false, message: 'Payment processing failed' });
    }
});

router.post('/mpesa/callback', async (req, res) => {
    const { Body } = req.body;
    const db = req.app.get('db');
    const io = req.app.get('io');
    
    console.log('M-PESA Callback received:', JSON.stringify(Body, null, 2));
    
    if (Body && Body.stkCallback) {
        const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } = Body.stkCallback;
        
        try {
            if (ResultCode === 0) {
                const metadata = CallbackMetadata?.Item || [];
                const amount = metadata.find(item => item.Name === 'Amount')?.Value;
                const mpesaReceipt = metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
                const phoneNumber = metadata.find(item => item.Name === 'PhoneNumber')?.Value;
                
                const transactionResult = await db.query(
                    `UPDATE transactions 
                     SET status = 'completed', 
                         mpesa_receipt = $1, 
                         completed_at = NOW(),
                         result_code = $2,
                         result_desc = $3,
                         metadata = metadata || jsonb_build_object('mpesa_response', $4)
                     WHERE checkout_request_id = $5
                     RETURNING *`,
                    [mpesaReceipt, ResultCode, ResultDesc, JSON.stringify(Body), CheckoutRequestID]
                );
                
                const transaction = transactionResult.rows[0];
                
                if (transaction) {
                    const txMetadata = transaction.metadata || {};
                    
                    switch (transaction.transaction_type) {
                        case 'employer_registration':
                            await db.query(
                                `UPDATE employers 
                                 SET entry_fee_paid = true, 
                                     subscription_expiry = NOW() + INTERVAL '1 month',
                                     is_active = true
                                 WHERE user_id = $1`,
                                [transaction.user_id]
                            );
                            break;
                        case 'employer_subscription':
                            await db.query(
                                `UPDATE employers 
                                 SET subscription_expiry = subscription_expiry + INTERVAL '1 month',
                                     is_active = true
                                 WHERE user_id = $1`,
                                [transaction.user_id]
                            );
                            break;
                        case 'job_view_requirements':
                            await db.query(
                                `UPDATE jobs SET requirements_views = requirements_views + 1 WHERE id = $1`,
                                [txMetadata.jobId]
                            );
                            await db.query(
                                `INSERT INTO job_applications (job_id, job_seeker_id, requirements_fee_paid)
                                 VALUES ($1, $2, $3)
                                 ON CONFLICT DO NOTHING`,
                                [txMetadata.jobId, transaction.user_id, true]
                            );
                            break;
                        case 'employer_details':
                            await db.query(
                                `INSERT INTO job_employer_access (job_id, user_id, fee_paid)
                                 VALUES ($1, $2, $3)`,
                                [txMetadata.jobId, transaction.user_id, 100]
                            );
                            break;
                        case 'cv_upload':
                            await db.query(
                                `UPDATE job_applications 
                                 SET cv_upload_fee_paid = true, 
                                     total_amount_paid = total_amount_paid + 50,
                                     status = 'submitted'
                                 WHERE id = $1 AND job_seeker_id = $2`,
                                [txMetadata.applicationId, transaction.user_id]
                            );
                            break;
                        case 'service_connection':
                            await db.query(
                                `UPDATE service_connections 
                                 SET fee_paid = true, 
                                     amount_paid = 100,
                                     status = 'connected',
                                     connected_at = NOW()
                                 WHERE service_provider_id = $1 AND seeker_phone = $2 AND fee_paid = false`,
                                [txMetadata.providerId, txMetadata.seeker_phone]
                            );
                            await db.query(
                                `UPDATE service_providers 
                                 SET total_connections = total_connections + 1
                                 WHERE user_id = $1`,
                                [txMetadata.providerId]
                            );
                            break;
                    }
                    
                    io.to(`user_${transaction.user_id}`).emit('payment_success', {
                        amount: transaction.amount,
                        receipt: mpesaReceipt,
                        transactionType: transaction.transaction_type,
                        message: `Payment of KES ${transaction.amount} completed successfully!`
                    });
                    
                    console.log(`Payment successful: ${mpesaReceipt} for ${transaction.transaction_type}`);
                }
            } else {
                await db.query(
                    `UPDATE transactions 
                     SET status = 'failed', 
                         result_code = $1,
                         result_desc = $2,
                         metadata = metadata || jsonb_build_object('failure_reason', $3)
                     WHERE checkout_request_id = $4`,
                    [ResultCode, ResultDesc, ResultDesc, CheckoutRequestID]
                );
                
                console.log(`Payment failed: ${ResultDesc}`);
            }
            
            res.json({ ResultCode: 0, ResultDesc: 'Success' });
        } catch (error) {
            console.error('Callback processing error:', error);
            res.json({ ResultCode: 1, ResultDesc: 'Failed' });
        }
    } else {
        res.json({ ResultCode: 1, ResultDesc: 'Invalid callback' });
    }
});

router.get('/bank-details', async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const bankDetails = await TUMApiInstance.getBankDetails();
        
        const settingsResult = await db.query(
            `SELECT setting_key, setting_value FROM admin_settings 
             WHERE setting_key IN ('bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch', 'bank_swift_code')`
        );
        
        const dbSettings = {};
        settingsResult.rows.forEach(row => {
            dbSettings[row.setting_key] = row.setting_value;
        });
        
        res.json({
            success: true,
            bankDetails: {
                ...bankDetails,
                ...dbSettings
            }
        });
        
    } catch (error) {
        console.error('Get bank details error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch bank details' });
    }
});

router.get('/transaction-status/:checkoutRequestId', async (req, res) => {
    const { checkoutRequestId } = req.params;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT * FROM transactions WHERE checkout_request_id = $1`,
            [checkoutRequestId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }
        
        res.json({
            success: true,
            transaction: result.rows[0]
        });
        
    } catch (error) {
        console.error('Transaction status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;