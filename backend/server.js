const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const cron = require('node-cron');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');

dotenv.config();

// ===== IMPORT ROUTES (MUST BE BEFORE app.use) =====
const authRoutes = require('./routes/auth');
const employerRoutes = require('./routes/employers');
const jobRoutes = require('./routes/jobs');
const serviceRoutes = require('./routes/services');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const reviewRoutes = require('./routes/reviews');

// ===== INITIALIZE APP =====
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: 'https://kenyaservices-accesscentre-emph.onrender.com',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true
    }
});

// ===== RATE LIMITING =====
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

// ===== MANUAL CORS HEADERS (BEFORE ANY ROUTES) =====
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://kenyaservices-accesscentre-emph.onrender.com');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ===== CORS MIDDLEWARE =====
app.use(cors({
    origin: 'https://kenyaservices-accesscentre-emph.onrender.com',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    optionsSuccessStatus: 200
}));

// ===== BODY PARSERS =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(limiter);
app.use('/api/reviews', reviewRoutes);

// ===== STATIC FILES =====
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===== SESSION CONFIGURATION =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ===== DATABASE CONNECTION =====
const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to database:', err.stack);
        process.exit(1);
    } else {
        console.log('Connected to PostgreSQL database');
        release();
    }
});

app.set('db', pool);
app.set('io', io);

// ===== ROUTES =====
app.use('/api/auth', authRoutes);
app.use('/api/employers', employerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// ===== SERVE FRONTEND IN PRODUCTION =====
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    });
}

// ===== CRON JOBS =====
// Delete incomplete employer registrations older than 1 hour
cron.schedule('0 * * * *', async () => {
    try {
        const result = await pool.query(`
            DELETE FROM users 
            WHERE id IN (
                SELECT u.id
                FROM users u
                LEFT JOIN employers e ON u.id = e.user_id
                WHERE u.role = 'employer' 
                AND e.user_id IS NULL
                AND u.created_at < NOW() - INTERVAL '1 hour'
            )
        `);
        if (result.rowCount > 0) {
            console.log(`Cleaned up ${result.rowCount} incomplete employer registrations`);
        }
    } catch (error) {
        console.error('Error cleaning up incomplete registrations:', error);
    }
});

// Check expired subscriptions every hour
cron.schedule('0 * * * *', async () => {
    console.log('Running subscription expiry check...', new Date().toISOString());
    try {
        const expiredEmployers = await pool.query(`
            UPDATE employers 
            SET is_active = false 
            WHERE subscription_expiry < NOW() 
            AND is_active = true
            RETURNING user_id, company_name
        `);
        for (const employer of expiredEmployers.rows) {
            await pool.query(`
                UPDATE jobs 
                SET is_active = false 
                WHERE employer_id = $1 AND is_active = true
            `, [employer.user_id]);
            console.log(`Employer ${employer.company_name} subscription expired`);
        }
    } catch (error) {
        console.error('Error in subscription expiry check:', error);
    }
});

// Clean up pending transactions daily
cron.schedule('0 2 * * *', async () => {
    console.log('Cleaning up old pending transactions...');
    try {
        await pool.query(`
            UPDATE transactions 
            SET status = 'failed' 
            WHERE status = 'pending' 
            AND created_at < NOW() - INTERVAL '24 hours'
        `);
        console.log('Cleaned up old pending transactions');
    } catch (error) {
        console.error('Error cleaning up transactions:', error);
    }
});

// ===== WEB SOCKET CONNECTION =====
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined their room`);
    });
    
    socket.on('join_employer', (employerId) => {
        socket.join(`employer_${employerId}`);
        console.log(`Employer ${employerId} joined their room`);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong on the server',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`API: http://localhost:${PORT}/api`);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        pool.end(() => {
            console.log('Database pool closed');
            process.exit(0);
        });
    });
});

module.exports = { app, pool, io };