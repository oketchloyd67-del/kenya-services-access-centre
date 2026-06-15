// NO API_BASE_URL declaration here - it's already in main.js

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
            document.getElementById('jobCount').innerHTML = data.count || 0;
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
        container.innerHTML = '<div class="text-center py-8">No jobs found</div>';
        return;
    }
    
    container.innerHTML = jobs.map(job => `
        <div class="job-card">
            <h3>${escapeHtml(job.title)}</h3>
            <p>${escapeHtml(job.company_name)}</p>
            <p>${escapeHtml(job.location || 'Remote')} | ${escapeHtml(job.salary_range || 'Negotiable')}</p>
            <button onclick="viewRequirements('${job.id}')" class="btn-view">View Requirements (KES 50)</button>
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
            if (data.already_paid) {
                alert('Requirements: ' + data.requirements.requirements);
            } else if (data.requires_payment) {
                const phoneNumber = prompt('Enter M-PESA phone number to pay KES 50:');
                if (phoneNumber) {
                    showNotification('Payment initiated', 'success');
                }
            }
        } else {
            showNotification(data.message, 'error');
        }
    } catch (error) {
        showLoading(false);
        showNotification('An error occurred', 'error');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('job-search')) {
        searchJobs();
    }
});

// Make functions global
window.viewRequirements = viewRequirements;
window.searchJobs = searchJobs;