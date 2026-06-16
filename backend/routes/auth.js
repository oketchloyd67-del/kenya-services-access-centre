const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// ============================================
// MULTER CONFIGURATION
// ============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'uploads/';
        if (file.fieldname === 'id_photo_front' || file.fieldname === 'id_photo_back') {
            folder += 'ids/';
        } else if (file.fieldname === 'certificate') {
            folder += 'certificates/';
        }
        
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
        }
        cb(null, folder);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const pdfTypes = ['application/pdf'];
    
    if (file.fieldname === 'certificate') {
        if (pdfTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Business certificate must be a PDF file'), false);
        }
    } else if (imageTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

// ============================================
// VALIDATE ORIGINAL PHOTO
// ============================================
async function validateOriginalPhoto(filePath) {
    try {
        const metadata = await sharp(filePath).metadata();
        const screenshotDimensions = [
            { width: 1080, height: 1920 },
            { width: 1170, height: 2532 },
            { width: 828, height: 1792 },
            { width: 1125, height: 2436 },
            { width: 1242, height: 2688 },
            { width: 720, height: 1280 },
            { width: 1440, height: 2560 },
            { width: 1080, height: 2400 },
            { width: 750, height: 1334 },
            { width: 640, height: 1136 }
        ];
        const isScreenshot = screenshotDimensions.some(dim => 
            metadata.width === dim.width && metadata.height === dim.height
        );
        return !isScreenshot;
    } catch (error) {
        return false;
    }
}

// ============================================
// REGISTER USER
// ============================================
router.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('phone').matches(/^[0-9]{10,12}$/),
    body('full_name').notEmpty().trim(),
    body('id_number').notEmpty(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['employer', 'job_seeker', 'service_provider'])
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { email, phone, full_name, id_number, password, role } = req.body;
    const db = req.app.get('db');
    
    try {
        const existingUser = await db.query(
            'SELECT id FROM users WHERE email = $1 OR phone = $2',
            [email, phone]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email or phone already exists' 
            });
        }
        
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        const result = await db.query(
            `INSERT INTO users (email, phone, full_name, id_number, password_hash, role, id_photo_url, face_scan_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, email, phone, full_name, role`,
            [email, phone, full_name, id_number, passwordHash, role, 'pending', 'pending']
        );
        
        const user = result.rows[0];
        
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: 'Registration successful. Please complete ID verification.',
            user,
            token
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

// ============================================
// VERIFY ID (ID front/back + certificate PDF only)
// ============================================
router.post('/verify-id', 
    upload.fields([
        { name: 'id_photo_front', maxCount: 1 },
        { name: 'id_photo_back', maxCount: 1 },
        { name: 'certificate', maxCount: 1 }
    ]),
    async (req, res) => {
    const { userId } = req.body;
    const db = req.app.get('db');
    
    try {
        const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        let idFrontValid = false;
        let idBackValid = false;
        
        if (req.files['id_photo_front']) {
            const idFrontPath = req.files['id_photo_front'][0].path;
            idFrontValid = await validateOriginalPhoto(idFrontPath);
        }
        
        if (req.files['id_photo_back']) {
            const idBackPath = req.files['id_photo_back'][0].path;
            idBackValid = await validateOriginalPhoto(idBackPath);
        }
        
        const updates = {};
        if (req.files['id_photo_front']) {
            updates.id_photo_front_url = req.files['id_photo_front'][0].path;
        }
        if (req.files['id_photo_back']) {
            updates.id_photo_back_url = req.files['id_photo_back'][0].path;
        }
        if (req.files['certificate']) {
            updates.business_certificate_url = req.files['certificate'][0].path;
        }
        
        const hasFrontId = !!req.files['id_photo_front'];
        const hasBackId = !!req.files['id_photo_back'];
        const hasCertificate = !!req.files['certificate'];
        
        const requiresCertificate = (user.role === 'employer' || user.role === 'service_provider');
        const isVerified = hasFrontId && hasBackId && idFrontValid && idBackValid && 
                          (requiresCertificate ? hasCertificate : true);
        
        await db.query(
            `UPDATE users 
             SET id_photo_url = COALESCE($1, id_photo_url),
                 id_photo_back_url = COALESCE($2, id_photo_back_url),
                 business_certificate_url = COALESCE($3, business_certificate_url),
                 id_photo_original = $4,
                 is_verified = $5
             WHERE id = $6`,
            [
                updates.id_photo_front_url || user.id_photo_url,
                updates.id_photo_back_url || null,
                updates.business_certificate_url || user.business_certificate_url,
                idFrontValid && idBackValid,
                isVerified,
                userId
            ]
        );
        
        if (user.role === 'employer' && isVerified) {
            const io = req.app.get('io');
            io.emit('admin_notification', {
                type: 'employer_verification',
                message: `Employer ${user.full_name} has completed verification and is awaiting approval`,
                userId: userId
            });
        }
        
        res.json({
            success: true,
            message: isVerified ? 'ID verification successful. Awaiting admin approval.' : 'Files uploaded but verification failed. Please upload original ID photos.',
            isVerified,
            idFrontValid,
            idBackValid,
            hasFrontId,
            hasBackId,
            hasCertificate
        });
        
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ success: false, message: 'Error processing verification' });
    }
});

// ============================================
// LOGIN
// ============================================
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { email, password } = req.body;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        
        let employerInfo = null;
        if (user.role === 'employer') {
            const employerResult = await db.query(
                'SELECT subscription_expiry, is_active, entry_fee_paid FROM employers WHERE user_id = $1',
                [user.id]
            );
            if (employerResult.rows.length > 0) {
                employerInfo = employerResult.rows[0];
            }
        }
        
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                full_name: user.full_name,
                role: user.role,
                is_verified: user.is_verified,
                employerInfo
            },
            token
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// ============================================
// GET USER PROFILE
// ============================================
router.get('/profile/:userId', async (req, res) => {
    const { userId } = req.params;
    const db = req.app.get('db');
    
    try {
        const result = await db.query(
            `SELECT id, email, phone, full_name, role, is_verified, created_at 
             FROM users WHERE id = $1`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, user: result.rows[0] });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// EXPORT ROUTER
// ============================================
module.exports = router;