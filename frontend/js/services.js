// ============================================
// SERVICE PROVIDER JAVASCRIPT
// ============================================

let currentPage = 1;

async function searchServices(page = 1) {
    const category = document.getElementById('serviceCategory')?.value || '';
    const location = document.getElementById('serviceLocation')?.value || '';
    const keyword = document.getElementById('serviceKeyword')?.value || '';
    
    currentPage = page;
    
    showLoading(true);
    
    try {
        const params = new URLSearchParams({ category, location, keyword, page });
        const response = await fetch(`${API_BASE_URL}/api/services/search?${params}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        
        showLoading(false);
        
        if (data.success) {
            displayServices(data.providers);
            displayPagination(data.pagination, page);
            if (document.getElementById('serviceCount')) {
                document.getElementById('serviceCount').innerHTML = data.count || 0;
            }
        } else {
            showToast('Failed to load service providers', 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Search services error:', error);
        showToast('An error occurred', 'error');
    }
}

function displayServices(providers) {
    const container = document.getElementById('servicesContainer');
    if (!container) return;
    
    if (!providers || providers.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">No service providers found matching your criteria.</div>';
        return;
    }
    
    container.innerHTML = providers.map(provider => `
        <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-bottom: 2px solid #e5e7eb;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
                        <h3 style="font-size: 20px; font-weight: 600; color: #1a202c;">${escapeHtml(provider.business_name)}</h3>
                        ${provider.is_featured ? '<span style="background: #f59e0b; color: #78350f; padding: 2px 12px; border-radius: 20px; font-size: 10px; font-weight: 600;">Featured</span>' : ''}
                    </div>
                    <p style="color: #4f46e5; font-size: 14px; margin-bottom: 8px;">${escapeHtml(provider.service_category)}${provider.sub_category ? ' - ' + escapeHtml(provider.sub_category) : ''}</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px;">
                        <span style="font-size: 14px; color: #718096;"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(provider.location)}</span>
                        <span style="font-size: 14px; color: #718096;"><i class="fas fa-tag"></i> ${escapeHtml(provider.price_range || 'Price on request')}</span>
                        <span style="font-size: 14px; color: #718096;"><i class="fas fa-calendar-alt"></i> ${provider.years_experience || 0} years experience</span>
                        <span style="font-size: 14px; color: #718096;"><i class="fas fa-users"></i> ${provider.total_connections || 0} connections</span>
                    </div>
                    <p style="color: #4a5568; margin-bottom: 16px;">${escapeHtml(provider.description)}</p>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <button onclick="connectToProvider('${provider.id}')" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 500;">
                            <i class="fas fa-phone-alt"></i> Connect (KES 100)
                        </button>
                        <button onclick="viewProviderProfile('${provider.id}')" style="background: #6b7280; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 500;">
                            <i class="fas fa-info-circle"></i> View Profile
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function displayPagination(pagination, currentPage) {
    const container = document.getElementById('servicesPagination');
    if (!container) return;
    
    if (!pagination || pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<div style="display: flex; justify-content: center; gap: 8px; margin-top: 24px;">';
    for (let i = 1; i <= pagination.pages; i++) {
        html += `<button onclick="searchServices(${i})" style="padding: 8px 16px; border: 1px solid #e5e7eb; background: ${i === currentPage ? '#2563eb' : 'white'}; color: ${i === currentPage ? 'white' : '#4a5568'}; border-radius: 8px; cursor: pointer; font-weight: 500;">${i}</button>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function connectToProvider(providerId) {
    const user = getCurrentUser();
    if (!user) {
        showToast('Please login to connect with service providers', 'error');
        window.location.href = '/pages/login.html';
        return;
    }
    
    const modal = document.getElementById('connectModal');
    if (modal) {
        document.getElementById('connectProviderId').value = providerId;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

async function submitConnection(event) {
    event.preventDefault();
    
    const user = getCurrentUser();
    const providerId = document.getElementById('connectProviderId').value;
    const seekerName = document.getElementById('seekerName').value;
    const seekerEmail = document.getElementById('seekerEmail').value;
    const seekerPhone = document.getElementById('seekerPhone').value;
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/services/connect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
                providerId,
                seekerId: user.id,
                seeker_name: seekerName,
                seeker_email: seekerEmail,
                seeker_phone: seekerPhone
            })
        });
        
        const data = await response.json();
        showLoading(false);
        
        if (data.success) {
            if (data.already_paid) {
                showProviderDetailsModal(data.provider);
                closeModal('connectModal');
            } else if (data.requires_payment) {
                const phoneNumber = prompt('Enter your M-PESA phone number to pay KES 100:');
                if (phoneNumber && validatePhoneNumber(phoneNumber)) {
                    const payment = await initiateMpesaPayment(
                        phoneNumber,
                        100,
                        'service_connection',
                        user.id,
                        data.metadata
                    );
                    if (payment.success) {
                        showToast('Payment successful! Connecting you with the service provider...', 'success');
                        closeModal('connectModal');
                        setTimeout(() => connectToProvider(providerId), 3000);
                    }
                } else {
                    showToast('Invalid phone number', 'error');
                }
            }
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Connection error:', error);
        showToast('An error occurred', 'error');
    }
}

function showProviderDetailsModal(provider) {
    const modal = document.getElementById('providerDetailsModal');
    const content = document.getElementById('providerDetailsContent');
    
    if (modal && content) {
        content.innerHTML = `
            <h3 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Service Provider Details</h3>
            <div style="margin-bottom: 16px;">
                <p><strong>Business Name:</strong> ${escapeHtml(provider.business_name)}</p>
                <p><strong>Contact Person:</strong> ${escapeHtml(provider.name)}</p>
                <p><strong>Phone:</strong> <a href="tel:${provider.phone}" style="color: #2563eb;">${escapeHtml(provider.phone)}</a></p>
                <p><strong>Email:</strong> <a href="mailto:${provider.email}" style="color: #2563eb;">${escapeHtml(provider.email)}</a></p>
                <p><strong>Location:</strong> ${escapeHtml(provider.location)}</p>
                <p><strong>Description:</strong> ${escapeHtml(provider.description || 'No description provided')}</p>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button onclick="closeModal('providerDetailsModal')" style="background: #6b7280; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 500;">Close</button>
                <a href="tel:${provider.phone}" style="background: #25d366; color: white; text-decoration: none; padding: 10px 20px; border-radius: 10px; display: inline-flex; align-items: center; gap: 8px; font-weight: 500;">
                    <i class="fab fa-whatsapp"></i> Call on WhatsApp
                </a>
            </div>
        `;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

async function viewProviderProfile(providerId) {
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/services/${providerId}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        
        showLoading(false);
        
        if (data.success) {
            const provider = data.provider;
            const modal = document.getElementById('profileModal');
            const content = document.getElementById('profileContent');
            
            if (modal && content) {
                content.innerHTML = `
                    <h3 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">${escapeHtml(provider.business_name)}</h3>
                    <div style="margin-bottom: 16px;">
                        <p><strong>Category:</strong> ${escapeHtml(provider.service_category)}</p>
                        <p><strong>Location:</strong> ${escapeHtml(provider.location)}</p>
                        <p><strong>Experience:</strong> ${provider.years_experience || 0} years</p>
                        <p><strong>Price Range:</strong> ${escapeHtml(provider.price_range || 'Contact for quote')}</p>
                        <p><strong>Description:</strong> ${escapeHtml(provider.description || 'No description provided')}</p>
                        <p><strong>Total Connections:</strong> ${provider.total_connections || 0}</p>
                    </div>
                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button onclick="closeModal('profileModal')" style="background: #6b7280; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 500;">Close</button>
                        <button onclick="closeModal('profileModal'); connectToProvider('${providerId}')" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 500;">
                            <i class="fas fa-phone-alt"></i> Connect (KES 100)
                        </button>
                    </div>
                `;
                modal.classList.remove('hidden');
                modal.classList.add('flex');
            }
        } else {
            showToast('Failed to load provider profile', 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('View profile error:', error);
        showToast('An error occurred', 'error');
    }
}

async function loadServiceCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/services/categories/list`);
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('serviceCategory');
            if (select) {
                const categories = data.categories;
                let options = '<option value="">All Categories</option>';
                categories.forEach(cat => {
                    options += `<option value="${escapeHtml(cat.service_category)}">${escapeHtml(cat.service_category)} (${cat.provider_count})</option>`;
                });
                select.innerHTML = options;
            }
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('services.html')) {
        loadServiceCategories();
        searchServices();
        
        const searchBtn = document.getElementById('searchServicesBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => searchServices());
        }
        
        const searchInput = document.getElementById('serviceKeyword');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchServices();
            });
        }
    }
    
    const connectionForm = document.getElementById('connectionForm');
    if (connectionForm) {
        connectionForm.addEventListener('submit', submitConnection);
    }
});

window.searchServices = searchServices;
window.connectToProvider = connectToProvider;
window.submitConnection = submitConnection;
window.viewProviderProfile = viewProviderProfile;
window.closeModal = closeModal;