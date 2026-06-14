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

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'uploads/';
        if (file.fieldname === 'id_photo') folder += 'ids/';
        else if (file.fieldname === 'face_scan') folder += 'facescans/';
        else if (file.fieldname === 'certificate') folder += 'certificates/';
        else if (file.fieldname === 'cv') folder += 'cvs/';
        
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
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

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
            { width: 1080, height: 2400 }
        ];
        const isScreenshot = screenshotDimensions.some(dim => 
            metadata.width === dim.width && metadata.height === dim.height
        );
        return !isScreenshot;
    } catch (error) {
        return false;
    }
}

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

router.post('/verify-id', 
    upload.fields([
        { name: 'id_photo', maxCount: 1 },
        { name: 'face_scan', maxCount: 1 },
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
        
        let idPhotoValid = false;
        let faceScanValid = false;
        
        if (req.files['id_photo']) {
            const idPhotoPath = req.files['id_photo'][0].path;
            idPhotoValid = await validateOriginalPhoto(idPhotoPath);
        }
        
        if (req.files['face_scan']) {
            faceScanValid = true;
        }
        
        const updates = {};
        if (req.files['id_photo']) {
            updates.id_photo_url = req.files['id_photo'][0].path;
            updates.id_photo_original = idPhotoValid;
        }
        if (req.files['face_scan']) {
            updates.face_scan_url = req.files['face_scan'][0].path;
            updates.face_scan_verified = faceScanValid;
        }
        if (req.files['certificate'] && (user.role === 'employer' || user.role === 'service_provider')) {
            updates.business_certificate_url = req.files['certificate'][0].path;
        }
        
        const isVerified = idPhotoValid && faceScanValid;
        
        await db.query(
            `UPDATE users 
             SET id_photo_url = COALESCE($1, id_photo_url),
                 id_photo_original = COALESCE($2, id_photo_original),
                 face_scan_url = COALESCE($3, face_scan_url),
                 face_scan_verified = COALESCE($4, face_scan_verified),
                 business_certificate_url = COALESCE($5, business_certificate_url),
                 is_verified = $6
             WHERE id = $7`,
            [
                updates.id_photo_url || user.id_photo_url,
                updates.id_photo_original !== undefined ? updates.id_photo_original : user.id_photo_original,
                updates.face_scan_url || user.face_scan_url,
                updates.face_scan_verified !== undefined ? updates.face_scan_verified : user.face_scan_verified,
                updates.business_certificate_url || user.business_certificate_url,
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
            message: isVerified ? 'ID verification successful. Awaiting admin approval.' : 'Files uploaded but verification failed. Please upload original ID photo.',
            isVerified,
            idPhotoValid,
            faceScanValid
        });
        
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ success: false, message: 'Error processing verification' });
    }
});

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

module.exports = router;