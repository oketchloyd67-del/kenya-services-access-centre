const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const emailUtil = require('../utils/email');

// ============================================
// KORA PAYMENT CONFIGURATION
// ============================================
const KORA_SECRET_KEY = process.env.KORA_SECRET_KEY;
const KORA_BASE_URL = process.env.KORA_BASE_URL || 'https://api.korapay.com/merchant/api/v1';
const KORA_REDIRECT_URL = process.env.KORA_REDIRECT_URL || 'https://kenyaservices-accesscentre-emph.onrender.com/payment/confirmation';
const KORA_WEBHOOK_URL = process.env.KORA_WEBHOOK_URL || 'https://kenyaservices-accesscentre-ly34.onrender.com/api/kora/webhook';

// ============================================
// TEST ENDPOINT
// ============================================
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Payments API is working with Kora' });
});

// ============================================
// INITIATE KORA PAYMENT
// ============================================
router.post('/kora/initiate', async (req, res) => {
    const { amount, transactionType, userId, metadata } = req.body;
    const db = req.app.get('db');

    console.log('=== KORA PAYMENT REQUEST ===');
    console.log('Amount:', amount);
    console.log('Type:', transactionType);
    console.log('User ID:', userId);

    // Validate amount based on transaction type
    const validAmounts = {
        'employer_registration': 700,
        'employer_subscription': 300,
        'job_view_requirements': 50,
        'employer_details': 100,
        'cv_upload': 50,
        'service_connection': 100
    };

    if (!validAmounts[transactionType]) {
        return res.status(400).json({
            success: false,
            message: 'Invalid transaction type'
        });
    }

    if (amount !== validAmounts[transactionType]) {
        return res.status(400).json({
            success: false,
            message: `Invalid amount. Expected KES ${validAmounts[transactionType]}`
        });
    }

    try {
        // Generate unique reference
        const reference = `KSAC${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Get user email
        const userResult = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
        const userEmail = userResult.rows[0]?.email || 'customer@example.com';

        // Prepare Kora payload
        const payload = {
            amount: amount,
            currency: 'KES',
            redirect_url: KORA_REDIRECT_URL,
            notification_url: KORA_WEBHOOK_URL,
            reference: reference,
            customer: {
                email: userEmail,
                name: metadata?.customer_name || 'Customer'
            },
            metadata: {
                transaction_type: transactionType,
                user_id: userId,
                ...metadata
            }
        };

        console.log('Kora Payload:', JSON.stringify(payload, null, 2));

        // Call Kora API
        const response = await axios.post(
            `${KORA_BASE_URL}/charges/initialize`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${KORA_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log('Kora Response:', response.data);

        if (response.data && response.data.status) {
            const paymentData = response.data.data;

            // Save transaction to database
            const transactionId = uuidv4();
            await db.query(
                `INSERT INTO transactions (id, user_id, transaction_type, amount, checkout_request_id, phone_number, status, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [transactionId, userId, transactionType, amount, paymentData.reference, null, 'pending', JSON.stringify(metadata || {})]
            );

            res.json({
                success: true,
                checkout_url: paymentData.checkout_url,
                reference: paymentData.reference,
                message: 'Payment initiated. Redirecting to Kora checkout.'
            });
        } else {
            console.error('Kora Initiation Failed:', response.data);
            res.status(400).json({
                success: false,
                message: response.data?.message || 'Payment initiation failed'
            });
        }

    } catch (error) {
        console.error('Kora Payment Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Payment processing failed: ' + (error.response?.data?.message || error.message)
        });
    }
});

