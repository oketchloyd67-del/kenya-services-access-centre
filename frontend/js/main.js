const API_BASE_URL = 'https://kenya-services-access-centre.onrender.com';
/**
 * Kenya Services Access Centre
 * Main JavaScript File
 * Shared functions across all pages
 */

// ============================================
// GLOBAL VARIABLES
// ============================================

let authToken = localStorage.getItem('authToken');
let currentUser = null;
let socket = null;

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

function isLoggedIn() {
    return authToken !== null;
}

function getAuthToken() {
    return authToken;
}

function setAuthToken(token) {
    authToken = token;
    localStorage.setItem('authToken', token);
}

function clearAuthToken() {
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
}

function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
        currentUser = JSON.parse(userStr);
        return currentUser;
    }
    return null;
}

function setCurrentUser(user) {
    currentUser = user;
    localStorage.setItem('user', JSON.stringify(user));
}

async function login(email, password) {
    try {
        const response = await fetch('https://kenya-services-access-centre.onrender.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            setAuthToken(data.token);
            setCurrentUser(data.user);
            connectWebSocket(data.user.id);
            showNotification('Login successful!', 'success');
            return { success: true, user: data.user };
        } else {
            showNotification(data.message, 'error');
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('An error occurred during login', 'error');
        return { success: false, message: 'Network error' };
    }
}

function logout() {
    clearAuthToken();
    if (socket) {
        socket.disconnect();
    }
    showNotification('Logged out successfully', 'success');
    window.location.href = '/index.html';
}

// ============================================
// M-PESA PAYMENT FUNCTIONS
// ============================================

async function initiateMpesaPayment(phoneNumber, amount, transactionType, userId, metadata) {
    showLoading(true);
    
    try {
        const response = await fetch('${API_BASE_URL}/api/payments/mpesa/stkpush', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                phoneNumber,
                amount,
                transactionType,
                userId,
                metadata
            })
        });
        
        const result = await response.json();
        showLoading(false);
        
        if (result.success) {
            showNotification('STK Push sent! Check your phone and enter M-PESA PIN.', 'info');
            pollTransactionStatus(result.checkoutRequestID);
            return { success: true, checkoutRequestID: result.checkoutRequestID };
        } else {
            showNotification(result.message, 'error');
            return { success: false, message: result.message };
        }
    } catch (error) {
        showLoading(false);
        console.error('Payment error:', error);
        showNotification('An error occurred while processing payment', 'error');
        return { success: false, message: 'Network error' };
    }
}

