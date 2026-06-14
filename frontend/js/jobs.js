/**
 * Kenya Services Access Centre
 * Job Search and Application JavaScript
 */

// ============================================
// GLOBAL VARIABLES
// ============================================

let currentJobs = [];
let currentFilters = {};
let currentPage = 1;

// ============================================
// SEARCH JOBS
// ============================================

async function searchJobs(page = 1) {
    const keyword = document.getElementById('searchKeyword')?.value || '';
    const location = document.getElementById('searchLocation')?.value || '';
    const employmentType = document.getElementById('employmentType')?.value || '';
    
    currentFilters = { keyword, location, employmentType, page };
    currentPage = page;
    
    showLoading(true);
    
    try {
        const params = new URLSearchParams({
            keyword,
            location,
            employment_type: employmentType,
            page
        });
        
        const response = await fetch(`http://localhost:5000/api/jobs/search?${params}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        
        showLoading(false);
        
        if (data.success) {
            currentJobs = data.jobs;
            displayJobs(data.jobs);
            displayPagination(data.pagination, page);
        } else {
            showNotification('Failed to load jobs', 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Search jobs error:', error);
        showNotification('An error occurred', 'error');
    }
}

function displayJobs(jobs) {
    const container = document.getElementById('jobsContainer');
    if (!container) return;
    
    if (jobs.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">No jobs found matching your criteria.</div>';
        return;
    }
    
    container.innerHTML = jobs.map(job => `
        <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid #6b46c0;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap;">
                <div style="flex: 1;">
                    <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">${escapeHtml(job.title)}</h3>
                    <p style="color: #6b46c0; font-weight: 500; margin-bottom: 8px;">${escapeHtml(job.company_name)}</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px;">
                        <span style="font-size: 14px; color: #718096;"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location || 'Remote')}</span>
                        <span style="font-size: 14px; color: #718096;"><i class="fas fa-money-bill-wave"></i> ${escapeHtml(job.salary_range || 'Negotiable')}</span>
                        <span style="font-size: 14px; color: #718096;"><i class="fas fa-briefcase"></i> ${escapeHtml(job.employment_type || 'Full-time')}</span>
                    </div>
                    <p style="color: #4a5568; margin-bottom: 16px;">${escapeHtml(job.description)}</p>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <button onclick="viewRequirements('${job.id}')" style="background: #3182ce; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                            View Requirements (KES 50)
                        </button>
                        <button onclick="getEmployerDetails('${job.id}')" style="background: #6b46c0; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                            Get Employer Details (KES 100)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function displayPagination(pagination, currentPage) {
    const container = document.getElementById('jobsPagination');
    if (!container) return;
    
    if (!pagination || pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<div style="display: flex; justify-content: center; gap: 8px; margin-top: 24px;">';
    for (let i = 1; i <= pagination.pages; i++) {
        html += `<button onclick="searchJobs(${i})" style="padding: 8px 12px; border: 1px solid #e2e8f0; background: ${i === currentPage ? '#6b46c0' : 'white'}; color: ${i === currentPage ? 'white' : '#4a5568'}; border-radius: 6px; cursor: pointer;">${i}</button>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

// ============================================
// VIEW REQUIREMENTS (PAY KES 50)
// ============================================

async function viewRequirements(jobId) {
    const user = getCurrentUser();
    if (!user) {
        showNotification('Please login to view job requirements', 'warning');
        window.location.href = '/pages/login.html';
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('http://localhost:5000/api/jobs/view-requirements', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ jobId, userId: user.id })
        });
        
        const data = await response.json();
        showLoading(false);
        
        if (data.success) {
            if (data.already_paid) {
                showRequirementsModal(data.requirements);
            } else if (data.requires_payment) {
                const phoneNumber = prompt('Enter your M-PESA phone number to pay KES 50:');
                if (phoneNumber && validatePhoneNumber(phoneNumber)) {
                    const payment = await initiateMpesaPayment(
                        phoneNumber, 50, 'job_view_requirements', user.id, { jobId, userId: user.id }
                    );
                    if (payment.success) {
                        showNotification('Payment successful! Viewing requirements...', 'success');
                        setTimeout(() => viewRequirements(jobId), 3000);
                    }
                } else {
                    showNotification('Invalid phone number', 'error');
                }
            }
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('View requirements error:', error);
        showNotification('An error occurred', 'error');
    }
}

function showRequirementsModal(requirements) {
    const modal = document.getElementById('requirementsModal');
    const content = document.getElementById('requirementsContent');
    
    if (modal && content) {
        content.innerHTML = `
            <h3 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">${escapeHtml(requirements.title)}</h3>
            <div style="margin-bottom: 16px;">
                <p style="font-weight: 600;">Description:</p>
                <p style="color: #4a5568;">${escapeHtml(requirements.description)}</p>
            </div>
            <div style="margin-bottom: 16px;">
                <p style="font-weight: 600;">Requirements:</p>
                <p style="color: #4a5568;">${escapeHtml(requirements.requirements)}</p>
            </div>
            <div style="margin-bottom: 16px;">
                <p><strong>Location:</strong> ${escapeHtml(requirements.location || 'Not specified')}</p>
                <p><strong>Salary:</strong> ${escapeHtml(requirements.salary_range || 'Negotiable')}</p>
                <p><strong>Employment Type:</strong> ${escapeHtml(requirements.employment_type || 'Full-time')}</p>
            </div>
            <button onclick="closeModal('requirementsModal')" style="background: #6b46c0; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">Close</button>
        `;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

// ============================================
// GET EMPLOYER DETAILS (PAY KES 100)
// ============================================

async function getEmployerDetails(jobId) {
    const user = getCurrentUser();
    if (!user) {
        showNotification('Please login to get employer details', 'warning');
        window.location.href = '/pages/login.html';
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('http://localhost:5000/api/jobs/get-employer-details', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ jobId, userId: user.id })
        });
        
        const data = await response.json();
        showLoading(false);
        
        if (data.success) {
            if (data.already_paid) {
                showEmployerModal(data.employer);
            } else if (data.requires_payment) {
                const phoneNumber = prompt('Enter your M-PESA phone number to pay KES 100:');
                if (phoneNumber && validatePhoneNumber(phoneNumber)) {
                    const payment = await initiateMpesaPayment(
                        phoneNumber, 100, 'employer_details', user.id, { jobId, userId: user.id }
                    );
                    if (payment.success) {
                        showNotification('Payment successful! Fetching employer details...', 'success');
                        setTimeout(() => getEmployerDetails(jobId), 3000);
                    }
                } else {
                    showNotification('Invalid phone number', 'error');
                }
            }
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Get employer details error:', error);
        showNotification('An error occurred', 'error');
    }
}

function showEmployerModal(employer) {
    const modal = document.getElementById('employerModal');
    const content = document.getElementById('employerContent');
    
    if (modal && content) {
        content.innerHTML = `
            <h3 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">Employer Contact Details</h3>
            <div style="margin-bottom: 12px;">
                <p><strong>Company:</strong> ${escapeHtml(employer.company_name)}</p>
                <p><strong>Contact Person:</strong> ${escapeHtml(employer.full_name)}</p>
                <p><strong>Email:</strong> ${escapeHtml(employer.email)}</p>
                <p><strong>Phone:</strong> ${escapeHtml(employer.phone)}</p>
                <p><strong>Address:</strong> ${escapeHtml(employer.company_address || 'Not specified')}</p>
            </div>
            <button onclick="closeModal('employerModal')" style="background: #6b46c0; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">Close</button>
        `;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

// ============================================
// APPLY FOR JOB
// ============================================

async function applyForJob(jobId) {
    const user = getCurrentUser();
    if (!user) {
        showNotification('Please login to apply for jobs', 'warning');
        window.location.href = '/pages/login.html';
        return;
    }
    
    const modal = document.getElementById('applyModal');
    if (modal) {
        document.getElementById('applyJobId').value = jobId;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

async function submitApplication(event) {
    event.preventDefault();
    
    const user = getCurrentUser();
    const jobId = document.getElementById('applyJobId').value;
    const jobSeekerName = document.getElementById('applicantName').value;
    const jobSeekerEmail = document.getElementById('applicantEmail').value;
    const jobSeekerPhone = document.getElementById('applicantPhone').value;
    const coverLetter = document.getElementById('coverLetter').value;
    const cvFile = document.getElementById('cvFile').files[0];
    
    if (!cvFile) {
        showNotification('Please upload your CV', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('jobId', jobId);
    formData.append('userId', user.id);
    formData.append('job_seeker_name', jobSeekerName);
    formData.append('job_seeker_email', jobSeekerEmail);
    formData.append('job_seeker_phone', jobSeekerPhone);
    formData.append('cover_letter', coverLetter);
    formData.append('cv', cvFile);
    
    showLoading(true);
    
    try {
        const response = await fetch('http://localhost:5000/api/jobs/apply', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: formData
        });
        
        const data = await response.json();
        showLoading(false);
        
        if (data.success) {
            if (data.requires_payment) {
                const phoneNumber = prompt('Enter your M-PESA phone number to pay KES 50 for CV upload:');
                if (phoneNumber && validatePhoneNumber(phoneNumber)) {
                    const payment = await initiateMpesaPayment(
                        phoneNumber, 50, 'cv_upload', user.id, data.metadata
                    );
                    if (payment.success) {
                        showNotification('Payment successful! Your application has been submitted.', 'success');
                        closeModal('applyModal');
                        document.getElementById('applicationForm').reset();
                    }
                } else {
                    showNotification('Invalid phone number', 'error');
                }
            }
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showLoading(false);
        console.error('Apply error:', error);
        showNotification('An error occurred', 'error');
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
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
    if (window.location.pathname.includes('job-search')) {
        searchJobs();
        
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => searchJobs());
        }
        
        const searchInput = document.getElementById('searchKeyword');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchJobs();
            });
        }
    }
    
    const applicationForm = document.getElementById('applicationForm');
    if (applicationForm) {
        applicationForm.addEventListener('submit', submitApplication);
    }
});

// Export for global use
window.searchJobs = searchJobs;
window.viewRequirements = viewRequirements;
window.getEmployerDetails = getEmployerDetails;
window.applyForJob = applyForJob;
window.submitApplication = submitApplication;
window.closeModal = closeModal;