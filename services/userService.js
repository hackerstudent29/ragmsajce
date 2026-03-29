const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_APP_PASSWORD;

class UserService {
  // --- ENROLLMENT & SECURITY ---
  async enroll(userId, userData) {
    try {
      await axios.post(`${REDIS_URL}/set/user:${encodeURIComponent(userId)}`, JSON.stringify(userData), {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
      });
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }

  async getUser(userId) {
    try {
      const res = await axios.get(`${REDIS_URL}/get/user:${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
      });
      return res.data.result ? JSON.parse(res.data.result) : null;
    } catch (e) { return null; }
  }

  // --- OTP FLOW ---
  async sendOTP(email) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // Cache OTP for 5 mins
    await axios.post(`${REDIS_URL}/setex/otp:${encodeURIComponent(email)}/300`, otp, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    
    // Simulate email send (Use complaintService pattern for full implementation)
    console.log(`[OTP] Send ${otp} to ${email}`);
    return otp;
  }

  async verifyOTP(email, userInput) {
    try {
      const res = await axios.get(`${REDIS_URL}/get/otp:${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
      });
      return res.data.result === userInput;
    } catch (e) { return false; }
  }
}

module.exports = new UserService();
