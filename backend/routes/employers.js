const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// ============================================
// REGISTER EMPLOYER (after user registration)
// ============================================
router.post('/register', [
    body('userId').isUUID().withMessage('Valid user ID is required'),
    body('company_name').notEmpty().trim().withMessage('Company name is required'),
    body('business_reg_number').optional(),
    body('company_address').optional()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { userId, company_name, business_reg_number, company_address } = req.body;
    const db = req.app.get('db');
    
    console.log('=== EMPLOYER REGISTRATION REQUEST ===');
    console.log('userId:', userId);
    console.log('company_name:', company_name);
    
    try {
        // Check if user exists and is employer
        const userResult = await db.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2',
            [userId, 'employer']
        );
        
        if (userResult.rows.length === 0) {
            console.log('User not found or not an employer:', userId);
            return res.status(404).json({ 
                success: false, 
                message: 'Employer user not found. Please complete account registration first.' 
            });
        }
        
        // Check if already registered as employer
        const existingResult = await db.query(
            'SELECT * FROM employers WHERE user_id = $1',
            [userId]
        );
        
        if (existingResult.rows.length > 0) {
            console.log('User already registered as employer:', userId);
            return res.status(400).json({ 
                success: false, 
                message: 'Already registered as employer' 
            });
        }
        
        // Create employer record (subscription starts after payment)
        const result = await db.query(
            `INSERT INTO employers (user_id, company_name, business_reg_number, company_address, subscription_expiry, entry_fee_paid, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING user_id, company_name`,
            [userId, company_name, business_reg_number, company_address, '2000-01-01', false, false]
        );
        
        console.log('Employer registered successfully:', userId);
        
        res.json({
            success: true,
            message: 'Employer registration successful. Please pay entry fee to start posting jobs.',
            requiresPayment: true,
            amount: 700,
            employer: result.rows[0]
        });
        
    } catch (error) {
        console.error('Employer registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

// ============================================
// POST A JOB
// ============================================
router.post('/post-job', [
    body('employerId').isUUID(),
    body('title').notEmpty().trim(),
    body('description').notEmpty(),
    body('requirements').notEmpty(),
    body('location').optional(),
    body('salary_range').optional(),
    body('employment_type').optional(),
    body('deadline').optional()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { employerId, title, description, requirements, location, salary_range, employment_type, deadline } = req.body;
    const db = req.app.get('db');
    
    try {
        // Check if employer exists and has active subscription
        const employerResult = await db.query(
            `SELECT * FROM employers 
             WHERE user_id = $1 AND is_active = true AND entry_fee_paid = true AND subscription_expiry > NOW()`,
            [employerId]
        );
        
        if (employerResult.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'Subscription expired or not active. Please renew your subscription.' 
            });
        }
        
        const expiresAt = deadline ? new Date(deadline) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        const result = await db.query(
            `INSERT INTO jobs (employer_id, title, description, requirements, location, salary_range, employment_type, expires_at, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [employerId, title, description, requirements, location, salary_range, employment_type, expiresAt, true]
        );
        
        // Update employer's job count
        await db.query(
            'UPDATE employers SET total_jobs_posted = total_jobs_posted + 1 WHERE user_id = $1',
            [employerId]
        );
        
        res.json({
            success: true,
            message: 'Job posted successfully',
            job: result.rows[0]
        });
        
    } catch (error) {
        console.error('Post job error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ============================================
// GET EMPLOYER'S JOBS
// ============================================
router.get('/jobs/:employerId', async (req, res) => {
    const { employerId } = req.params;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT * FROM jobs WHERE employer_id = $1 ORDER BY posted_at DESC`,
            [employerId]
        );
        
        const subResult = await db.query(
            `SELECT subscription_expiry, is_active, entry_fee_paid FROM employers WHERE user_id = $1`,
            [employerId]
        );
        
        res.json({
            success: true,
            jobs: result.rows,
            subscription: subResult.rows[0] || null
        });
        
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET APPLICATIONS FOR EMPLOYER'S JOBS
// ============================================
router.get('/applications/:employerId', async (req, res) => {
    const { employerId } = req.params;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT ja.*, j.title as job_title, j.location 
             FROM job_applications ja
             JOIN jobs j ON ja.job_id = j.id
             WHERE j.employer_id = $1
             ORDER BY ja.applied_at DESC`,
            [employerId]
        );
        
        res.json({
            success: true,
            applications: result.rows
        });
        
    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// RENEW SUBSCRIPTION
// ============================================
router.post('/renew-subscription', async (req, res) => {
    const { employerId } = req.body;
    const db = req.app.get('db');
    
    try {
        const employerResult = await db.query(
            'SELECT subscription_expiry FROM employers WHERE user_id = $1',
            [employerId]
        );
        
        if (employerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employer not found' });
        }
        
        const currentExpiry = employerResult.rows[0].subscription_expiry;
        let newExpiry;
        
        if (currentExpiry > new Date()) {
            newExpiry = new Date(currentExpiry);
            newExpiry.setMonth(newExpiry.getMonth() + 1);
        } else {
            newExpiry = new Date();
            newExpiry.setMonth(newExpiry.getMonth() + 1);
        }
        
        await db.query(
            `UPDATE employers 
             SET subscription_expiry = $1, is_active = true
             WHERE user_id = $2`,
            [newExpiry, employerId]
        );
        
        res.json({
            success: true,
            message: 'Subscription renewed successfully',
            newExpiry: newExpiry
        });
        
    } catch (error) {
        console.error('Renew subscription error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET SUBSCRIPTION STATUS WITH COUNTDOWN
// ============================================
router.get('/subscription-status/:employerId', async (req, res) => {
    const { employerId } = req.params;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT subscription_expiry, is_active, entry_fee_paid,
                    EXTRACT(EPOCH FROM (subscription_expiry - NOW())) as seconds_left
             FROM employers 
             WHERE user_id = $1`,
            [employerId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employer not found' });
        }
        
        const data = result.rows[0];
        const secondsLeft = parseInt(data.seconds_left) || 0;
        
        res.json({
            success: true,
            subscription: {
                isActive: data.is_active && data.entry_fee_paid && secondsLeft > 0,
                expiryDate: data.subscription_expiry,
                daysLeft: Math.floor(secondsLeft / 86400),
                hoursLeft: Math.floor((secondsLeft % 86400) / 3600),
                minutesLeft: Math.floor((secondsLeft % 3600) / 60),
                secondsLeft: secondsLeft % 60,
                entryFeePaid: data.entry_fee_paid
            }
        });
        
    } catch (error) {
        console.error('Subscription status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;