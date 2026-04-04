const nodemailer = require('nodemailer');
require('dotenv').config(); // Siguraduhing loaded ang environment variables

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Gamitin ang false para sa port 587 (STARTTLS)
    family: 4,    // Force IPv4 para iwasan ang ENETUNREACH
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false,
        requireTLS: true
    },
    connectionTimeout: 10000, // 10 seconds timeout
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