const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

// ============================================
// REQUEST PASSWORD RESET - POST /api/password/request-reset
// ============================================
router.post('/request-reset', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { email } = req.body;
    const db = req.app.get('db');
    const emailUtil = require('../utils/email');
    
    try {
        const result = await db.query('SELECT id, full_name FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            // Don't reveal if email exists or not (security)
            return res.json({ success: true, message: 'If your email is registered, you will receive a reset link.' });
        }
        
        const user = result.rows[0];
        
        // Generate reset token (valid for 1 hour)
        const resetToken = jwt.sign(
            { id: user.id, email: email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        // Store token in database
        await db.query(
            `INSERT INTO password_resets (user_id, token, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) DO UPDATE SET token = $2, created_at = NOW()`,
            [user.id, resetToken]
        );
        
        await emailUtil.sendPasswordReset(email, user.full_name, resetToken);
        
        res.json({ success: true, message: 'If your email is registered, you will receive a reset link.' });
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// RESET PASSWORD - POST /api/password/reset
// ============================================
router.post('/reset', [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { token, newPassword } = req.body;
    const db = req.app.get('db');
    
    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if token exists in database
        const tokenCheck = await db.query(
            'SELECT * FROM password_resets WHERE user_id = $1 AND token = $2',
            [decoded.id, token]
        );
        
        if (tokenCheck.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired token' });
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        
        // Update user password
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [passwordHash, decoded.id]
        );
        
        // Delete used token
        await db.query('DELETE FROM password_resets WHERE user_id = $1', [decoded.id]);
        
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(400).json({ success: false, message: 'Invalid or expired token' });
        }
        console.error('Password reset error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;