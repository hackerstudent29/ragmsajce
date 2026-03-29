const { Telegraf } = require('telegraf');
const retrievalService = require('./services/retrievalService');
const ragService = require('./services/ragService');
const userService = require('./services/userService');
const dotenv = require('dotenv');

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN_ACADEMIC;
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply("Hi, I'm MSAJCE Assistant! What assistance do you need today?\n\n• Transport (Bus Routes & Timings)\n• Admission Details\n• Personnel & Contacts\n• Department Info");
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const query = ctx.message.text;

    try {
        console.log(`[LOG] Query from ${userId}: "${query}"`);
        await ctx.sendChatAction('typing');

        // 1. Retrieval (Intent Splitting + Hybrid Search)
        const context = await retrievalService.retrieve(query);

        // 2. State & History (User Service)
        const user = await userService.getUser(userId) || { history: [] };
        
        // 3. Reasoning & Formulation (RAG Service)
        const { response, report } = await ragService.generate(query, context, user.history.slice(-5));

        // 4. Log the Execution Report (for Dashboard)
        try {
            await (await retrievalService.connect());
            await retrievalService.db.collection('execution_logs').insertOne({
                userId,
                query,
                response,
                steps: report.steps,
                tokens: report.tokens,
                timestamp: new Date()
            });
        } catch (e) { console.error('Logging Error:', e.message); }

        // 5. Update Persistence
        user.history.push({ role: 'user', content: query });
        user.history.push({ role: 'assistant', content: response });
        await userService.enroll(userId, user);

        await ctx.reply(response);
    } catch (e) {
        console.error('Bot Pipeline Error:', e);
        ctx.reply("Technical error encountered. Please try again.");
    }
});

bot.launch();
console.log('MSAJCE Monorepo Bot Live...');

// Clean shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
