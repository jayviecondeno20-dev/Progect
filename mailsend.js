const nodemailer = require('nodemailer');

// Tandaan: Ang dotenv ay na-require na sa server.js, kaya hindi na kailangan dito
// kapag ginagamit na sa main app.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Nagpapadala ng email gamit ang Nodemailer.
 * @param {string} to Ang email address ng tatanggap.
 * @param {string} subject Ang subject ng email.
 * @param {string} html Ang HTML body ng email.
 * @returns {Promise<{success: boolean, error?: Error}>}
 */
async function sendEmail(to, subject, html) {
    const mailOptions = {
        from: `"ITAEWON KOPI SHOP" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
    };

    try {
        await transporter.sendMail(mailOptions);
        // Ibalik ang success object
        return { success: true };
    } catch (error) {
        console.error('Nodemailer error:', error);
        // Ibalik ang error object para ma-log ito sa server.js
        return { success: false, error: error };
    }
}

// I-export ang function para magamit sa ibang files
module.exports = { sendEmail };