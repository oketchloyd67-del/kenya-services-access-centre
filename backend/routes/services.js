const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');

router.post('/register', [
    body('userId').isUUID(),
    body('business_name').notEmpty().trim(),
    body('service_category').notEmpty(),
    body('location').notEmpty(),
    body('description').optional(),
    body('price_range').optional()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { userId, business_name, service_category, sub_category, location, lat, lng, description, price_range, years_experience } = req.body;
    const db = req.app.get('db');
    
    try {
        const userResult = await db.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2',
            [userId, 'service_provider']
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Service provider not found' });
        }
        
        const existingResult = await db.query(
            'SELECT * FROM service_providers WHERE user_id = $1',
            [userId]
        );
        
        if (existingResult.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Already registered as service provider' });
        }
        
        await db.query(
            `INSERT INTO service_providers 
             (user_id, business_name, service_category, sub_category, location, lat, lng, description, price_range, years_experience, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [userId, business_name, service_category, sub_category, location, lat, lng, description, price_range, years_experience || 0, true]
        );
        
        res.json({
            success: true,
            message: 'Service provider registration successful. Your profile is now live.'
        });
        
    } catch (error) {
        console.error('Service provider registration error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/search', [
    query('category').optional(),
    query('location').optional(),
    query('keyword').optional()
], async (req, res) => {
    const { category, location, keyword } = req.query;
    const db = req.app.get('db');
    
    try {
        let query = `
            SELECT sp.*, u.full_name, u.phone, u.email, u.is_verified
            FROM service_providers sp
            JOIN users u ON sp.user_id = u.id
            WHERE sp.is_active = true
        `;
        const params = [];
        let paramIndex = 1;
        
        if (category && category !== 'all') {
            query += ` AND sp.service_category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }
        
        if (location) {
            query += ` AND sp.location ILIKE $${paramIndex}`;
            params.push(`%${location}%`);
            paramIndex++;
        }
        
        if (keyword) {
            query += ` AND (sp.business_name ILIKE $${paramIndex} OR sp.description ILIKE $${paramIndex})`;
            params.push(`%${keyword}%`);
            paramIndex++;
        }
        
        query += ` ORDER BY sp.is_featured DESC, sp.total_connections DESC LIMIT 50`;
        
        const result = await db.query(query, params);
        
        const providers = result.rows.map(provider => ({
            id: provider.user_id,
            business_name: provider.business_name,
            service_category: provider.service_category,
            sub_category: provider.sub_category,
            location: provider.location,
            description: provider.description ? provider.description.substring(0, 150) + '...' : 'No description provided',
            price_range: provider.price_range,
            years_experience: provider.years_experience,
            total_connections: provider.total_connections,
            average_rating: provider.average_rating,
            contact_hidden: true,
            message: 'Pay KES 100 to get contact details'
        }));
        
        res.json({
            success: true,
            count: providers.length,
            providers
        });
        
    } catch (error) {
        console.error('Search services error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/connect', [
    body('providerId').isUUID(),
    body('seekerId').isUUID(),
    body('seeker_name').notEmpty(),
    body('seeker_phone').notEmpty(),
    body('seeker_email').isEmail()
], async (req, res) => {
    const { providerId, seekerId, seeker_name, seeker_phone, seeker_email } = req.body;
    const db = req.app.get('db');
    
    try {
        const existingConnection = await db.query(
            `SELECT * FROM service_connections 
             WHERE service_provider_id = $1 AND seeker_phone = $2 AND fee_paid = true`,
            [providerId, seeker_phone]
        );
        
        if (existingConnection.rows.length > 0) {
            const providerResult = await db.query(
                `SELECT sp.*, u.full_name, u.phone, u.email
                 FROM service_providers sp
                 JOIN users u ON sp.user_id = u.id
                 WHERE sp.user_id = $1`,
                [providerId]
            );
            
            return res.json({
                success: true,
                already_paid: true,
                provider: {
                    name: providerResult.rows[0].full_name,
                    phone: providerResult.rows[0].phone,
                    email: providerResult.rows[0].email,
                    business_name: providerResult.rows[0].business_name,
                    location: providerResult.rows[0].location,
                    description: providerResult.rows[0].description
                }
            });
        }
        
        await db.query(
            `INSERT INTO service_connections 
             (service_provider_id, seeker_id, seeker_name, seeker_phone, seeker_email, fee_paid, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [providerId, seekerId, seeker_name, seeker_phone, seeker_email, false, 'pending_payment']
        );
        
        res.json({
            success: true,
            requires_payment: true,
            amount: 100,
            transaction_type: 'service_connection',
            metadata: { providerId, seekerId, seeker_phone, seeker_email, seeker_name }
        });
        
    } catch (error) {
        console.error('Connect to service error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/:providerId', async (req, res) => {
    const { providerId } = req.params;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT sp.*, u.full_name, u.email, u.phone, u.is_verified
             FROM service_providers sp
             JOIN users u ON sp.user_id = u.id
             WHERE sp.user_id = $1 AND sp.is_active = true`,
            [providerId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Service provider not found' });
        }
        
        res.json({
            success: true,
            provider: result.rows[0]
        });
        
    } catch (error) {
        console.error('Get provider error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/categories/list', async (req, res) => {
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT service_category, COUNT(*) as provider_count
             FROM service_providers
             WHERE is_active = true
             GROUP BY service_category
             ORDER BY provider_count DESC`
        );
        
        res.json({
            success: true,
            categories: result.rows
        });
        
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;