// ============================================
// KORA WEBHOOK - Handle Payment Callbacks
// ============================================
router.post('/kora/webhook', async (req, res) => {
    const { body } = req;
    const db = req.app.get('db');
    const io = req.app.get('io');

    console.log('=== KORA WEBHOOK RECEIVED ===');
    console.log('Webhook Body:', JSON.stringify(body, null, 2));

    try {
        const { event, data } = body;

        if (event === 'charge.success') {
            const { reference, amount, customer, metadata, transaction_id } = data;

            // Update transaction in database
            await db.query(
                `UPDATE transactions 
                 SET status = 'completed', 
                     mpesa_receipt = $1, 
                     completed_at = NOW()
                 WHERE checkout_request_id = $2`,
                [transaction_id || reference, reference]
            );

            // Get transaction details
            const transaction = await db.query(
                `SELECT * FROM transactions WHERE checkout_request_id = $1`,
                [reference]
            );

            if (transaction.rows.length > 0) {
                const tx = transaction.rows[0];
                const txMetadata = tx.metadata || {};

                console.log('Processing payment for:', tx.transaction_type);

                switch (tx.transaction_type) {
                    case 'employer_registration':
                        await db.query(
                            `UPDATE employers 
                             SET entry_fee_paid = true, 
                                 subscription_expiry = NOW() + INTERVAL '1 month',
                                 is_active = true
                             WHERE user_id = $1`,
                            [tx.user_id]
                        );
                        console.log('✅ Employer registration activated for:', tx.user_id);
                        break;

                    case 'employer_subscription':
                        await db.query(
                            `UPDATE employers 
                             SET subscription_expiry = subscription_expiry + INTERVAL '1 month',
                                 is_active = true
                             WHERE user_id = $1`,
                            [tx.user_id]
                        );
                        console.log('✅ Employer subscription renewed for:', tx.user_id);
                        break;

                    case 'job_view_requirements':
                        await db.query(
                            `INSERT INTO job_applications (job_id, job_seeker_id, requirements_fee_paid)
                             VALUES ($1, $2, true)
                             ON CONFLICT (job_id, job_seeker_id) DO NOTHING`,
                            [txMetadata.jobId, tx.user_id]
                        );
                        console.log('✅ Job requirements access granted for:', tx.user_id);
                        break;

                    case 'employer_details':
                        await db.query(
                            `INSERT INTO job_employer_access (job_id, user_id, fee_paid)
                             VALUES ($1, $2, 100)`,
                            [txMetadata.jobId, tx.user_id]
                        );
                        console.log('✅ Employer details access granted for:', tx.user_id);
                        break;

                    case 'cv_upload':
                        await db.query(
                            `UPDATE job_applications 
                             SET cv_upload_fee_paid = true, 
                                 total_amount_paid = total_amount_paid + 50,
                                 status = 'submitted'
                             WHERE id = $1 AND job_seeker_id = $2`,
                            [txMetadata.applicationId, tx.user_id]
                        );

                        if (txMetadata.employerEmail && txMetadata.jobTitle && txMetadata.applicantName) {
                            await emailUtil.sendApplicationNotification(
                                txMetadata.employerEmail,
                                txMetadata.jobTitle,
                                txMetadata.applicantName,
                                txMetadata.cvPath
                            );
                        }
                        console.log('✅ CV upload fee paid for application:', txMetadata.applicationId);
                        break;

                    case 'service_connection':
                        await db.query(
                            `UPDATE service_connections 
                             SET fee_paid = true, 
                                 amount_paid = 100,
                                 status = 'connected',
                                 connected_at = NOW()
                             WHERE service_provider_id = $1 AND seeker_phone = $2`,
                            [txMetadata.providerId, txMetadata.seeker_phone]
                        );
                        await db.query(
                            `UPDATE service_providers 
                             SET total_connections = total_connections + 1
                             WHERE user_id = $1`,
                            [txMetadata.providerId]
                        );

                        if (txMetadata.providerEmail && txMetadata.seeker_name && txMetadata.seeker_phone) {
                            await emailUtil.sendConnectionNotification(
                                txMetadata.providerEmail,
                                txMetadata.seeker_name,
                                txMetadata.seeker_phone,
                                txMetadata.seeker_email
                            );
                        }
                        console.log('✅ Service connection completed for provider:', txMetadata.providerId);
                        break;

                    default:
                        console.log('Unknown transaction type:', tx.transaction_type);
                }

                io.to(`user_${tx.user_id}`).emit('payment_success', {
                    amount: tx.amount,
                    receipt: transaction_id || reference,
                    transactionType: tx.transaction_type,
                    message: `Payment of KES ${tx.amount} completed successfully!`
                });
            }
        } else if (event === 'charge.failed') {
            const { reference } = data;
            await db.query(
                `UPDATE transactions 
                 SET status = 'failed'
                 WHERE checkout_request_id = $1`,
                [reference]
            );
            console.log('❌ Payment failed for:', reference);
        }

        res.json({ status: 'received' });

    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.json({ status: 'received' });
    }
});

// ============================================
// GET TRANSACTION STATUS
// ============================================
router.get('/transaction-status/:reference', async (req, res) => {
    const { reference } = req.params;
    const db = req.app.get('db');

    try {
        const result = await db.query(
            `SELECT * FROM transactions WHERE checkout_request_id = $1`,
            [reference]
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

// ============================================
// EXPORT ROUTER
// ============================================
module.exports = router;