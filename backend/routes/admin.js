const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

// ============================================
// ADMIN MIDDLEWARE
// ============================================
const isAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const db = req.app.get('db');
        
        const result = await db.query(
            'SELECT role FROM users WHERE id = $1 AND is_active = true',
            [decoded.id]
        );
        
        if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
        }
        
        req.adminId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ============================================
// GET PENDING VERIFICATIONS
// ============================================
router.get('/pending-verifications', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(`
            SELECT u.id, u.email, u.phone, u.full_name, u.id_number, u.role, 
                   u.id_photo_url, u.id_photo_back_url, u.business_certificate_url,
                   u.created_at, u.is_verified,
                   e.company_name, e.business_reg_number,
                   sp.business_name as provider_business_name, sp.service_category
            FROM users u
            LEFT JOIN employers e ON u.id = e.user_id
            LEFT JOIN service_providers sp ON u.id = sp.user_id
            WHERE u.is_verified = false 
            AND u.role != 'admin'
            AND u.id_photo_url != 'pending'
            ORDER BY u.created_at DESC
        `);
        
        res.json({
            success: true,
            verifications: result.rows
        });
        
    } catch (error) {
        console.error('Get pending verifications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET SINGLE VERIFICATION DETAILS
// ============================================
router.get('/verification/:userId', isAdmin, async (req, res) => {
    const { userId } = req.params;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(`
            SELECT u.id, u.email, u.phone, u.full_name, u.id_number, u.role, 
                   u.id_photo_url, u.id_photo_back_url, u.business_certificate_url,
                   u.created_at, u.is_verified,
                   e.company_name, e.business_reg_number, e.company_address,
                   sp.business_name as provider_business_name, sp.service_category, 
                   sp.location, sp.description, sp.price_range
            FROM users u
            LEFT JOIN employers e ON u.id = e.user_id
            LEFT JOIN service_providers sp ON u.id = sp.user_id
            WHERE u.id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            verification: result.rows[0]
        });
        
    } catch (error) {
        console.error('Get verification error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// APPROVE OR REJECT VERIFICATION
// ============================================
router.put('/verify-user/:userId', isAdmin, async (req, res) => {
    const { userId } = req.params;
    const { is_verified, rejection_reason } = req.body;
    const db = req.app.get('db');
    const adminId = req.adminId;
    
    try {
        const userResult = await db.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        await db.query(
            `UPDATE users 
             SET is_verified = $1, verified_by = $2, verified_at = NOW()
             WHERE id = $3`,
            [is_verified, adminId, userId]
        );
        
        // If approved, activate employer or service provider account
        if (is_verified) {
            const user = userResult.rows[0];
            
            if (user.role === 'employer') {
                // Check if employer record exists, if not create one
                const employerCheck = await db.query(
                    'SELECT * FROM employers WHERE user_id = $1',
                    [userId]
                );
                
                if (employerCheck.rows.length === 0) {
                    await db.query(
                        `INSERT INTO employers (user_id, company_name, subscription_expiry, entry_fee_paid, is_active)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [userId, user.full_name || 'Company', '2000-01-01', false, true]
                    );
                } else {
                    await db.query(
                        `UPDATE employers SET is_active = true WHERE user_id = $1`,
                        [userId]
                    );
                }
            }
            
            if (user.role === 'service_provider') {
                await db.query(
                    `UPDATE service_providers SET is_active = true WHERE user_id = $1`,
                    [userId]
                );
            }
        }
        
        // Send email notification
        const emailUtil = require('../utils/email');
        if (is_verified) {
            await emailUtil.sendVerificationApproval(userResult.rows[0].email, userResult.rows[0].full_name);
        } else {
            await emailUtil.sendVerificationRejection(userResult.rows[0].email, userResult.rows[0].full_name, rejection_reason || 'Document verification failed');
        }
        
        res.json({
            success: true,
            message: is_verified ? 'User verified successfully' : 'User verification rejected'
        });
        
    } catch (error) {
        console.error('Verify user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET ALL USERS (with pagination)
// ============================================
router.get('/users', isAdmin, async (req, res) => {
    const { page = 1, limit = 20, role, is_verified } = req.query;
    const db = req.app.get('db');
    const offset = (page - 1) * limit;
    
    try {
        let query = `
            SELECT id, email, phone, full_name, role, is_verified, created_at, last_login,
                   id_photo_url, face_scan_url, business_certificate_url, id_number
            FROM users
            WHERE role != 'admin' AND is_active = true
        `;
        const params = [];
        let paramIndex = 1;
        
        if (role) {
            query += ` AND role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        }
        
        if (is_verified !== undefined) {
            query += ` AND is_verified = $${paramIndex}`;
            params.push(is_verified === 'true');
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await db.query(query, params);
        
        const countResult = await db.query(`
            SELECT COUNT(*) FROM users WHERE role != 'admin' AND is_active = true
        `);
        
        res.json({
            success: true,
            users: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
        
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// EXPORT USERS CSV
// ============================================
router.get('/export/users', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(`
            SELECT id, email, phone, full_name, role, is_verified, created_at
            FROM users
            WHERE role != 'admin' AND is_active = true
            ORDER BY created_at DESC
        `);
        
        const headers = ['ID', 'Name', 'Email', 'Phone', 'Role', 'Verified', 'Registered Date'];
        const csvRows = [headers];
        
        for (const row of result.rows) {
            csvRows.push([
                row.id,
                row.full_name,
                row.email,
                row.phone,
                row.role,
                row.is_verified ? 'Yes' : 'No',
                row.created_at
            ]);
        }
        
        const csvContent = csvRows.map(row => row.join(',')).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvContent);
    } catch (error) {
        console.error('Export users error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// EXPORT TRANSACTIONS CSV
// ============================================
router.get('/export/transactions', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(`
            SELECT t.id, t.transaction_type, t.amount, t.status, t.mpesa_receipt, 
                   t.created_at, t.completed_at, u.full_name, u.email, u.phone
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.status = 'completed'
            ORDER BY t.created_at DESC
        `);
        
        const headers = ['Transaction ID', 'Type', 'Amount', 'Status', 'MPESA Receipt', 'Created At', 'Completed At', 'User Name', 'Email', 'Phone'];
        const csvRows = [headers];
        
        for (const row of result.rows) {
            csvRows.push([
                row.id,
                row.transaction_type,
                row.amount,
                row.status,
                row.mpesa_receipt || '',
                row.created_at,
                row.completed_at || '',
                row.full_name || '',
                row.email || '',
                row.phone || ''
            ]);
        }
        
        const csvContent = csvRows.map(row => row.join(',')).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=transactions_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvContent);
    } catch (error) {
        console.error('Export transactions error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// DELETE USER
// ============================================
router.delete('/users/:userId', isAdmin, async (req, res) => {
    const { userId } = req.params;
    const db = req.app.get('db');
    
    try {
        const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        if (user.email === 'admin@kenyaservices.co.ke') {
            return res.status(403).json({ success: false, message: 'Cannot delete the main admin account' });
        }
        
        // Delete related records
        await db.query('DELETE FROM job_applications WHERE job_seeker_id = $1', [userId]);
        await db.query('DELETE FROM job_employer_access WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM service_connections WHERE seeker_id = $1', [userId]);
        await db.query('DELETE FROM reviews WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
        
        const employerCheck = await db.query('SELECT user_id FROM employers WHERE user_id = $1', [userId]);
        if (employerCheck.rows.length > 0) {
            await db.query('DELETE FROM jobs WHERE employer_id = $1', [userId]);
            await db.query('DELETE FROM employers WHERE user_id = $1', [userId]);
        }
        
        const providerCheck = await db.query('SELECT user_id FROM service_providers WHERE user_id = $1', [userId]);
        if (providerCheck.rows.length > 0) {
            await db.query('DELETE FROM service_connections WHERE service_provider_id = $1', [userId]);
            await db.query('DELETE FROM service_providers WHERE user_id = $1', [userId]);
        }
        
        await db.query('DELETE FROM users WHERE id = $1', [userId]);
        
        res.json({ success: true, message: 'User permanently deleted' });
        
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET DASHBOARD STATISTICS
// ============================================
router.get('/dashboard', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const userCounts = await db.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN role = 'employer' THEN 1 END) as employers,
                COUNT(CASE WHEN role = 'job_seeker' THEN 1 END) as job_seekers,
                COUNT(CASE WHEN role = 'service_provider' THEN 1 END) as service_providers,
                COUNT(CASE WHEN is_verified = false AND role != 'admin' THEN 1 END) as pending_verifications
            FROM users
            WHERE is_active = true
        `);
        
        const revenueStats = await db.query(`
            SELECT 
                SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as total_transactions
            FROM transactions
        `);
        
        const activeJobs = await db.query(`
            SELECT COUNT(*) as active_jobs
            FROM jobs j
            JOIN employers e ON j.employer_id = e.user_id
            WHERE j.is_active = true AND e.is_active = true AND e.subscription_expiry > NOW()
        `);
        
        const recentTransactions = await db.query(`
            SELECT t.*, u.full_name, u.email
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.status != 'pending'
            ORDER BY t.created_at DESC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            dashboard: {
                users: userCounts.rows[0],
                revenue: revenueStats.rows[0],
                active_jobs: activeJobs.rows[0].active_jobs,
                recent_transactions: recentTransactions.rows
            }
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET EMPLOYERS
// ============================================
router.get('/employers', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(`
            SELECT e.*, u.full_name, u.email, u.phone, u.is_verified
            FROM employers e
            JOIN users u ON e.user_id = u.id
            WHERE u.is_active = true
            ORDER BY e.created_at DESC
        `);
        
        res.json({
            success: true,
            employers: result.rows
        });
        
    } catch (error) {
        console.error('Get employers error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET SERVICE PROVIDERS
// ============================================
router.get('/service-providers', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(`
            SELECT sp.*, u.full_name, u.email, u.phone, u.is_verified
            FROM service_providers sp
            JOIN users u ON sp.user_id = u.id
            WHERE u.is_active = true
            ORDER BY sp.created_at DESC
        `);
        
        res.json({
            success: true,
            providers: result.rows
        });
        
    } catch (error) {
        console.error('Get service providers error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET ALL JOBS
// ============================================
router.get('/jobs', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(`
            SELECT j.*, e.company_name, u.email as employer_email
            FROM jobs j
            JOIN employers e ON j.employer_id = e.user_id
            JOIN users u ON e.user_id = u.id
            ORDER BY j.posted_at DESC
        `);
        
        res.json({
            success: true,
            jobs: result.rows
        });
        
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET TRANSACTIONS
// ============================================
router.get('/transactions', isAdmin, async (req, res) => {
    const { page = 1, limit = 50, status, transaction_type, start_date, end_date } = req.query;
    const db = req.app.get('db');
    const offset = (page - 1) * limit;
    
    try {
        let query = `
            SELECT t.*, u.full_name, u.email, u.phone
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        if (status) {
            query += ` AND t.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (transaction_type) {
            query += ` AND t.transaction_type = $${paramIndex}`;
            params.push(transaction_type);
            paramIndex++;
        }
        
        if (start_date) {
            query += ` AND t.created_at >= $${paramIndex}`;
            params.push(start_date);
            paramIndex++;
        }
        
        if (end_date) {
            query += ` AND t.created_at <= $${paramIndex}`;
            params.push(end_date + ' 23:59:59');
            paramIndex++;
        }
        
        query += ` ORDER BY t.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await db.query(query, params);
        
        const countResult = await db.query('SELECT COUNT(*) FROM transactions');
        
        res.json({
            success: true,
            transactions: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
        
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// TOGGLE FEATURED SERVICE PROVIDER
// ============================================
router.put('/service-providers/:providerId/feature', isAdmin, async (req, res) => {
    const { providerId } = req.params;
    const { is_featured } = req.body;
    const db = req.app.get('db');
    
    try {
        await db.query(
            `UPDATE service_providers SET is_featured = $1 WHERE user_id = $2`,
            [is_featured, providerId]
        );
        
        res.json({
            success: true,
            message: is_featured ? 'Provider featured' : 'Provider unfeatured'
        });
        
    } catch (error) {
        console.error('Toggle featured error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET PENDING REVIEWS
// ============================================
router.get('/reviews/pending', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(`
            SELECT * FROM reviews 
            WHERE is_approved = false 
            ORDER BY created_at DESC
        `);
        
        res.json({
            success: true,
            reviews: result.rows
        });
        
    } catch (error) {
        console.error('Get pending reviews error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// APPROVE REVIEW
// ============================================
router.put('/reviews/:reviewId', isAdmin, async (req, res) => {
    const { reviewId } = req.params;
    const { is_approved } = req.body;
    const db = req.app.get('db');
    const adminId = req.adminId;
    
    try {
        await db.query(
            `UPDATE reviews 
             SET is_approved = $1, approved_by = $2, approved_at = NOW()
             WHERE id = $3`,
            [is_approved, adminId, reviewId]
        );
        
        res.json({
            success: true,
            message: is_approved ? 'Review approved' : 'Review rejected'
        });
        
    } catch (error) {
        console.error('Review approval error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// GET SETTINGS
// ============================================
router.get('/settings', isAdmin, async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query('SELECT * FROM admin_settings');
        
        const settings = {};
        result.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        
        res.json({
            success: true,
            settings
        });
        
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// UPDATE SETTINGS
// ============================================
router.put('/settings', isAdmin, async (req, res) => {
    const { settings } = req.body;
    const db = req.app.get('db');
    
    try {
        for (const [key, value] of Object.entries(settings)) {
            await db.query(
                `UPDATE admin_settings 
                 SET setting_value = $1, updated_at = NOW(), updated_by = $2
                 WHERE setting_key = $3`,
                [value, req.adminId, key]
            );
        }
        
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
        
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;