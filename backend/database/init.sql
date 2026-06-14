-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(15) UNIQUE NOT NULL,
    role VARCHAR(20) CHECK (role IN ('employer', 'job_seeker', 'service_provider', 'admin')) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    id_number VARCHAR(20) NOT NULL,
    id_photo_url TEXT NOT NULL,
    id_photo_original BOOLEAN DEFAULT TRUE,
    face_scan_url TEXT NOT NULL,
    face_scan_verified BOOLEAN DEFAULT FALSE,
    business_certificate_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- EMPLOYERS TABLE
-- ============================================
CREATE TABLE employers (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    business_reg_number VARCHAR(100),
    business_type VARCHAR(100),
    company_address TEXT,
    company_phone VARCHAR(15),
    company_email VARCHAR(255),
    subscription_expiry TIMESTAMP NOT NULL,
    subscription_status VARCHAR(20) DEFAULT 'active',
    is_active BOOLEAN DEFAULT TRUE,
    entry_fee_paid BOOLEAN DEFAULT FALSE,
    total_jobs_posted INT DEFAULT 0,
    total_applications_received INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- JOBS TABLE
-- ============================================
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employer_id UUID REFERENCES employers(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    location VARCHAR(255),
    location_type VARCHAR(50) DEFAULT 'on-site',
    salary_range VARCHAR(100),
    employment_type VARCHAR(50) DEFAULT 'full-time',
    experience_level VARCHAR(50),
    education_level VARCHAR(100),
    deadline DATE,
    is_active BOOLEAN DEFAULT TRUE,
    views_count INT DEFAULT 0,
    requirements_views INT DEFAULT 0,
    employer_details_views INT DEFAULT 0,
    applications_count INT DEFAULT 0,
    posted_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- JOB APPLICATIONS TABLE
-- ============================================
CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    job_seeker_id UUID REFERENCES users(id),
    job_seeker_name VARCHAR(255),
    job_seeker_email VARCHAR(255),
    job_seeker_phone VARCHAR(15),
    cv_url TEXT NOT NULL,
    cover_letter TEXT,
    cover_letter_url TEXT,
    employer_email VARCHAR(255),
    requirements_fee_paid BOOLEAN DEFAULT FALSE,
    employer_details_fee_paid BOOLEAN DEFAULT FALSE,
    cv_upload_fee_paid BOOLEAN DEFAULT FALSE,
    total_amount_paid DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'pending',
    applied_at TIMESTAMP DEFAULT NOW(),
    viewed_by_employer BOOLEAN DEFAULT FALSE,
    viewed_at TIMESTAMP
);

-- ============================================
-- JOB EMPLOYER ACCESS TABLE
-- ============================================
CREATE TABLE job_employer_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id),
    user_id UUID REFERENCES users(id),
    accessed_at TIMESTAMP DEFAULT NOW(),
    fee_paid DECIMAL(10,2)
);

