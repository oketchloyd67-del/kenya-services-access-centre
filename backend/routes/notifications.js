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
            `UPDATE notifications SET is_read = true WHERE user_id = $1`,
            [userId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// CREATE NOTIFICATION (Helper Function)
// ============================================
async function createNotification(userId, title, message, type = 'info', metadata = null) {
    const db = req.app?.get('db');
    if (!db) {
        console.error('Database not available for notification');
        return { success: false, error: 'Database not available' };
    }
    
    try {
        const result = await db.query(
            `INSERT INTO notifications (user_id, title, message, type, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id`,
            [userId, title, message, type, metadata ? JSON.stringify(metadata) : null]
        );
        
        // Emit real-time notification via Socket.io
        const io = req.app?.get('io');
        if (io) {
            io.to(`user_${userId}`).emit('new_notification', {
                id: result.rows[0].id,
                title,
                message,
                type,
                created_at: new Date().toISOString()
            });
        }
        
        return { success: true, notificationId: result.rows[0].id };
    } catch (error) {
        console.error('Create notification error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// DELETE NOTIFICATION
// ============================================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const db = req.app.get('db');
    
    try {
        await db.query(
            `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// EXPORT ROUTER AND HELPER
// ============================================
module.exports = router;
module.exports.createNotification = createNotification;