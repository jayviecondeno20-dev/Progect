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
const cleanPass = rawPass.trim().replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // true para sa port 465
    pool: false, // I-disable muna ang pool para sa mas malinis na debug logs
    logger: true, // ENHANCED: I-log ang SMTP traffic para makita ang error
    debug: true,  // ENHANCED: Ipakita ang detailed debug info
    family: 4, // PWERSAHIN ANG IPv4 (Ito ang pinaka-importante para sa Render)
    auth: {
        user: process.env.EMAIL_USER?.trim(),
        pass: cleanPass,
    },
    tls: {
        rejectUnauthorized: false,
        servername: 'smtp.gmail.com',
        minVersion: 'TLSv1.2'
    },
    connectionTimeout: 30000, // Dagdagan ang allowance para sa cloud latency
    greetingTimeout: 30000,
    socketTimeout: 30000
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
    console.log(`[MAILER DIAGNOSTIC] EMAIL_USER: ${process.env.EMAIL_USER ? 'Set' : 'MISSING'}`);
    console.log(`[MAILER DIAGNOSTIC] PASS_LENGTH: ${cleanPass.length} characters`); // Dapat ay 16 characters

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
        console.error('[MAILER ERROR] Full Error Details:', error); // I-log ang buong error object
        if (error.code === 'EAUTH') {
            console.error('[MAILER ERROR] Hint: Double check your GMAIL APP PASSWORD.');
        }
        return { success: false, error: error.message };
    }
}

// I-export ang function para magamit sa ibang files
module.exports = { sendEmail };