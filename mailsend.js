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
    port: 465, // Gamitin ang 465 para sa mas stable na connection sa cloud
    secure: true, // Dapat true kung port 465
    pool: true, // Enhanced: Gumamit ng connection pool para iwas sa socket hang up
    logger: true, // ENHANCED: I-log ang SMTP traffic para makita ang error
    debug: true,  // ENHANCED: Ipakita ang detailed debug info
    family: 4, // PWERSAHIN ANG IPv4 (Ito ang pinaka-importante para sa Render)
    auth: {
        user: process.env.EMAIL_USER,
        pass: cleanPass,
    },
    tls: {
        rejectUnauthorized: false,
        servername: 'smtp.gmail.com' 
    },
    connectionTimeout: 20000, // Tinaasan pa ang timeout
    greetingTimeout: 20000,
    socketTimeout: 20000
});

// ENHANCED: I-verify ang connection sa startup
transporter.verify(function (error, success) {
    if (error) {
        console.error("[MAILER STARTUP ERROR] Cannot connect to Gmail:");
        console.error(error);
    } else {
        console.log("[MAILER STARTUP SUCCESS] Server is ready to take our messages");
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