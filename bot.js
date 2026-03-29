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

// Added at the top of the file for global stability
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
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
        console.log(`[BOT] Fetching user session for ${userId}`);
        const user = await userService.getUser(userId) || { last_entity: null, history: [] };
        if (query.match(/\b(him|her|he|she|that person|them)\b/i) && user.last_entity) {
            query = query.replace(/\b(him|her|he|she|that person|them)\b/gi, user.last_entity);
            console.log(`[MEMORY] Resolved pronoun to: "${query}"`);
        }

        // 2. Multi-Query Splitting
        const queries = retrievalService.splitQuery(query);
        let finalResponses = [];
        let combinedReport = { steps: ["Multi-Query Processing"], tokens: { reasoning: 0, formulation: 0 } };

        for (let q of queries) {
            let response = "";
            let report = { steps: [], tokens: { reasoning: 0, formulation: 0 } };

            // Determine Domain & Route via centralized query understanding
            const isPerson = retrievalService.isPersonQuery(q);
            const isTransport = retrievalService.isTransportQuery(q);
            const isDept = retrievalService.isDeptQuery(q);
            const isMtc = q.match(/\b(mtc|public transport|333|555)\b/i);

            console.log(`[BOT] Investigating "${q}" [P: ${isPerson}, T: ${isTransport}, D: ${isDept}, M: ${!!isMtc}]`);

            if (isPerson) {
                console.log(`[BOT] Calling handlePersonQuery`);
                response = await retrievalService.handlePersonQuery(q);
                if (response) {
                    report.steps.push("Deterministic Person Match");
                    const nameMatch = response.match(/Results for "(.*?)"/);
                    if (nameMatch) user.last_entity = nameMatch[1];
                }
            } else if (isDept) {
                console.log(`[BOT] Calling handleDeptQuery`);
                response = await retrievalService.handleDeptQuery(q);
                if (response) report.steps.push("Deterministic Dept Match");
            } else if (isTransport) {
                console.log(`[BOT] Calling handleTransportQuery`);
                response = await retrievalService.handleTransportQuery(q);
                if (response) report.steps.push("Deterministic Transport Match");
            } else if (isMtc) {
                console.log(`[BOT] Calling handleMtcQuery`);
                response = await retrievalService.handleMtcQuery(q);
                if (response) report.steps.push("Deterministic MTC Match");
            }

            // RAG Fallback
            if (!response) {
                console.log(`[BOT] No deterministic match, falling back to RAG`);
                report.steps.push("No Deterministic Match - Falling back to RAG");
                
                try {
                    const context = await retrievalService.retrieve(q);
                    console.log(`[BOT] Context: ${context.people.length} people, ${context.vectorMatches.length} knowledge items`);

                    // Module 4: Feedback Loop
                    if (context.people.length === 0 && (!context.routes || context.routes.length === 0) && context.vectorMatches.length === 0) {
                        try {
                            await retrievalService.connect();
                            await retrievalService.db.collection('failed_queries').insertOne({
                                query: q, userId, timestamp: new Date(), type: 'DATA_GAP'
                            });
                        } catch (e) {}
                    }

                    const rag = await ragService.generate(q, context, user.history.slice(-3));
                    response = rag.response;
                    report = rag.report;
                } catch (ragErr) {
                    console.error('[BOT] RAG Pipeline Error:', ragErr.message);
                    response = "I encountered an error retrieving that information. Please try a simpler query.";
                }
            }

            finalResponses.push(response);
            combinedReport.tokens.reasoning += (report.tokens?.reasoning || 0);
            combinedReport.tokens.formulation += (report.tokens?.formulation || 0);
            combinedReport.steps = [...combinedReport.steps, ...report.steps];
        }

        const finalResult = finalResponses.join('\n\n---\n\n');

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

        console.log(`[BOT] Sending reply to ${userId} (Length: ${finalResult.length})`);
        
        // Partition message if too long for Telegram (4096 limit)
        if (finalResult.length > 4000) {
            const chunks = finalResult.match(/[\s\S]{1,4000}/g) || [];
            for (const chunk of chunks) {
                await ctx.reply(chunk);
            }
        } else {
            await ctx.reply(finalResult);
        }
        
    } catch (e) {
        console.error('[BOT] Global Request Error:', e);
        try {
            await ctx.reply("The system is currently under heavy load or encountered a problem. Please try again in 1 minute.");
        } catch (replyErr) { console.error('[BOT] Failed to send error message:', replyErr.message); }
    }
}

bot.catch((err, ctx) => {
    console.error(`[TELEGRAF ERROR] Update ${ctx.updateType} caused error:`, err);
    try {
        ctx.reply("A system error occurred. Our engineers have been notified.");
    } catch (e) {}
});

bot.start((ctx) => {
    ctx.reply("Hi, I'm MSAJCE Assistant! I'm live and ready to help.\n\n• Transport (Bus Routes & Timings)\n• Admission Details\n• Personnel & Contacts\n• Department Info");
});

bot.on('text', async (ctx) => {
    await processQuery(ctx);
});

bot.launch().then(() => {
    console.log('MSAJCE Monorepo Bot Live & Listening...');
}).catch(err => {
    console.error('[BOT] Failed to launch:', err.message);
    if (err.message.includes('409')) {
        console.error('[BOT] CONFLICT: Another bot instance is already running with this token.');
    }
});

// Clean shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

