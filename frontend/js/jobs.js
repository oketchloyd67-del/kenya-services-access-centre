const express = require('express');
const router = express.Router();

// SIMPLE SEARCH - NO DATABASE QUERY FIRST
router.get('/search', async (req, res) => {
    try {
        // First, just return a simple response to test if route works
        console.log('Search endpoint was called');
        
        res.json({
            success: true,
            message: 'Jobs API is working',
            jobs: [],
            count: 0
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// TEST ENDPOINT
router.get('/test', async (req, res) => {
    res.json({ success: true, message: 'Jobs route is working' });
});

module.exports = router;