const bcrypt = require('bcryptjs');

async function hashPassword() {
    const password = 'Admin@123';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('Copy this hash into the database');
}

hashPassword();