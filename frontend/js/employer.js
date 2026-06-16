// ============================================
// EMPLOYER DASHBOARD JAVASCRIPT
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
        const response = await fetch(`${API_BASE_URL}/api/employers/subscription-status/${employerId}`, {
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
                    statusElement.innerHTML = '<span style="color: #059669;"><i class="fas fa-check-circle"></i> Active</span>';
                } else {
                    statusElement.innerHTML = '<span style="color: #dc2626;"><i class="fas fa-times-circle"></i> Expired - Please renew</span>';
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
        showToast('Failed to load subscription status', 'error');
    }
}

async function loadEmployerJobs(employerId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/employers/jobs/${employerId}`, {
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
                        <div class="job-card" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid #4f46e5;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div style="flex: 1;">
                                    <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">${escapeHtml(job.title)}</h3>
                                    <p style="color: #718096; margin-bottom: 4px;"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location || 'Location not specified')}</p>
                                    <p style="color: #a0aec0; font-size: 12px;">Posted: ${new Date(job.posted_at).toLocaleDateString()}</p>
                                    <p style="color: #a0aec0; font-size: 12px;">Applications: ${job.applications_count || 0}</p>
                                    <p style="color: #a0aec0; font-size: 12px;">Views: ${job.views_count || 0}</p>
                                </div>
                                <div style="text-align: right;">
                                    <span style="display: inline-block; padding: 4px 8px; border-radius: 20px; font-size: 12px; ${job.is_active ? 'background: #d1fae5; color: #065f46;' : 'background: #fee2e2; color: #991b1b;'}">
                                        ${job.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                    <button onclick="viewJobDetails('${job.id}')" style="display: block; margin-top: 8px; background: none; border: none; color: #4f46e5; cursor: pointer; font-weight: 500;">
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
        showToast('Failed to load jobs', 'error');
    }
}

async function loadApplications(employerId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/employers/applications/${employerId}`, {
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
                        <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 1px solid #e5e7eb;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <p style="font-weight: 600;">${escapeHtml(app.job_seeker_name)}</p>
                                    <p style="font-size: 14px; color: #718096;">Applied for: ${escapeHtml(app.job_title)}</p>
                                    <p style="font-size: 12px; color: #a0aec0;">Applied: ${new Date(app.applied_at).toLocaleString()}</p>
                                </div>
                                <div>
                                    <a href="${app.cv_url}" target="_blank" style="color: #4f46e5; text-decoration: none; font-size: 14px; font-weight: 500;">
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
        showToast('Failed to load applications', 'error');
    }
}

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
        const response = await fetch(`${API_BASE_URL}/api/employers/post-job`, {
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
            showToast('Job posted successfully!', 'success');
            document.getElementById('postJobForm').reset();
            closeModal('postJobModal');
            await loadEmployerJobs(employerId);
        } else {
            showToast(data.message || 'Failed to post job', 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Post job error:', error);
        showToast('An error occurred', 'error');
    }
}

async function renewSubscription() {
    const user = getCurrentUser();
    const phoneNumber = prompt('Enter your M-PESA phone number for payment of KES 300:');
    
    if (!phoneNumber || !validatePhoneNumber(phoneNumber)) {
        showToast('Please enter a valid phone number', 'error');
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
        showToast('Payment initiated. Your subscription will renew upon confirmation.', 'success');
    }
}

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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
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