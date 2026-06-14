const bcrypt = require('bcryptjs');

async function test() {
    const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrAJ6JqVqC7QGQ6Dq7lqWqD8qVqD8qW';
    const isValid = await bcrypt.compare('Admin@123', hash);
    console.log('Old hash valid?', isValid);
    
    const newHash = await bcrypt.hash('Admin@123', 10);
    console.log('New hash:', newHash);
    const isValidNew = await bcrypt.compare('Admin@123', newHash);
    console.log('New hash valid?', isValidNew);
}

test();