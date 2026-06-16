// ============================================
// KENYA SERVICES ACCESS CENTRE - MAIN JS
// ============================================

// API Configuration
const API_BASE_URL = 'https://kenyaservices-accesscentre-ly34.onrender.com';

// Global variables
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
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            setAuthToken(data.token);
            setCurrentUser(data.user);
            connectWebSocket(data.user.id);
            showToast('Login successful!', 'success');
            return { success: true, user: data.user };
        } else {
            showToast(data.message, 'error');
            return { success: false, message: data.message };
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('An error occurred during login', 'error');
        return { success: false, message: 'Network error' };
    }
}

function logout() {
    clearAuthToken();
    if (socket) {
        socket.disconnect();
    }
    showToast('Logged out successfully', 'success');
    window.location.href = 'login.html';
}

// ============================================
// VERIFICATION FUNCTIONS (Updated for ID front/back only)
// ============================================

async function verifyIdentity(userId, idFrontFile, idBackFile, certificateFile) {
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('id_photo_front', idFrontFile);
    formData.append('id_photo_back', idBackFile);
    if (certificateFile) {
        formData.append('certificate', certificateFile);
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/verify-id`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` },
            body: formData
        });
        
        return await response.json();
    } catch (error) {
        console.error('Verification error:', error);
        return { success: false, message: 'Verification failed' };
    }
}

// ============================================
// M-PESA PAYMENT FUNCTIONS
// ============================================

async function initiateMpesaPayment(phoneNumber, amount, transactionType, userId, metadata) {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/payments/mpesa/stkpush`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
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
            showToast('STK Push sent! Check your phone and enter M-PESA PIN.', 'success');
            pollTransactionStatus(result.checkoutRequestID);
            return { success: true, checkoutRequestID: result.checkoutRequestID };
        } else {
            showToast(result.message, 'error');
            return { success: false, message: result.message };
        }
    } catch (error) {
        showLoading(false);
        console.error('Payment error:', error);
        showToast('An error occurred while processing payment', 'error');
        return { success: false, message: 'Network error' };
    }
}

async function pollTransactionStatus(checkoutRequestID, maxAttempts = 30, interval = 2000) {
    let attempts = 0;
    
    const intervalId = setInterval(async () => {
        attempts++;
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/payments/transaction-status/${checkoutRequestID}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            const data = await response.json();
            
            if (data.success && data.transaction) {
                if (data.transaction.status === 'completed') {
                    clearInterval(intervalId);
                    showToast(`Payment successful! Receipt: ${data.transaction.mpesa_receipt}`, 'success');
                    if (data.transaction.transaction_type === 'employer_registration') {
                        window.location.href = '/pages/employer-dashboard.html';
                    }
                    return { success: true, transaction: data.transaction };
                } else if (data.transaction.status === 'failed') {
                    clearInterval(intervalId);
                    showToast(`Payment failed: ${data.transaction.result_desc || 'Unknown error'}`, 'error');
                    return { success: false, message: data.transaction.result_desc };
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
        
        if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            showToast('Payment confirmation timeout. Please check your transaction history.', 'warning');
        }
    }, interval);
}

// ============================================
// WEBHOOK & REAL-TIME NOTIFICATIONS
// ============================================

function connectWebSocket(userId) {
    if (typeof io === 'undefined') {
        console.log('Socket.io not loaded, skipping WebSocket connection');
        return;
    }
    
    try {
        const backendUrl = API_BASE_URL;
        const socketUrl = backendUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        
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
            showToast(`Payment of KES ${data.amount} successful! Receipt: ${data.receipt}`, 'success');
            if (window.location.pathname.includes('employer-dashboard')) {
                location.reload();
            }
        });
        
        socket.on('application_received', (data) => {
            showToast(`New application received for ${data.jobTitle}`, 'info');
        });
        
        socket.on('admin_notification', (data) => {
            showToast(data.message, 'warning');
        });
        
        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });
        
        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
        });
    } catch (error) {
        console.error('WebSocket setup error:', error);
    }
}

// ============================================
// UI FUNCTIONS
// ============================================

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showLoading(show, message = 'Processing...') {
    let loadingOverlay = document.getElementById('loadingOverlay');
    
    if (show) {
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loadingOverlay';
            loadingOverlay.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]';
            loadingOverlay.innerHTML = `
                <div class="bg-white rounded-2xl p-8 text-center shadow-2xl">
                    <div class="spinner"></div>
                    <p class="mt-4 text-gray-600 font-medium">${message}</p>
                </div>
            `;
            document.body.appendChild(loadingOverlay);
        }
    } else {
        if (loadingOverlay) {
            loadingOverlay.remove();
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
    }
});

// ============================================
// NOTIFICATION SYSTEM
// ============================================

let notificationSocket = null;
let notificationCount = 0;

function initNotifications(userId) {
    if (!userId) return;
    
    // Connect to WebSocket for real-time notifications
    connectWebSocket(userId);
    
    // Load existing notifications
    loadNotifications();
}

async function loadNotifications() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/notifications`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        if (data.success) {
            notificationCount = data.notifications.filter(n => !n.is_read).length;
            updateNotificationBadge();
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (notificationCount > 0) {
            badge.textContent = notificationCount > 99 ? '99+' : notificationCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
        if (!dropdown.classList.contains('hidden')) {
            fetchNotifications();
        }
    }
}

async function fetchNotifications() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/notifications`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        if (data.success) {
            renderNotifications(data.notifications);
        }
    } catch (error) {
        console.error('Error fetching notifications:', error);
    }
}

function renderNotifications(notifications) {
    const container = document.getElementById('notificationList');
    if (!container) return;
    
    if (!notifications || notifications.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-gray-500 text-sm">No notifications</div>';
        return;
    }
    
    container.innerHTML = notifications.slice(0, 10).map(n => `
        <div class="notification-item ${n.is_read ? 'bg-white' : 'bg-blue-50'} border-b border-gray-100 p-3 hover:bg-gray-50 transition cursor-pointer" onclick="markNotificationRead('${n.id}')">
            <div class="flex items-start gap-2">
                <div class="flex-1">
                    <p class="text-sm font-medium text-gray-800">${escapeHtml(n.title)}</p>
                    <p class="text-xs text-gray-500">${escapeHtml(n.message)}</p>
                    <p class="text-xs text-gray-400 mt-1">${new Date(n.created_at).toLocaleString()}</p>
                </div>
                ${!n.is_read ? '<span class="w-2 h-2 bg-blue-500 rounded-full mt-2"></span>' : ''}
            </div>
        </div>
    `).join('');
}

async function markNotificationRead(notificationId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (response.ok) {
            notificationCount = Math.max(0, notificationCount - 1);
            updateNotificationBadge();
            fetchNotifications();
        }
    } catch (error) {
        console.error('Error marking notification read:', error);
    }
}

async function markAllNotificationsRead() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/notifications/read-all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (response.ok) {
            notificationCount = 0;
            updateNotificationBadge();
            fetchNotifications();
        }
    } catch (error) {
        console.error('Error marking all notifications read:', error);
    }
}

// Export for global use
window.API_BASE_URL = API_BASE_URL;
window.initiateMpesaPayment = initiateMpesaPayment;
window.showToast = showToast;
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
window.verifyIdentity = verifyIdentity;