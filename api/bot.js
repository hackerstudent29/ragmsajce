const { Telegraf } = require('telegraf');
const retrievalService = require('../services/retrievalService');
const ragService = require('../services/ragService');
const userService = require('../services/userService');
const dotenv = require('dotenv');

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN_ACADEMIC;
const bot = new Telegraf(BOT_TOKEN);

// Serverless Handler (Vercel)
module.exports = async (request, response) => {
    try {
        if (!request.body || !request.body.message) {
            return response.status(200).send('OK');
        }
        await bot.handleUpdate(request.body, response);
    } catch (err) {
        console.error('[WEBHOOK ERROR]', err);
        if (!response.writableEnded) {
            response.status(200).send('Error but OK for Telegram');
        }
    }
};

bot.start((ctx) => ctx.reply("MSAJCE Assistant (Serverless) Active. Use Transport/Personnel keywords to get info."));

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const query = ctx.message.text;
    
    try {
        const user = await userService.getUser(userId) || { history: [] };
        
        // Multi-Query bridge
        const queries = retrievalService.splitQuery(query);
        let finalResponses = [];
        
        for (let q of queries) {
            let res = await retrievalService.handlePersonQuery(q) || 
                      await retrievalService.handleTransportQuery(q) || 
                      await retrievalService.handleDeptQuery(q) || 
                      await retrievalService.handleMtcQuery(q);
                      
            if (!res) {
                const context = await retrievalService.retrieve(q);
                const rag = await ragService.generate(q, context, user.history.slice(-3));
                res = rag.response;
            }
            finalResponses.push(res);
        }

        const reply = finalResponses.join('\n\n---\n\n');
        
        if (reply.length > 4000) {
            const chunks = reply.match(/[\s\S]{1,4000}/g) || [];
            for (const chunk of chunks) await ctx.reply(chunk);
        } else {
            await ctx.reply(reply);
        }
        
    } catch (e) {
        console.error('API Bot Error:', e);
        await ctx.reply("Internal system error. Please retry.");
    }
});
