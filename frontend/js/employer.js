// Use the existing global variable (don't redeclare)
console.log('API_BASE_URL:', API_BASE_URL);
/**
 * Kenya Services Access Centre
 * Employer Dashboard JavaScript
 */

// ============================================
// LOAD EMPLOYER DASHBOARD
// ============================================

async function loadEmployerDashboard() {
    const user = getCurrentUser();
    if (!user || user.role !== 'employer') {
        window.location.href = '/pages/login.html';
        return;
    }
    
    await loadSubscriptionStatus(user.id);
    await loadEmployerJobs(user.id);
    await loadApplications(user.id);
}

async function loadSubscriptionStatus(employerId) {
    try {
        const response = await fetch(`https://kenyaservices-accesscentre-ly34.onrender.com/api/employers/subscription-status/${employerId}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const sub = data.subscription;
            const statusElement = document.getElementById('subscriptionStatus');
            const timerElement = document.getElementById('subscriptionTimer');
            const renewalBtn = document.getElementById('renewSubscriptionBtn');
            
            if (statusElement) {
                if (sub.isActive) {
                    statusElement.innerHTML = '<span style="color: #38a169;"><i class="fas fa-check-circle"></i> Active</span>';
                } else {
                    statusElement.innerHTML = '<span style="color: #e53e3e;"><i class="fas fa-times-circle"></i> Expired - Please renew</span>';
                }
            }
            
            if (timerElement && sub.isActive && sub.daysLeft >= 0) {
                timerElement.innerHTML = `${sub.daysLeft} days, ${sub.hoursLeft} hours, ${sub.minutesLeft} minutes remaining`;
                startCountdown(sub.expiryDate, 'subscriptionCountdown', () => {
                    loadSubscriptionStatus(employerId);
                });
            } else if (timerElement && !sub.entryFeePaid) {
                timerElement.innerHTML = 'Complete payment to activate subscription';
            }
            
            if (renewalBtn && sub.daysLeft <= 7 && sub.daysLeft > 0) {
                renewalBtn.style.display = 'block';
            } else if (renewalBtn) {
                renewalBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading subscription:', error);
        showNotification('Failed to load subscription status', 'error');
    }
}

async function loadEmployerJobs(employerId) {
    try {
        const response = await fetch(`https://kenyaservices-accesscentre-ly34.onrender.com/api/employers/jobs/${employerId}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const jobsContainer = document.getElementById('jobsList');
            if (jobsContainer) {
                if (data.jobs.length === 0) {
                    jobsContainer.innerHTML = '<div class="text-center py-8 text-gray-500">No jobs posted yet. Click "Post New Job" to get started.</div>';
                } else {
                    jobsContainer.innerHTML = data.jobs.map(job => `
                        <div class="job-card" style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid #6b46c0;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div style="flex: 1;">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">${escapeHtml(job.title)}</h3>
                                    <p style="color: #718096; margin-bottom: 4px;"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location || 'Location not specified')}</p>
                                    <p style="color: #a0aec0; font-size: 12px;">Posted: ${new Date(job.posted_at).toLocaleDateString()}</p>
                                    <p style="color: #a0aec0; font-size: 12px;">Applications: ${job.applications_count || 0}</p>
                                    <p style="color: #a0aec0; font-size: 12px;">Views: ${job.views_count || 0}</p>
                                </div>
                                <div style="text-align: right;">
                                    <span style="display: inline-block; padding: 4px 8px; border-radius: 20px; font-size: 12px; ${job.is_active ? 'background: #c6f6d5; color: #22543d;' : 'background: #fed7d7; color: #742a2a;'}">
                                        ${job.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                    <button onclick="viewJobDetails('${job.id}')" style="display: block; margin-top: 8px; background: none; border: none; color: #6b46c0; cursor: pointer;">
                                        View Details
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (error) {
        console.error('Error loading jobs:', error);
        showNotification('Failed to load jobs', 'error');
    }
}

async function loadApplications(employerId) {
    try {
        const response = await fetch(`/api/employers/applications/${employerId}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const appsContainer = document.getElementById('applicationsList');
            if (appsContainer) {
                if (data.applications.length === 0) {
                    appsContainer.innerHTML = '<div class="text-center py-8 text-gray-500">No applications received yet.</div>';
                } else {
                    appsContainer.innerHTML = data.applications.map(app => `
                        <div style="background: #f7fafc; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <p style="font-weight: 600;">${escapeHtml(app.job_seeker_name)}</p>
                                    <p style="font-size: 14px; color: #718096;">Applied for: ${escapeHtml(app.job_title)}</p>
                                    <p style="font-size: 12px; color: #a0aec0;">Applied: ${new Date(app.applied_at).toLocaleString()}</p>
                                </div>
                                <div>
                                    <a href="${app.cv_url}" target="_blank" style="color: #6b46c0; text-decoration: none; font-size: 14px;">
                                        <i class="fas fa-download"></i> Download CV
                                    </a>
                                </div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (error) {
        console.error('Error loading applications:', error);
        showNotification('Failed to load applications', 'error');
    }
}

// ============================================
// POST NEW JOB
// ============================================

async function postNewJob(event) {
    event.preventDefault();
    
    const employerId = getCurrentUser().id;
    const formData = {
        employerId,
        title: document.getElementById('jobTitle').value,
        description: document.getElementById('jobDescription').value,
        requirements: document.getElementById('jobRequirements').value,
        location: document.getElementById('jobLocation').value,
        salary_range: document.getElementById('salaryRange').value,
        employment_type: document.getElementById('employmentType').value,
        deadline: document.getElementById('deadline').value
    };
    
    showLoading(true);
    
    try {
        const response = await fetch('https://kenyaservices-accesscentre-ly34.onrender.com/api/employers/post-job', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        showLoading(false);
        
        if (data.success) {
            showNotification('Job posted successfully!', 'success');
            document.getElementById('postJobForm').reset();
            closeModal('postJobModal');
            await loadEmployerJobs(employerId);
        } else {
            showNotification(data.message || 'Failed to post job', 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Post job error:', error);
        showNotification('An error occurred', 'error');
    }
}

// ============================================
// RENEW SUBSCRIPTION
// ============================================

async function renewSubscription() {
    const user = getCurrentUser();
    const phoneNumber = prompt('Enter your M-PESA phone number for payment of KES 300:');
    
    if (!phoneNumber || !validatePhoneNumber(phoneNumber)) {
        showNotification('Please enter a valid phone number', 'error');
        return;
    }
    
    const result = await initiateMpesaPayment(
        phoneNumber,
        300,
        'employer_subscription',
        user.id,
        { employerId: user.id }
    );
    
    if (result.success) {
        showNotification('Payment initiated. Your subscription will renew upon confirmation.', 'success');
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function showPostJobModal() {
    const modal = document.getElementById('postJobModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function viewJobDetails(jobId) {
    window.location.href = `/pages/job-details.html?id=${jobId}`;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('employer-dashboard')) {
        loadEmployerDashboard();
        
        const postJobForm = document.getElementById('postJobForm');
        if (postJobForm) {
            postJobForm.addEventListener('submit', postNewJob);
        }
        
        const renewBtn = document.getElementById('renewSubscriptionBtn');
        if (renewBtn) {
            renewBtn.addEventListener('click', renewSubscription);
        }
    }
});

// Export for global use
window.loadEmployerDashboard = loadEmployerDashboard;
window.postNewJob = postNewJob;
window.renewSubscription = renewSubscription;
window.showPostJobModal = showPostJobModal;
window.closeModal = closeModal;
window.viewJobDetails = viewJobDetails;