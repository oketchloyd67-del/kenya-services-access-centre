const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const createDirectory = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const getStorage = (folder) => {
    const uploadPath = path.join(__dirname, '../../uploads', folder);
    createDirectory(uploadPath);
    
    return multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
            const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    });
};

const imageFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'), false);
    }
};

const documentFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF and DOC files are allowed.'), false);
    }
};

const uploadID = multer({
    storage: getStorage('ids'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFilter
});

const uploadFaceScan = multer({
    storage: getStorage('facescans'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFilter
});

const uploadCertificate = multer({
    storage: getStorage('certificates'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFilter
});

const uploadCV = multer({
    storage: getStorage('cvs'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: documentFilter
});

const uploadMultiple = multer({
    storage: getStorage('misc'),
    limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = {
    uploadID,
    uploadFaceScan,
    uploadCertificate,
    uploadCV,
    uploadMultiple
};