const nodemailer = require('nodemailer');
const dns = require('dns');

// IMPORTANT: Force Node.js to prefer IPv4 over IPv6. 
// Ito ang solusyon sa "ENETUNREACH" error sa Render environment.
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

require('dotenv').config(); // Siguraduhing loaded ang environment variables

const transporter = nodemailer.createTransport({
    service: 'gmail', // Mas stable ang 'service' setup sa cloud
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false
    },
});

// I-verify ang connection sa startup para makita agad sa console kung may error sa credentials
transporter.verify(function (error, success) {
    if (error) {
        console.error("[MAILER ERROR] Verification failed! Check your EMAIL_USER and EMAIL_PASS.");
        console.error("Error Detail:", error);
    } else {
        console.log("[MAILER] Success! Nodemailer is ready to send emails.");
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
    // Siguraduhing may credentials bago mag-send
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("[MAIL ERROR] Missing EMAIL_USER or EMAIL_PASS in environment variables.");
        return { success: false, error: "Environment variables missing" };
    }

    console.log(`[MAILER] Attempting to send email to: ${to}`);

    const mailOptions = {
        from: `"ITAEWON KOPI SHOP" <${process.env.EMAIL_USER}>`,
        to: to,
        subject,
        html,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[MAILER] Email successfully sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('[MAILER ERROR] Failed to send email:', error.message);
        return { success: false, error: error.message };
    }
}

// I-export ang function para magamit sa ibang files
module.exports = { sendEmail };