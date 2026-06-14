const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required. Please log in.' 
            });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token. Please log in again.' 
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Token expired. Please log in again.' 
            });
        }
        
        return res.status(500).json({ 
            success: false, 
            message: 'Authentication error' 
        });
    }
};

const isEmployer = async (req, res, next) => {
    if (req.user.role !== 'employer') {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Employer access required.' 
        });
    }
    next();
};

const isServiceProvider = async (req, res, next) => {
    if (req.user.role !== 'service_provider') {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Service provider access required.' 
        });
    }
    next();
};

const isJobSeeker = async (req, res, next) => {
    if (req.user.role !== 'job_seeker') {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Job seeker access required.' 
        });
    }
    next();
};

const isAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Admin access required.' 
        });
    }
    next();
};

module.exports = {
    authMiddleware,
    isEmployer,
    isServiceProvider,
    isJobSeeker,
    isAdmin
};