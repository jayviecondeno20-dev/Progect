const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // Dagdag na settings para sa cloud deployment (Render/Heroku)
    tls: {
        rejectUnauthorized: false
    },
    pool: true // Mas mabilis sa maraming requests
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
        return { success: false, error: new Error("Email credentials are missing in Environment Variables") };
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
        // Ibalik ang success object
        console.log(`[MAILER] Email successfully sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('Nodemailer error:', error);
        // Ibalik ang error object para ma-log ito sa server.js
        return { success: false, error: error };
    }
}

// I-export ang function para magamit sa ibang files
module.exports = { sendEmail };