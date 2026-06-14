const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const APP_LOG = path.join(logsDir, 'app.log');
const ERROR_LOG = path.join(logsDir, 'error.log');
const TRANSACTION_LOG = path.join(logsDir, 'transactions.log');
const ACCESS_LOG = path.join(logsDir, 'access.log');

const LOG_LEVELS = {
    INFO: 'INFO',
    ERROR: 'ERROR',
    WARN: 'WARN',
    DEBUG: 'DEBUG',
    TRANSACTION: 'TRANSACTION',
    ACCESS: 'ACCESS'
};

function getTimestamp() {
    return new Date().toISOString();
}

function writeToLog(filePath, level, message, data = null) {
    const timestamp = getTimestamp();
    let logEntry = `[${timestamp}] [${level}] ${message}`;
    
    if (data) {
        if (typeof data === 'object') {
            logEntry += `\n${JSON.stringify(data, null, 2)}`;
        } else {
            logEntry += ` ${data}`;
        }
    }
    logEntry += '\n';
    
    try {
        fs.appendFileSync(filePath, logEntry);
    } catch (error) {
        console.error('Failed to write to log:', error);
    }
    
    if (process.env.NODE_ENV !== 'production') {
        const colors = {
            ERROR: '\x1b[31m',
            WARN: '\x1b[33m',
            INFO: '\x1b[32m',
            DEBUG: '\x1b[36m',
            TRANSACTION: '\x1b[35m',
            ACCESS: '\x1b[34m'
        };
        const color = colors[level] || '\x1b[0m';
        console.log(`${color}[${timestamp}] [${level}] ${message}\x1b[0m`);
    }
}

const logger = {
    info: (message, data = null) => {
        writeToLog(APP_LOG, LOG_LEVELS.INFO, message, data);
    },
    
    error: (message, error = null) => {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            ...(error.response?.data && { response: error.response.data })
        } : null;
        writeToLog(ERROR_LOG, LOG_LEVELS.ERROR, message, errorData);
        writeToLog(APP_LOG, LOG_LEVELS.ERROR, message, errorData);
    },
    
    warn: (message, data = null) => {
        writeToLog(APP_LOG, LOG_LEVELS.WARN, message, data);
    },
    
    debug: (message, data = null) => {
        if (process.env.NODE_ENV === 'development') {
            writeToLog(APP_LOG, LOG_LEVELS.DEBUG, message, data);
        }
    },
    
    transaction: (transactionData) => {
        writeToLog(TRANSACTION_LOG, LOG_LEVELS.TRANSACTION, 'Transaction Record', transactionData);
    },
    
    access: (req, res, responseTime) => {
        const accessData = {
            method: req.method,
            url: req.url,
            ip: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress,
            userAgent: req.headers['user-agent'],
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            userId: req.user?.id || 'anonymous'
        };
        writeToLog(ACCESS_LOG, LOG_LEVELS.ACCESS, `${req.method} ${req.url}`, accessData);
    }
};

function requestLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const responseTime = Date.now() - start;
        logger.access(req, res, responseTime);
    });
    
    next();
}

function getLogs(logType = 'app', lines = 100) {
    let logPath;
    switch(logType) {
        case 'error':
            logPath = ERROR_LOG;
            break;
        case 'transaction':
            logPath = TRANSACTION_LOG;
            break;
        case 'access':
            logPath = ACCESS_LOG;
            break;
        default:
            logPath = APP_LOG;
    }
    
    try {
        if (!fs.existsSync(logPath)) {
            return { success: true, logs: [], message: 'Log file not found' };
        }
        
        const content = fs.readFileSync(logPath, 'utf8');
        const logLines = content.split('\n').filter(line => line.trim());
        const recentLogs = logLines.slice(-lines);
        
        const parsedLogs = recentLogs.map(line => {
            const match = line.match(/\[(.*?)\] \[(.*?)\] (.*)/);
            if (match) {
                return {
                    timestamp: match[1],
                    level: match[2],
                    message: match[3]
                };
            }
            return { raw: line };
        });
        
        return { success: true, logs: parsedLogs };
    } catch (error) {
        logger.error('Failed to read logs', error);
        return { success: false, error: error.message };
    }
}

function clearLogs(logType = 'app') {
    let logPath;
    switch(logType) {
        case 'error':
            logPath = ERROR_LOG;
            break;
        case 'transaction':
            logPath = TRANSACTION_LOG;
            break;
        case 'access':
            logPath = ACCESS_LOG;
            break;
        default:
            logPath = APP_LOG;
    }
    
    try {
        fs.writeFileSync(logPath, '');
        logger.info(`Cleared ${logType} logs`);
        return { success: true, message: `Cleared ${logType} logs` };
    } catch (error) {
        logger.error('Failed to clear logs', error);
        return { success: false, error: error.message };
    }
}

function getLogStats() {
    const stats = {};
    const logFiles = {
        app: APP_LOG,
        error: ERROR_LOG,
        transaction: TRANSACTION_LOG,
        access: ACCESS_LOG
    };
    
    for (const [name, filePath] of Object.entries(logFiles)) {
        try {
            if (fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                stats[name] = {
                    size: stat.size,
                    sizeFormatted: (stat.size / 1024).toFixed(2) + ' KB',
                    modified: stat.mtime
                };
            } else {
                stats[name] = { size: 0, sizeFormatted: '0 KB', modified: null };
            }
        } catch (error) {
            stats[name] = { error: error.message };
        }
    }
    
    return stats;
}

function rotateLogsIfNeeded() {
    const maxSize = 10 * 1024 * 1024;
    const logFiles = [APP_LOG, ERROR_LOG, TRANSACTION_LOG, ACCESS_LOG];
    
    for (const logPath of logFiles) {
        try {
            if (fs.existsSync(logPath)) {
                const stat = fs.statSync(logPath);
                if (stat.size > maxSize) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupPath = logPath.replace('.log', `-${timestamp}.log`);
                    fs.renameSync(logPath, backupPath);
                    fs.writeFileSync(logPath, '');
                    logger.info(`Log rotated: ${path.basename(logPath)} -> ${path.basename(backupPath)}`);
                }
            }
        } catch (error) {
            console.error('Log rotation error:', error);
        }
    }
}

setInterval(rotateLogsIfNeeded, 60 * 60 * 1000);

module.exports = {
    logger,
    requestLogger,
    getLogs,
    clearLogs,
    getLogStats,
    LOG_LEVELS
};