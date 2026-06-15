// frontend/js/jobs.js - Browser JavaScript (NO require!)

const API_BASE_URL = 'https://kenyaservices-accesscentre-ly34.onrender.com';

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
        console.error('Search error:', error);
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
        <div class="job-card" style="border:1px solid #ddd; padding:15px; margin-bottom:15px; border-radius:8px;">
            <h3 style="margin:0 0 5px 0;">${escapeHtml(job.title)}</h3>
            <p style="color:#666; margin:0 0 10px 0;">${escapeHtml(job.company_name)}</p>
            <p>📍 ${escapeHtml(job.location || 'Remote')} | 💰 ${escapeHtml(job.salary_range || 'Negotiable')}</p>
            <button onclick="viewRequirements('${job.id}')" style="background:#4a5568; color:white; border:none; padding:8px 16px; border-radius:5px; cursor:pointer; margin-top:10px;">
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
            alert('Requirements: ' + (data.requirements?.requirements || 'No requirements listed'));
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

// Make functions global
window.searchJobs = searchJobs;
window.viewRequirements = viewRequirements;