-- ============================================
-- SERVICE PROVIDERS TABLE
-- ============================================
CREATE TABLE service_providers (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    service_category VARCHAR(100) NOT NULL,
    sub_category VARCHAR(100),
    location VARCHAR(255) NOT NULL,
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    service_area TEXT,
    description TEXT,
    price_range VARCHAR(100),
    years_experience INT DEFAULT 0,
    phone_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    total_connections INT DEFAULT 0,
    average_rating DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SERVICE CONNECTIONS TABLE
-- ============================================
CREATE TABLE service_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_provider_id UUID REFERENCES service_providers(user_id),
    seeker_id UUID REFERENCES users(id),
    seeker_name VARCHAR(255),
    seeker_phone VARCHAR(15),
    seeker_email VARCHAR(255),
    fee_paid BOOLEAN DEFAULT FALSE,
    amount_paid DECIMAL(10,2),
    mpesa_receipt VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    connected_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    transaction_type VARCHAR(50),
    amount DECIMAL(10,2) NOT NULL,
    mpesa_receipt VARCHAR(100) UNIQUE,
    checkout_request_id VARCHAR(100),
    phone_number VARCHAR(15),
    status VARCHAR(20) DEFAULT 'pending',
    result_code INT,
    result_desc TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- ============================================
-- REVIEWS TABLE
-- ============================================
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    user_name VARCHAR(255),
    rating INT CHECK (rating BETWEEN 1 AND 5) NOT NULL,
    comment TEXT NOT NULL,
    entity_type VARCHAR(20) CHECK (entity_type IN ('employer', 'service_provider', 'platform')) NOT NULL,
    entity_id UUID,
    is_approved BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    helpful_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ADMIN SETTINGS TABLE
-- ============================================
CREATE TABLE admin_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'text',
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_verified ON users(is_verified);
CREATE INDEX idx_employers_subscription_expiry ON employers(subscription_expiry);
CREATE INDEX idx_employers_is_active ON employers(is_active);
CREATE INDEX idx_jobs_employer ON jobs(employer_id);
CREATE INDEX idx_jobs_is_active ON jobs(is_active);
CREATE INDEX idx_jobs_posted_at ON jobs(posted_at);
CREATE INDEX idx_jobs_deadline ON jobs(deadline);
CREATE INDEX idx_job_applications_job ON job_applications(job_id);
CREATE INDEX idx_job_applications_status ON job_applications(status);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_transactions_mpesa_receipt ON transactions(mpesa_receipt);
CREATE INDEX idx_service_providers_category ON service_providers(service_category);
CREATE INDEX idx_service_providers_location ON service_providers(location);
CREATE INDEX idx_service_providers_is_active ON service_providers(is_active);
CREATE INDEX idx_reviews_entity ON reviews(entity_type, entity_id);
CREATE INDEX idx_reviews_is_approved ON reviews(is_approved);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

-- ============================================
-- DEFAULT ADMIN SETTINGS
-- ============================================
INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('bank_name', 'Equity Bank Kenya Limited', 'text', 'Name of the bank for settlements'),
('bank_account_name', 'Kenya Services Access Centre Ltd', 'text', 'Account holder name'),
('bank_account_number', '1234567890', 'text', 'Bank account number'),
('bank_branch', 'Upper Hill, Nairobi', 'text', 'Bank branch location'),
('bank_swift_code', 'EQBLKENA', 'text', 'SWIFT/BIC code'),
('platform_fee_percentage', '10', 'number', 'Platform service fee percentage'),
('employer_entry_fee', '400', 'number', 'Employer one-time entry fee (KES)'),
('employer_monthly_fee', '300', 'number', 'Employer monthly subscription (KES)'),
('job_requirements_fee', '50', 'number', 'Fee to view job requirements (KES)'),
('employer_details_fee', '100', 'number', 'Fee to get employer details (KES)'),
('cv_upload_fee', '50', 'number', 'Fee to upload CV (KES)'),
('service_connection_fee', '100', 'number', 'Fee to connect with service provider (KES)'),
('maintenance_mode', 'false', 'boolean', 'Put website in maintenance mode'),
('contact_whatsapp', '254700000000', 'text', 'WhatsApp support number'),
('contact_email', 'support@kenyaservices.co.ke', 'text', 'Support email address');

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_employers_updated_at BEFORE UPDATE ON employers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_service_providers_updated_at BEFORE UPDATE ON service_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR REPORTS
-- ============================================
CREATE VIEW daily_revenue AS
SELECT 
    DATE(created_at) as date,
    transaction_type,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_count
FROM transactions
GROUP BY DATE(created_at), transaction_type
ORDER BY date DESC;

CREATE VIEW active_jobs_view AS
SELECT 
    j.*,
    e.company_name,
    e.user_id as employer_id
FROM jobs j
JOIN employers e ON j.employer_id = e.user_id
WHERE j.is_active = true 
AND e.is_active = true 
AND e.subscription_expiry > NOW();

CREATE VIEW revenue_summary AS
SELECT 
    DATE_TRUNC('month', created_at) as month,
    SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as total_transactions
FROM transactions
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- ============================================
-- DEFAULT ADMIN USER (password: Admin@123)
-- Password hash is for 'Admin@123' using bcrypt
-- ============================================
INSERT INTO users (id, email, phone, full_name, id_number, password_hash, role, id_photo_url, face_scan_url, is_verified, is_active)
VALUES (
    uuid_generate_v4(),
    'admin@kenyaservices.co.ke',
    '254700000000',
    'System Administrator',
    'ADMIN001',
    '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrAJ6JqVqC7QGQ6Dq7lqWqD8qVqD8qW',
    'admin',
    'auto_generated',
    'auto_generated',
    true,
    true
);