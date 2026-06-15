const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// POST /api/reviews - Submit a new review
router.post('/', [
    body('user_name').notEmpty().trim(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').notEmpty().trim(),
    body('entity_type').isIn(['employer', 'service_provider', 'platform'])
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { user_name, rating, comment, entity_type, entity_id } = req.body;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `INSERT INTO reviews (user_name, rating, comment, entity_type, entity_id, is_approved)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [user_name, rating, comment, entity_type, entity_id || null, false]
        );
        
        res.json({ 
            success: true, 
            message: 'Review submitted successfully. Awaiting admin approval.',
            reviewId: result.rows[0].id
        });
    } catch (error) {
        console.error('Error submitting review:', error);
        res.status(500).json({ success: false, message: 'Failed to submit review' });
    }
});

// GET /api/reviews - Get approved reviews
router.get('/', async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT id, user_name, rating, comment, created_at 
             FROM reviews 
             WHERE is_approved = true 
             ORDER BY created_at DESC 
             LIMIT 50`
        );
        
        res.json({ success: true, reviews: result.rows });
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
    }
});

module.exports = router;