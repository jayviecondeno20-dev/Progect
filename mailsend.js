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
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4, // Napaka-importante nito sa Render para iwas "Network Unreachable"
    pool: true, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: cleanPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
    tls: {
        // Huwag payagan ang insecure connections pero huwag mag-fail sa self-signed certs ng cloud
        rejectUnauthorized: false,
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
    console.log("[MAILER CHECK] User:", process.env.EMAIL_USER ? "SET" : "MISSING");
    console.log("[MAILER CHECK] Pass:", cleanPass ? "SET" : "MISSING");

    // Siguraduhing may credentials bago mag-send
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
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
        // Direkta na nating i-send para iwas extra latency sa .verify()
        console.log(`[MAILER] Attempting to send email to ${to}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[MAILER] Response: ${info.response}`);
        console.log(`[MAILER] Email successfully sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('[MAILER ERROR] Full Error:', error);
        return { success: false, error: error.message };
    }
}

// I-export ang function para magamit sa ibang files
module.exports = { sendEmail };