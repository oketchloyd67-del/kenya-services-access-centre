const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const cron = require('node-cron');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
}));
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://your-frontend-url.onrender.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    optionsSuccessStatus: 200
}));

// Handle preflight requests explicitly
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(limiter);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false  // Required for Render PostgreSQL
    }
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

const authRoutes = require('./routes/auth');
const employerRoutes = require('./routes/employers');
const jobRoutes = require('./routes/jobs');
const serviceRoutes = require('./routes/services');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');

// List all registered routes (for debugging)
console.log('Registered routes:');
app._router.stack.forEach((r) => {
    if (r.route && r.route.path) {
        console.log(`${Object.keys(r.route.methods)} ${r.route.path}`);
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/employers', employerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    });
}

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

app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong on the server',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`API: http://localhost:${PORT}/api`);
});

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