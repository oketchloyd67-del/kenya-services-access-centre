// Add these at the top of payments.js
const emailUtil = require('../utils/email');

// In the callback section, after successful payment:

// For cv_upload (job application)
case 'cv_upload':
    await db.query(
        `UPDATE job_applications 
         SET cv_upload_fee_paid = true, 
             total_amount_paid = total_amount_paid + 50,
             status = 'submitted'
         WHERE id = $1 AND job_seeker_id = $2`,
        [txMetadata.applicationId, tx.user_id]
    );
    
    // Send email to employer
    if (txMetadata.employerEmail && txMetadata.jobTitle && txMetadata.applicantName) {
        await emailUtil.sendApplicationNotification(
            txMetadata.employerEmail,
            txMetadata.jobTitle,
            txMetadata.applicantName,
            txMetadata.cvPath
        );
    }
    break;

// For service_connection
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
    
    // Send email to service provider
    if (txMetadata.providerEmail && txMetadata.seeker_name && txMetadata.seeker_phone) {
        await emailUtil.sendConnectionNotification(
            txMetadata.providerEmail,
            txMetadata.seeker_name,
            txMetadata.seeker_phone,
            txMetadata.seeker_email
        );
    }
    break;
    
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const TumaService = require('../services/tumaService');

// ============================================
// POST /api/payments/mpesa/stkpush - Initiate M-PESA Payment
// ============================================
router.post('/mpesa/stkpush', async (req, res) => {
    const { phoneNumber, amount, transactionType, userId, metadata } = req.body;
    const db = req.app.get('db');
    
    console.log('=== PAYMENT REQUEST RECEIVED ===');
    console.log('Phone:', phoneNumber);
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
    
    // Check if transaction type is valid
    if (!validAmounts[transactionType]) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid transaction type' 
        });
    }
    
    // Check if amount matches expected amount
    if (amount !== validAmounts[transactionType]) {
        return res.status(400).json({ 
            success: false, 
            message: `Invalid amount. Expected KES ${validAmounts[transactionType]}` 
        });
    }
    
    // Validate phone number
    if (!phoneNumber) {
        return res.status(400).json({ 
            success: false, 
            message: 'Phone number is required' 
        });
    }
    
    try {
        const description = `${transactionType.replace(/_/g, ' ')} - Kenya Services`;
        
        // Initiate STK Push with TUMA
        const result = await TumaService.initiateSTKPush(phoneNumber, amount, description);
        
        if (result.success) {
            // Save transaction to database
            const transactionId = uuidv4();
            await db.query(
                `INSERT INTO transactions (id, user_id, transaction_type, amount, checkout_request_id, phone_number, status, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [transactionId, userId, transactionType, amount, result.checkoutRequestId, phoneNumber, 'pending', JSON.stringify(metadata || {})]
            );
            
            console.log('✅ Payment initiated successfully:', result.checkoutRequestId);
            
            res.json({
                success: true,
                checkoutRequestID: result.checkoutRequestId,
                message: 'STK Push sent. Please check your phone and enter M-PESA PIN.'
            });
        } else {
            console.error('❌ Payment initiation failed:', result.message);
            res.status(400).json({
                success: false,
                message: result.message || 'Payment initiation failed'
            });
        }
        
    } catch (error) {
        console.error('❌ STK Push error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Payment processing failed: ' + error.message 
        });
    }
});

// ============================================
// POST /api/payments/mpesa/callback - TUMA Callback
// ============================================
router.post('/mpesa/callback', async (req, res) => {
    const { body } = req;
    const db = req.app.get('db');
    const io = req.app.get('io');
    
    console.log('=== TUMA CALLBACK RECEIVED ===');
    console.log('Callback body:', JSON.stringify(body, null, 2));
    
    try {
        // Extract payment details from callback
        const { payment_id, status, amount, phone, transaction_id, metadata } = body;
        
        if (status === 'completed') {
            // Update transaction in database
            await db.query(
                `UPDATE transactions 
                 SET status = 'completed', 
                     mpesa_receipt = $1, 
                     completed_at = NOW()
                 WHERE checkout_request_id = $2`,
                [transaction_id, payment_id]
            );
            
            // Get transaction details
            const transaction = await db.query(
                `SELECT * FROM transactions WHERE checkout_request_id = $1`,
                [payment_id]
            );
            
            if (transaction.rows.length > 0) {
                const tx = transaction.rows[0];
                const txMetadata = tx.metadata || {};
                
                console.log('Processing post-payment actions for:', tx.transaction_type);
                
                // Handle post-payment actions based on transaction type
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
                        console.log('✅ Service connection completed for provider:', txMetadata.providerId);
                        break;
                }
                
                // Send real-time notification via WebSocket
                io.to(`user_${tx.user_id}`).emit('payment_success', {
                    amount: tx.amount,
                    receipt: transaction_id,
                    transactionType: tx.transaction_type,
                    message: `Payment of KES ${tx.amount} completed successfully!`
                });
            }
        } else if (status === 'failed') {
            await db.query(
                `UPDATE transactions 
                 SET status = 'failed'
                 WHERE checkout_request_id = $1`,
                [payment_id]
            );
            console.log('❌ Payment failed for:', payment_id);
        }
        
        // Always acknowledge receipt to TUMA
        res.json({ status: 'received' });
        
    } catch (error) {
        console.error('❌ Callback processing error:', error);
        // Still acknowledge to prevent retries
        res.json({ status: 'received' });
    }
});

// ============================================
// GET /api/payments/transaction-status/:checkoutRequestId
// ============================================
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

// ============================================
// GET /api/payments/test - Test endpoint
// ============================================
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Payments API is working' });
});

module.exports = router;