async function pollTransactionStatus(checkoutRequestID, maxAttempts = 30, interval = 2000) {
    let attempts = 0;
    
    const intervalId = setInterval(async () => {
        attempts++;
        
        try {
            const response = await fetch(`/api/payments/transaction-status/${checkoutRequestID}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await response.json();
            
            if (data.success && data.transaction) {
                if (data.transaction.status === 'completed') {
                    clearInterval(intervalId);
                    showNotification(`Payment successful! Receipt: ${data.transaction.mpesa_receipt}`, 'success');
                    if (data.transaction.transaction_type === 'employer_registration') {
                        window.location.href = '/pages/employer-dashboard.html';
                    }
                    return { success: true, transaction: data.transaction };
                } else if (data.transaction.status === 'failed') {
                    clearInterval(intervalId);
                    showNotification(`Payment failed: ${data.transaction.result_desc || 'Unknown error'}`, 'error');
                    return { success: false, message: data.transaction.result_desc };
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
        
        if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            showNotification('Payment confirmation timeout. Please check your transaction history.', 'warning');
        }
    }, interval);
}

// ============================================
// WEBHOOK & REAL-TIME NOTIFICATIONS
// ============================================

function connectWebSocket(userId) {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const socketUrl = `${protocol}${window.location.host}`;
    
    socket = io(socketUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5
    });
    
    socket.on('connect', () => {
        console.log('WebSocket connected');
        socket.emit('join', userId);
    });
    
    socket.on('payment_success', (data) => {
        showNotification(`Payment of KES ${data.amount} successful! Receipt: ${data.receipt}`, 'success');
        if (window.location.pathname.includes('employer-dashboard')) {
            location.reload();
        }
    });
    
    socket.on('application_received', (data) => {
        showNotification(`New application received for ${data.jobTitle}`, 'info');
    });
    
    socket.on('admin_notification', (data) => {
        showNotification(data.message, 'warning');
    });
    
    socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
    });
    
    socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
    });
}

// ============================================
// UI FUNCTIONS
// ============================================

function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    if (type === 'info') icon = 'fa-info-circle';
    
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas ${icon}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; margin-left: 8px;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && toast.remove) {
            toast.remove();
        }
    }, 5000);
}

function showLoading(show, message = 'Processing...') {
    let loadingOverlay = document.getElementById('loadingOverlay');
    
    if (show) {
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loadingOverlay';
            loadingOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            `;
            loadingOverlay.innerHTML = `
                <div style="background: white; padding: 24px; border-radius: 12px; text-align: center;">
                    <div class="spinner"></div>
                    <p style="margin-top: 16px; color: #4a5568;" id="loadingMessage">${message}</p>
                </div>
            `;
            document.body.appendChild(loadingOverlay);
        } else {
            const msgEl = document.getElementById('loadingMessage');
            if (msgEl) msgEl.textContent = message;
            loadingOverlay.style.display = 'flex';
        }
    } else {
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
}

// ============================================
// FORM VALIDATION
// ============================================

function validatePhoneNumber(phone) {
    const cleaned = phone.replace(/\s/g, '');
    const phoneRegex = /^(07|2547|7)\d{8}$/;
    return phoneRegex.test(cleaned);
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateKenyanID(idNumber) {
    const idRegex = /^\d{8}$/;
    return idRegex.test(idNumber);
}

function validatePassword(password) {
    return password.length >= 6;
}

// ============================================
// FILE UPLOAD WITH PREVIEW
// ============================================

function setupFileUpload(inputElement, previewElement) {
    if (!inputElement) return;
    
    inputElement.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                if (previewElement) {
                    if (previewElement.tagName === 'IMG') {
                        previewElement.src = event.target.result;
                        previewElement.style.display = 'block';
                    } else {
                        previewElement.innerHTML = `
                            <div style="text-align: center;">
                                <i class="fas fa-file-alt" style="font-size: 24px; color: #a0aec0;"></i>
                                <p style="font-size: 12px; color: #718096; margin-top: 4px;">${file.name}</p>
                            </div>
                        `;
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

// ============================================
// COUNTDOWN TIMER
// ============================================

function startCountdown(expiryDate, elementId, onExpire) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const interval = setInterval(() => {
        const now = new Date().getTime();
        const expiry = new Date(expiryDate).getTime();
        const distance = expiry - now;
        
        if (distance < 0) {
            clearInterval(interval);
            if (onExpire) onExpire();
            if (element) element.innerHTML = 'Expired';
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        let html = '<div style="display: flex; gap: 8px; justify-content: center;">';
        if (days > 0) {
            html += `<div style="text-align: center;"><div style="background: #2d3748; color: white; padding: 8px 12px; border-radius: 8px;">${days}</div><div style="font-size: 10px; margin-top: 4px;">Days</div></div>`;
        }
        html += `
            <div style="text-align: center;"><div style="background: #2d3748; color: white; padding: 8px 12px; border-radius: 8px;">${hours}</div><div style="font-size: 10px; margin-top: 4px;">Hours</div></div>
            <div style="text-align: center;"><div style="background: #2d3748; color: white; padding: 8px 12px; border-radius: 8px;">${minutes}</div><div style="font-size: 10px; margin-top: 4px;">Mins</div></div>
            <div style="text-align: center;"><div style="background: #2d3748; color: white; padding: 8px 12px; border-radius: 8px;">${seconds}</div><div style="font-size: 10px; margin-top: 4px;">Secs</div></div>
        `;
        html += '</div>';
        
        element.innerHTML = html;
    }, 1000);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const user = getCurrentUser();
    if (user) {
        currentUser = user;
        connectWebSocket(user.id);
        
        const navRight = document.querySelector('.nav-right');
        if (navRight) {
            if (user.role === 'employer') {
                navRight.innerHTML = `
                    <a href="/pages/employer-dashboard.html" style="color: #4a5568; text-decoration: none;">Dashboard</a>
                    <button onclick="logout()" style="background: #e53e3e; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Logout</button>
                `;
            } else {
                navRight.innerHTML = `
                    <span style="color: #4a5568;">Welcome, ${user.full_name}</span>
                    <button onclick="logout()" style="background: #e53e3e; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Logout</button>
                `;
            }
        }
    }
});

// Export for global use
window.initiateMpesaPayment = initiateMpesaPayment;
window.showNotification = showNotification;
window.showLoading = showLoading;
window.logout = logout;
window.login = login;
window.validatePhoneNumber = validatePhoneNumber;
window.validateEmail = validateEmail;
window.validateKenyanID = validateKenyanID;
window.validatePassword = validatePassword;
window.setupFileUpload = setupFileUpload;
window.startCountdown = startCountdown;
window.getCurrentUser = getCurrentUser;
window.getAuthToken = getAuthToken;