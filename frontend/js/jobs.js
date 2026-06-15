// frontend/js/jobs.js - NO API_BASE_URL declaration here

async function searchJobs(page = 1) {
    const keyword = document.getElementById('searchKeyword')?.value || '';
    const location = document.getElementById('searchLocation')?.value || '';
    const employmentType = document.getElementById('employmentType')?.value || '';
    
    showLoading(true);
    
    try {
        const params = new URLSearchParams({ keyword, location, employment_type: employmentType, page });
        const response = await fetch(`${API_BASE_URL}/api/jobs/search?${params}`);
        const data = await response.json();
        
        showLoading(false);
        
        if (data.success) {
            displayJobs(data.jobs);
            if (document.getElementById('jobCount')) {
                document.getElementById('jobCount').innerHTML = data.count || 0;
            }
        } else {
            showNotification('Failed to load jobs', 'error');
        }
    } catch (error) {
        showLoading(false);
        showNotification('An error occurred', 'error');
    }
}

function displayJobs(jobs) {
    const container = document.getElementById('jobsContainer');
    if (!container) return;
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<div class="text-center py-8">No jobs found. Check back later!</div>';
        return;
    }
    
    container.innerHTML = jobs.map(job => `
        <div class="job-card">
            <h3>${escapeHtml(job.title)}</h3>
            <p>${escapeHtml(job.company_name)}</p>
            <p>📍 ${escapeHtml(job.location || 'Remote')} | 💰 ${escapeHtml(job.salary_range || 'Negotiable')}</p>
            <button onclick="viewRequirements('${job.id}')" class="btn-view">
                View Requirements (KES 50)
            </button>
        </div>
    `).join('');
}

async function viewRequirements(jobId) {
    const user = getCurrentUser();
    if (!user) {
        showNotification('Please login first', 'error');
        window.location.href = '/pages/login.html';
        return;
    }
    
    showLoading(true);
    
    try {
        // First, check if requirements are available
        const response = await fetch(`${API_BASE_URL}/api/jobs/view-requirements`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ jobId, userId: user.id })
        });
        
        const data = await response.json();
        showLoading(false);
        
        if (data.success) {
            if (data.requires_payment || data.amount) {
                // Trigger payment
                const phoneNumber = prompt('Enter your M-PESA phone number (e.g., 0712345678):');
                if (phoneNumber && phoneNumber.match(/^(07|2547|7)\d{8}$/)) {
                    const paymentResult = await initiateMpesaPayment(
                        phoneNumber,
                        data.amount || 50,
                        data.transaction_type || 'job_view_requirements',
                        user.id,
                        { jobId, userId: user.id }
                    );
                    
                    if (paymentResult.success) {
                        showNotification('STK Push sent! Check your phone.', 'success');
                        // After payment, fetch and show requirements
                        setTimeout(() => viewRequirements(jobId), 3000);
                    } else {
                        showNotification(paymentResult.message, 'error');
                    }
                } else {
                    showNotification('Invalid phone number', 'error');
                }
            } else if (data.already_paid || data.requirements) {
                // Already paid, show requirements
                alert('Job Requirements:\n\n' + (data.requirements?.requirements || 'No requirements listed'));
            } else {
                showNotification('Unable to fetch requirements', 'error');
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions global
window.searchJobs = searchJobs;
window.viewRequirements = viewRequirements;