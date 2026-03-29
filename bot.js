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

        const isPerson = retrievalService.isPersonQuery(query);
        let finalResponse = "";
        let report = { steps: ["Starting Request"], tokens: { reasoning: 0, formulation: 0 } };

        if (isPerson) {
            console.log('[ROUTING] Deterministic Entity Flow');
            const personResult = await retrievalService.handlePersonQuery(query);
            
            if (personResult) {
                finalResponse = personResult;
                report.steps.push("Deterministic Entity Match Found");
                report.steps.push("Database Lookup Successful");
                report.steps.push("Direct Response Generated (No AI)");
            } else {
                console.log('[ROUTING] No entity match, falling back to RAG');
                report.steps.push("No Direct Entity Match");
                const context = await retrievalService.retrieve(query);
                const rag = await ragService.generate(query, context, []);
                finalResponse = rag.response;
                report = rag.report;
            }
        } else {
            console.log('[ROUTING] RAG / AI Flow');
            const context = await retrievalService.retrieve(query);
            const rag = await ragService.generate(query, context, []);
            finalResponse = rag.response;
            report = rag.report;
        }

        // 4. Log to DB for Dashboard
        try {
            await retrievalService.connect();
            await retrievalService.db.collection('execution_logs').insertOne({
                userId, query, response: finalResponse,
                steps: report.steps,
                tokens: report.tokens,
                timestamp: new Date(),
                mode: isPerson && !report.tokens.reasoning ? 'DETERMINISTIC' : 'RAG'
            });
        } catch (logErr) { console.error('Log save error:', logErr.message); }

        console.log('[DONE] Sending reply...');
        await ctx.reply(finalResponse);
        console.log('[DONE] Reply sent.');
    } catch (e) {
        console.error('Bot Pipeline Error:', e.message);
        ctx.reply("Sorry, I encountered an error. Please try again.");
    }
});

bot.launch();
console.log('MSAJCE Monorepo Bot Live...');

// Clean shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
