const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('Email configuration error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

async function sendEmail(to, subject, html, attachments = []) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || `"Kenya Services Access Centre" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
            attachments
        };
        
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Email send error:', error);
        return { success: false, error: error.message };
    }
}

async function sendVerificationApproval(email, name) {
    const subject = 'Account Verified - Kenya Services Access Centre';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">Welcome to Kenya Services Access Centre!</h2>
            <p>Dear ${name},</p>
            <p>We are pleased to inform you that your account has been <strong style="color: green;">verified and approved</strong>.</p>
            <p>You can now:</p>
            <ul>
                <li>Post jobs (if you're an employer)</li>
                <li>Apply for jobs (if you're a job seeker)</li>
                <li>Offer your services (if you're a service provider)</li>
            </ul>
            <p>Click the button below to log in to your account:</p>
            <a href="${process.env.FRONTEND_URL}/pages/login.html" 
               style="display: inline-block; background-color: #4a5568; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                Login to Your Account
            </a>
            <p>Thank you for choosing Kenya Services Access Centre!</p>
            <hr>
            <p style="font-size: 12px; color: #718096;">If you have any questions, contact us on WhatsApp: ${process.env.ADMIN_WHATSAPP_NUMBERS}</p>
        </div>
    `;
    
    return await sendEmail(email, subject, html);
}

async function sendVerificationRejection(email, name, reason) {
    const subject = 'Account Verification Update - Kenya Services Access Centre';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">Account Verification Update</h2>
            <p>Dear ${name},</p>
            <p>We regret to inform you that your account verification could not be approved at this time.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Please upload valid, original documents and try again. Your ID photo must be an original photo, not a screenshot.</p>
            <a href="${process.env.FRONTEND_URL}/pages/login.html" 
               style="display: inline-block; background-color: #4a5568; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                Retry Verification
            </a>
            <p>If you believe this is an error, please contact our support team.</p>
            <hr>
            <p style="font-size: 12px; color: #718096;">WhatsApp Support: ${process.env.ADMIN_WHATSAPP_NUMBERS}</p>
        </div>
    `;
    
    return await sendEmail(email, subject, html);
}

async function sendApplicationNotification(employerEmail, jobTitle, applicantName, cvUrl) {
    const subject = `New Job Application: ${jobTitle}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">New Application Received!</h2>
            <p><strong>Job Title:</strong> ${jobTitle}</p>
            <p><strong>Applicant Name:</strong> ${applicantName}</p>
            <p><strong>Application Date:</strong> ${new Date().toLocaleString()}</p>
            <p>The applicant has uploaded their CV. You can view it in the attachment or download it from your employer dashboard.</p>
            <a href="${process.env.FRONTEND_URL}/pages/employer-dashboard.html" 
               style="display: inline-block; background-color: #4a5568; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                View All Applications
            </a>
            <hr>
            <p style="font-size: 12px; color: #718096;">Kenya Services Access Centre - Connecting Talent with Opportunity</p>
        </div>
    `;
    
    const attachments = [];
    if (cvUrl) {
        attachments.push({
            filename: `CV_${applicantName.replace(/\s/g, '_')}.pdf`,
            path: cvUrl
        });
    }
    
    return await sendEmail(employerEmail, subject, html, attachments);
}

async function sendWelcomeEmail(email, name, role) {
    let roleMessage = '';
    switch(role) {
        case 'employer':
            roleMessage = 'Post jobs and find qualified candidates.';
            break;
        case 'job_seeker':
            roleMessage = 'Find your dream job and apply with ease.';
            break;
        case 'service_provider':
            roleMessage = 'Offer your services and connect with customers.';
            break;
        default:
            roleMessage = 'Access all our services.';
    }
    
    const subject = 'Welcome to Kenya Services Access Centre';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">Welcome to Kenya Services Access Centre, ${name}!</h2>
            <p>Thank you for joining our platform. We're excited to have you on board!</p>
            <p>As a ${role.replace('_', ' ')}, you can:</p>
            <ul>
                <li>${roleMessage}</li>
                <li>Connect with verified users</li>
                <li>Access secure M-PESA payments</li>
            </ul>
            <p>To get started, please complete your verification by uploading your ID and taking a facial scan.</p>
            <a href="${process.env.FRONTEND_URL}/pages/login.html" 
               style="display: inline-block; background-color: #4a5568; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                Complete Verification
            </a>
            <p>If you need any assistance, our support team is just a WhatsApp message away.</p>
            <hr>
            <p style="font-size: 12px; color: #718096;">WhatsApp Support: ${process.env.ADMIN_WHATSAPP_NUMBERS}</p>
        </div>
    `;
    
    return await sendEmail(email, subject, html);
}

