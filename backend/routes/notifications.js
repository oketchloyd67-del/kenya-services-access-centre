const express = require('express');
const router = express.Router();

// ============================================
// GET NOTIFICATIONS
// ============================================
router.get('/', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT * FROM notifications 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [userId]
        );
        
        res.json({ success: true, notifications: result.rows });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// MARK NOTIFICATION AS READ
// ============================================
router.put('/:id/read', async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const db = req.app.get('db');
    
    try {
        await db.query(
            `UPDATE notifications SET is_read = true 
             WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// MARK ALL NOTIFICATIONS AS READ
// ============================================
router.put('/read-all', async (req, res) => {
    const userId = req.user?.id;
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const db = req.app.get('db');
    
    try {
        await db.query(
            `UPDATE notifications SET is_read = true 
             WHERE user_id = $1`,
            [userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;