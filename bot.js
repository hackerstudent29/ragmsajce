const { Telegraf } = require('telegraf');
const retrievalService = require('./services/retrievalService');
const ragService = require('./services/ragService');
const userService = require('./services/userService');
const dotenv = require('dotenv');

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN_ACADEMIC;
console.log(`[BOT] Token Present: ${!!BOT_TOKEN}`);
if (!BOT_TOKEN) {
    console.error('[BOT] CRITICAL: TELEGRAM_BOT_TOKEN_ACADEMIC is missing from .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Global Error Prevention
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
});

async function processQuery(ctx) {
    const userId = ctx.from.id;
    let query = ctx.message.text;

    try {
        console.log(`[LOG] Query from ${userId}: "${query}"`);
        await ctx.sendChatAction('typing');

        // 1. Session Memory & Pronoun Resolution
        const user = await userService.getUser(userId) || { last_entity: null, history: [] };
        if (query.match(/\b(him|her|he|she|that person|them)\b/i) && user.last_entity) {
            query = query.replace(/\b(him|her|he|she|that person|them)\b/gi, user.last_entity);
            console.log(`[MEMORY] Resolved pronoun to: "${query}"`);
        }

        // 2. Parallel Processing for Multi-Queries
        const queries = retrievalService.splitQuery(query);
        const processingStartTime = Date.now();
        const GLOBAL_TIMEOUT_MS = 25000;

        const processSubQuery = async (q) => {
            let response = "";
            let report = { steps: [], tokens: { reasoning: 0, formulation: 0 } };

            const { intents } = retrievalService.detectIntent(q);
            const isGreeting = intents.includes('GREETING');
            const isAdmission = intents.includes('ADMISSION');
            const isPerson = retrievalService.isPersonQuery(q);
            const isTransport = retrievalService.isTransportQuery(q);
            const isDept = retrievalService.isDeptQuery(q);
            const isMtc = q.match(/\b(mtc|public transport|333|555)\b/i);

            if (isGreeting) return { response: "Hi! How can I help you with transport, admissions, or personnel info today?", report };

            if (isAdmission) {
                response = await retrievalService.handleAdmissionQuery(q);
                if (response) report.steps.push("Deterministic Admission Match");
            }

            if (!response && isPerson) {
                response = await retrievalService.handlePersonQuery(q);
                if (response) report.steps.push("Deterministic Person Match");
            } else if (!response && isDept) {
                response = await retrievalService.handleDeptQuery(q);
                if (response) report.steps.push("Deterministic Dept Match");
            } else if (!response && isTransport) {
                response = await retrievalService.handleTransportQuery(q);
                if (response) report.steps.push("Deterministic Transport Match");
            } else if (!response && isMtc) {
                response = await retrievalService.handleMtcQuery(q);
                if (response) report.steps.push("Deterministic MTC Match");
            }

            if (!response) {
                if (Date.now() - processingStartTime > GLOBAL_TIMEOUT_MS - 5000) return { response: "I'm sorry, I'm taking too long to find the best answer.", report };
                try {
                    const context = await retrievalService.retrieve(q);
                    const rag = await ragService.generate(q, context, user.history.slice(-3));
                    response = rag.response;
                    report = rag.report;
                } catch (ragErr) {
                    console.error('[BOT] RAG Pipeline Error:', ragErr.message);
                    response = "I encountered an error retrieving that information.";
                }
            }
            return { response, report };
        };

        // Execution with Global Deadline
        const results = await Promise.race([
            Promise.all(queries.map(q => processSubQuery(q))),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Global Timeout')), GLOBAL_TIMEOUT_MS))
        ]);

        const finalResult = results.map(r => r.response).join('\n\n---\n\n');
        
        // Merge tokens/steps for logging
        const combinedReport = { steps: results.flatMap(r => r.report.steps), tokens: { reasoning: 0, formulation: 0 } };
        results.forEach(r => {
            combinedReport.tokens.reasoning += (r.report.tokens?.reasoning || 0);
            combinedReport.tokens.formulation += (r.report.tokens?.formulation || 0);
        });

        // 3. Update Session
        try {
            user.history.push({ role: 'user', content: query });
            user.history.push({ role: 'assistant', content: finalResult });
            await userService.enroll(userId, user);
        } catch (sessErr) { console.error('[BOT] Session Update Failed:', sessErr.message); }

        // 4. Log for Dashboard
        try {
            await retrievalService.connect();
            await retrievalService.db.collection('execution_logs').insertOne({
                userId, query, response: finalResult,
                steps: combinedReport.steps,
                tokens: combinedReport.tokens,
                timestamp: new Date()
            });
        } catch (logErr) { console.error('[BOT] Log Save Error:', logErr.message); }

        // Send Final Result
        if (finalResult.length > 4000) {
            const chunks = finalResult.match(/[\s\S]{1,4000}/g) || [];
            for (const chunk of chunks) await ctx.reply(chunk);
        } else {
            await ctx.reply(finalResult);
        }
        
    } catch (e) {
        console.error('[BOT] Global Request Error:', e);
        try {
            await ctx.reply("The system encountered a timeout or error. Please try a simpler query.");
        } catch (replyErr) {}
    }
}

bot.catch((err, ctx) => {
    console.error(`[TELEGRAF ERROR] Update ${ctx.updateType}:`, err);
    try { ctx.reply("A system error occurred. Please try again later."); } catch (e) {}
});

bot.start((ctx) => {
    ctx.reply("Hi, I'm MSAJCE Assistant! I'm live and ready to help. Choose a category:\n\n• Transport (Bus Routes & Timings)\n• Admission Details\n• Personnel & Contacts\n• Department Info");
});

bot.on('text', async (ctx) => {
    await processQuery(ctx);
});

bot.launch().then(() => {
    console.log('MSAJCE Assistant Hybrid Live & Listening...');
}).catch(err => {
    console.error('[BOT] Failed to launch:', err.message);
});

// Clean shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