async function sendPaymentConfirmation(email, name, amount, transactionType, receipt) {
    const subject = 'Payment Confirmation - Kenya Services Access Centre';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">Payment Successful!</h2>
            <p>Dear ${name},</p>
            <p>Your payment of <strong>KES ${amount}</strong> for <strong>${transactionType.replace(/_/g, ' ')}</strong> has been completed successfully.</p>
            <p><strong>Transaction Details:</strong></p>
            <ul>
                <li>Amount: KES ${amount}</li>
                <li>Type: ${transactionType.replace(/_/g, ' ')}</li>
                <li>MPESA Receipt: ${receipt}</li>
                <li>Date: ${new Date().toLocaleString()}</li>
            </ul>
            <a href="${process.env.FRONTEND_URL}" 
               style="display: inline-block; background-color: #4a5568; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                Continue to Dashboard
            </a>
            <hr>
            <p style="font-size: 12px; color: #718096;">Thank you for using Kenya Services Access Centre</p>
        </div>
    `;
    
    return await sendEmail(email, subject, html);
}

async function sendPasswordReset(email, name, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/pages/reset-password.html?token=${resetToken}`;
    const subject = 'Password Reset Request - Kenya Services Access Centre';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">Password Reset Request</h2>
            <p>Dear ${name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" 
               style="display: inline-block; background-color: #4a5568; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                Reset Password
            </a>
            <p>This link will expire in 1 hour.</p>
            <p>If you did not request this, please ignore this email.</p>
            <hr>
            <p style="font-size: 12px; color: #718096;">Kenya Services Access Centre</p>
        </div>
    `;
    
    return await sendEmail(email, subject, html);
}

// Send connection notification to service provider
async function sendConnectionNotification(providerEmail, seekerName, seekerPhone, seekerEmail) {
    const subject = 'New Client Connection - Kenya Services Access Centre';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">New Client Connection!</h2>
            <p>A client has connected with you through Kenya Services Access Centre.</p>
            <p><strong>Client Name:</strong> ${seekerName}</p>
            <p><strong>Client Phone:</strong> ${seekerPhone}</p>
            <p><strong>Client Email:</strong> ${seekerEmail}</p>
            <p>Please reach out to them at your earliest convenience.</p>
            <hr>
            <p style="font-size: 12px; color: #718096;">Kenya Services Access Centre</p>
        </div>
    `;
    return await sendEmail(providerEmail, subject, html);
}

// ============================================
// SEND PASSWORD RESET EMAIL
// ============================================
async function sendPasswordReset(email, name, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/pages/reset-password.html?token=${resetToken}`;
    const subject = 'Password Reset - Kenya Services Access Centre';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">Password Reset Request</h2>
            <p>Dear ${name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" 
               style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                Reset Password
            </a>
            <p>This link will expire in 1 hour.</p>
            <p>If you did not request this, please ignore this email.</p>
            <hr>
            <p style="font-size: 12px; color: #718096;">Kenya Services Access Centre</p>
        </div>
    `;
    return await sendEmail(email, subject, html);
}

// ============================================
// SEND APPLICATION STATUS UPDATE
// ============================================
async function sendApplicationStatusUpdate(email, name, status) {
    const statusMessages = {
        accepted: 'Congratulations! Your application has been accepted. The employer will contact you shortly.',
        rejected: 'We regret to inform you that your application was not selected at this time.'
    };
    
    const subject = `Application ${status.charAt(0).toUpperCase() + status.slice(1)} - Kenya Services Access Centre`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4a5568;">Application Update</h2>
            <p>Dear ${name},</p>
            <p>Your job application has been <strong>${status}</strong>.</p>
            <p>${statusMessages[status] || 'Please check your dashboard for more details.'}</p>
            <a href="${process.env.FRONTEND_URL}/pages/jobseeker-dashboard.html" 
               style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
                View Dashboard
            </a>
            <hr>
            <p style="font-size: 12px; color: #718096;">Kenya Services Access Centre</p>
        </div>
    `;
    return await sendEmail(email, subject, html);
}

// Export the new functions
module.exports = {
    sendEmail,
    sendVerificationApproval,
    sendVerificationRejection,
    sendApplicationNotification,
    sendWelcomeEmail,
    sendPaymentConfirmation,
    sendPasswordReset,
    sendApplicationStatusUpdate,
    sendConnectionNotification
};

module.exports = {
    sendEmail,
    sendVerificationApproval,
    sendVerificationRejection,
    sendApplicationNotification,
    sendWelcomeEmail,
    sendPaymentConfirmation,
    sendPasswordReset
};