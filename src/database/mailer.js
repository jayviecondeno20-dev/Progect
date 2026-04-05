const nodemailer = require('nodemailer');
const dns = require('dns');

if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4,
    connectionTimeout: 10000,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : ''
    },
    tls: {
        rejectUnauthorized: false
    },
});

/**
 * Function para mag-send ng OTP
 * @param {string} email - Recipient email
 * @param {string} otp - Ang generated OTP code
 */
async function sendOTPEmail(email, otp) {
    const mailOptions = {
        from: `"Your App Name" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your OTP Verification Code',
        text: `Your OTP code is: ${otp}. It will expire in 5 minutes.`,
        html: `<b>Your OTP code is: <h3>${otp}</h3></b><p>It will expire in 5 minutes.</p>`
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return { success: true, message: 'OTP sent successfully' };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, message: 'Failed to send OTP' };
    }
}

module.exports = { sendOTPEmail };