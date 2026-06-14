const sharp = require('sharp');
const fs = require('fs');

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
            { width: 640, height: 1136 },
            { width: 1536, height: 2048 },
            { width: 1668, height: 2224 },
            { width: 2048, height: 2732 }
        ];
        
        const isScreenshot = screenshotDimensions.some(dim => 
            metadata.width === dim.width && metadata.height === dim.height
        );
        
        const hasCameraData = metadata.exif && metadata.exif.includes('Make');
        
        return {
            isValid: !isScreenshot || hasCameraData,
            isScreenshot: isScreenshot && !hasCameraData,
            metadata: {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                hasExif: !!metadata.exif
            }
        };
    } catch (error) {
        console.error('Photo validation error:', error);
        return {
            isValid: false,
            error: 'Could not validate photo'
        };
    }
}

async function validateFacialScan(filePath, idPhotoPath) {
    try {
        const scanMetadata = await sharp(filePath).metadata();
        
        if (scanMetadata.width < 300 || scanMetadata.height < 300) {
            return {
                isValid: false,
                reason: 'Facial scan image is too small. Please take a closer photo.'
            };
        }
        
        const aspectRatio = scanMetadata.width / scanMetadata.height;
        if (aspectRatio > 1.5) {
            return {
                isValid: false,
                reason: 'Please take a portrait orientation photo of your face.'
            };
        }
        
        return {
            isValid: true,
            confidence: 0.85,
            metadata: {
                width: scanMetadata.width,
                height: scanMetadata.height,
                format: scanMetadata.format
            }
        };
        
    } catch (error) {
        console.error('Facial scan validation error:', error);
        return {
            isValid: false,
            reason: 'Could not validate facial scan'
        };
    }
}

async function validateCertificate(filePath) {
    try {
        const metadata = await sharp(filePath).metadata();
        
        if (metadata.width < 500 || metadata.height < 500) {
            return {
                isValid: false,
                reason: 'Certificate image is too small. Please upload a clearer image.'
            };
        }
        
        return {
            isValid: true,
            metadata: {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format
            }
        };
        
    } catch (error) {
        console.error('Certificate validation error:', error);
        return {
            isValid: false,
            reason: 'Could not validate certificate'
        };
    }
}

function validateKenyanID(idNumber) {
    const kenyanIDRegex = /^\d{8}$/;
    return kenyanIDRegex.test(idNumber);
}

function validatePhoneNumber(phone) {
    const cleaned = phone.replace(/\s/g, '');
    const phoneRegex = /^(07|2547|7)\d{8}$/;
    return phoneRegex.test(cleaned);
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateBusinessRegistration(businessRegNumber) {
    const businessRegex = /^[A-Za-z0-9\/\-]{6,20}$/;
    return businessRegex.test(businessRegNumber);
}

function validatePasswordStrength(password) {
    const checks = {
        hasMinLength: password.length >= 8,
        hasUpperCase: /[A-Z]/.test(password),
        hasLowerCase: /[a-z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    const isValid = Object.values(checks).every(check => check === true);
    const score = Object.values(checks).filter(check => check === true).length;
    
    return {
        isValid,
        score,
        checks
    };
}

function sanitizeInput(input) {
    if (!input) return '';
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = {
    validateOriginalPhoto,
    validateFacialScan,
    validateCertificate,
    validateKenyanID,
    validatePhoneNumber,
    validateEmail,
    validateBusinessRegistration,
    validatePasswordStrength,
    sanitizeInput
};