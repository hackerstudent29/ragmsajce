const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN_ACADEMIC;
const VERCEL_URL = process.argv[2]; // Take URL from command line

if (!VERCEL_URL) {
    console.error('Please provide your Vercel URL as an argument.');
    console.error('Example: node scripts/set_webhook.js https://ragmsajce.vercel.app');
    process.exit(1);
}

const webhookUrl = `${VERCEL_URL.endsWith('/') ? VERCEL_URL.slice(0, -1) : VERCEL_URL}/api/bot`;

async function setWebhook() {
    try {
        console.log(`Setting Webhook to: ${webhookUrl}`);
        const res = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            url: webhookUrl
        });
        console.log('Telegram Response:', res.data);
    } catch (e) {
        console.error('Failed to set Webhook:', e.response ? e.response.data : e.message);
    }
}

setWebhook();
