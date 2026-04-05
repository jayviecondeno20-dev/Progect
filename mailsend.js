const nodemailer = require('nodemailer');
const dns = require('dns');

// IMPORTANT: Force Node.js to prefer IPv4 over IPv6. 
// Ito ang solusyon sa "ENETUNREACH" error sa Render environment.
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// Linisin ang password para tanggalin ang spaces (common issue sa copy-paste sa Render Dashboard)
const rawPass = process.env.EMAIL_PASS || '';
const cleanPass = rawPass.replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
    service: 'gmail', // Gamitin ang built-in service config ng Nodemailer para sa Gmail
    auth: {
        user: process.env.EMAIL_USER,
        pass: cleanPass,
    },
    tls: {
        rejectUnauthorized: false,
        // Force IPv4 resolution para iwas sa Render IPv6 issues
        servername: 'smtp.gmail.com' 
    }
});

/**
 * Nagpapadala ng email gamit ang Nodemailer.
 * @param {string} to Ang email address ng tatanggap.
 * @param {string} subject Ang subject ng email.
 * @param {string} html Ang HTML body ng email.
 * @returns {Promise<{success: boolean, error?: Error}>}
 */
async function sendEmail(to, subject, html) {
    // Diagnostic Log para sa Render Dashboard
    console.log(`[MAILER DIAGNOSTIC] Attempting send to: ${to}`);
    console.log(`[MAILER DIAGNOSTIC] EMAIL_USER: ${process.env.EMAIL_USER ? 'Present' : 'EMPTY'}`);
    console.log(`[MAILER DIAGNOSTIC] EMAIL_PASS: ${cleanPass ? 'Present' : 'EMPTY'}`);

    // Siguraduhing may credentials bago mag-send
    if (!process.env.EMAIL_USER || !cleanPass) {
        console.error("[MAILER ERROR] Environment variables are missing in Render Dashboard!");
        return { success: false, error: "Environment variables missing" };
    }

    const mailOptions = {
        from: `"ITAEWON KOPI SHOP" <${process.env.EMAIL_USER}>`,
        to: to,
        subject,
        html,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[MAILER SUCCESS] ID: ${info.messageId} | Response: ${info.response}`);
        return { success: true };
    } catch (error) {
        console.error('[MAILER ERROR] Connection/Auth failed:', error.message);
        if (error.code === 'EAUTH') {
            console.error('[MAILER ERROR] Hint: Double check your GMAIL APP PASSWORD.');
        }
        return { success: false, error: error.message };
    }
}

// I-export ang function para magamit sa ibang files
module.exports = { sendEmail };