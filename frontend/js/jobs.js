// TEST ENDPOINT - Remove after debugging
router.get('/test', async (req, res) => {
    try {
        res.json({ success: true, message: 'Jobs API is working' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

// Configure multer for CV uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/cvs/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and DOC files are allowed'));
        }
    }
});

// Email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ============================================
// GET /api/jobs/search - Search jobs
// ============================================
router.get('/search', async (req, res) => {
    const { keyword, location, employment_type } = req.query;
    const db = req.app.get('db');
    
    try {
        console.log('Jobs search called with:', { keyword, location, employment_type });
        
        // Build query
        let query = `
            SELECT j.*, u.full_name as company_name, e.user_id as employer_id
            FROM jobs j
            LEFT JOIN employers e ON j.employer_id = e.user_id
            LEFT JOIN users u ON e.user_id = u.id
            WHERE j.is_active = true
        `;
        const params = [];
        let paramIndex = 1;
        
        if (keyword && keyword.trim() !== '') {
            query += ` AND (j.title ILIKE $${paramIndex} OR j.description ILIKE $${paramIndex})`;
            params.push(`%${keyword}%`);
            paramIndex++;
        }
        
        if (location && location.trim() !== '') {
            query += ` AND j.location ILIKE $${paramIndex}`;
            params.push(`%${location}%`);
            paramIndex++;
        }
        
        if (employment_type && employment_type.trim() !== '') {
            query += ` AND j.employment_type = $${paramIndex}`;
            params.push(employment_type);
            paramIndex++;
        }
        
        query += ` ORDER BY j.posted_at DESC LIMIT 50`;
        
        console.log('Executing query:', query);
        console.log('Params:', params);
        
        const result = await db.query(query, params);
        
        // Format jobs for frontend (hide requirements until payment)
        const jobs = result.rows.map(job => ({
            id: job.id,
            title: job.title,
            description: job.description ? job.description.substring(0, 200) + '...' : 'No description',
            requirements_preview: 'Pay KES 50 to view full requirements',
            location: job.location || 'Remote',
            salary_range: job.salary_range || 'Negotiable',
            employment_type: job.employment_type || 'Full-time',
            company_name: job.company_name || 'Unknown Company',
            posted_at: job.posted_at,
            has_paid_requirements: false
        }));
        
        res.json({
            success: true,
            count: jobs.length,
            jobs: jobs
        });
        
    } catch (error) {
        console.error('Search jobs error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

// ============================================
// POST /api/jobs/view-requirements - Pay KES 50 to view requirements
// ============================================
router.post('/view-requirements', [
    body('jobId').isUUID(),
    body('userId').isUUID()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { jobId, userId } = req.body;
    const db = req.app.get('db');
    
    try {
        console.log('View requirements requested for job:', jobId, 'user:', userId);
        
        // Check if user has already paid for this job
        const existingPayment = await db.query(
            `SELECT * FROM job_applications 
             WHERE job_id = $1 AND job_seeker_id = $2 AND requirements_fee_paid = true`,
            [jobId, userId]
        );
        
        if (existingPayment.rows.length > 0) {
            // Already paid, return requirements
            const jobResult = await db.query(
                `SELECT title, description, requirements, location, salary_range, employment_type 
                 FROM jobs WHERE id = $1`,
                [jobId]
            );
            
            if (jobResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Job not found' });
            }
            
            return res.json({
                success: true,
                already_paid: true,
                requirements: jobResult.rows[0]
            });
        }
        
        // For testing: return requirements without payment
        // In production, this would require payment first
        const jobResult = await db.query(
            `SELECT title, description, requirements, location, salary_range, employment_type 
             FROM jobs WHERE id = $1`,
            [jobId]
        );
        
        if (jobResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        
        // TEMPORARY: Return requirements directly for testing
        res.json({
            success: true,
            already_paid: false,
            requires_payment: true,
            amount: 50,
            transaction_type: 'job_view_requirements',
            metadata: { jobId, userId },
            // For testing, also include requirements directly
            requirements: jobResult.rows[0]
        });
        
    } catch (error) {
        console.error('View requirements error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ============================================
// POST /api/jobs/get-employer-details - Pay KES 100 for employer details
// ============================================
router.post('/get-employer-details', [
    body('jobId').isUUID(),
    body('userId').isUUID()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { jobId, userId } = req.body;
    const db = req.app.get('db');
    
    try {
        // Check if user has already paid
        const existingAccess = await db.query(
            `SELECT * FROM job_employer_access 
             WHERE job_id = $1 AND user_id = $2`,
            [jobId, userId]
        );
        
        if (existingAccess.rows.length > 0) {
            const employerResult = await db.query(
                `SELECT u.full_name, u.email, u.phone, e.company_name, e.company_address
                 FROM jobs j
                 JOIN employers e ON j.employer_id = e.user_id
                 JOIN users u ON e.user_id = u.id
                 WHERE j.id = $1`,
                [jobId]
            );
            
            return res.json({
                success: true,
                already_paid: true,
                employer: employerResult.rows[0]
            });
        }
        
        // TEMPORARY: Return employer details without payment for testing
        const employerResult = await db.query(
            `SELECT u.full_name, u.email, u.phone, e.company_name, e.company_address
             FROM jobs j
             JOIN employers e ON j.employer_id = e.user_id
             JOIN users u ON e.user_id = u.id
             WHERE j.id = $1`,
            [jobId]
        );
        
        res.json({
            success: true,
            requires_payment: true,
            amount: 100,
            transaction_type: 'employer_details',
            metadata: { jobId, userId },
            employer: employerResult.rows[0]  // For testing
        });
        
    } catch (error) {
        console.error('Get employer details error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// POST /api/jobs/apply - Submit job application with CV (KES 50)
// ============================================
router.post('/apply', 
    upload.single('cv'),
    [
        body('jobId').isUUID(),
        body('userId').isUUID(),
        body('job_seeker_name').notEmpty(),
        body('job_seeker_email').isEmail(),
        body('job_seeker_phone').notEmpty()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { jobId, userId, job_seeker_name, job_seeker_email, job_seeker_phone, cover_letter } = req.body;
        const db = req.app.get('db');
        
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'CV file is required' });
            }
            
            // Get job and employer details
            const jobResult = await db.query(
                `SELECT j.*, u.email as employer_email, e.company_name
                 FROM jobs j
                 JOIN employers e ON j.employer_id = e.user_id
                 JOIN users u ON e.user_id = u.id
                 WHERE j.id = $1`,
                [jobId]
            );
            
            if (jobResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Job not found' });
            }
            
            const job = jobResult.rows[0];
            
            // Save application
            const applicationResult = await db.query(
                `INSERT INTO job_applications 
                 (job_id, job_seeker_id, job_seeker_name, job_seeker_email, job_seeker_phone, 
                  cv_url, cover_letter, employer_email, cv_upload_fee_paid)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id`,
                [jobId, userId, job_seeker_name, job_seeker_email, job_seeker_phone, 
                 req.file.path, cover_letter, job.employer_email, false]
            );
            
            res.json({
                success: true,
                requires_payment: true,
                amount: 50,
                transaction_type: 'cv_upload',
                metadata: { 
                    jobId, 
                    userId, 
                    applicationId: applicationResult.rows[0].id,
                    employerEmail: job.employer_email,
                    jobTitle: job.title,
                    applicantName: job_seeker_name,
                    cvPath: req.file.path
                }
            });
            
        } catch (error) {
            console.error('Apply for job error:', error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    }
);

module.exports = router;