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

            console.log(`[BOT] Investigating query "${q}" [Person: ${isPerson}, Transport: ${isTransport}, Dept: ${isDept}, MTC: ${isMtc}]`);

            if (isPerson) {
                console.log(`[BOT] Calling handlePersonQuery for "${q}"`);
                response = await retrievalService.handlePersonQuery(q);
                if (response) {
                    report.steps.push("Deterministic Person Match");
                    const nameMatch = response.match(/Results for "(.*?)"/);
                    if (nameMatch) user.last_entity = nameMatch[1];
                }
            } else if (isDept) {
                console.log(`[BOT] Calling handleDeptQuery for "${q}"`);
                response = await retrievalService.handleDeptQuery(q);
                if (response) report.steps.push("Deterministic Dept Match");
            } else if (isTransport) {
                console.log(`[BOT] Calling handleTransportQuery for "${q}"`);
                response = await retrievalService.handleTransportQuery(q);
                if (response) report.steps.push("Deterministic Transport Match");
            } else if (isMtc) {
                console.log(`[BOT] Calling handleMtcQuery for "${q}"`);
                response = await retrievalService.handleMtcQuery(q);
                if (response) report.steps.push("Deterministic MTC Match");
            }

            // RAG Fallback (Part 13)
            if (!response) {
                console.log(`[BOT] No deterministic match, falling back to RAG for "${q}"`);
                report.steps.push("No Deterministic Match - Falling back to RAG");
                
                console.log(`[BOT] Calling retrievalService.retrieve for context`);
                const context = await retrievalService.retrieve(q);
                console.log(`[BOT] Context retrieved: ${context.people.length} people, ${context.vectorMatches.length} knowledge items`);

                // Module 4: Feedback Loop (Detect Gaps)
                if (context.people.length === 0 && (!context.routes || context.routes.length === 0) && context.vectorMatches.length === 0) {
                    console.log(`[FEEDBACK] Data gap detected for: "${q}"`);
                    try {
                        await retrievalService.connect();
                        await retrievalService.db.collection('failed_queries').insertOne({
                            query: q, userId, timestamp: new Date(), type: 'DATA_GAP'
                        });
                    } catch (e) {}
                }

                console.log(`[BOT] Calling ragService.generate for "${q}"`);
                const rag = await ragService.generate(q, context, user.history.slice(-3));
                response = rag.response;
                report = rag.report;
                console.log(`[BOT] RAG generation complete`);
            }

            finalResponses.push(response);
            combinedReport.tokens.reasoning += (report.tokens?.reasoning || 0);
            combinedReport.tokens.formulation += (report.tokens?.formulation || 0);
            combinedReport.steps = [...combinedReport.steps, ...report.steps];
        }

        const finalResult = finalResponses.join('\n\n---\n\n');

        // 3. Update Session
        user.history.push({ role: 'user', content: query });
        user.history.push({ role: 'assistant', content: finalResult });
        await userService.enroll(userId, user);

        // 4. Log for Dashboard
        try {
            console.log(`[BOT] Logging execution to dashboard database`);
            await retrievalService.connect();
            await retrievalService.db.collection('execution_logs').insertOne({
                userId, query, response: finalResult,
                steps: combinedReport.steps,
                tokens: combinedReport.tokens,
                timestamp: new Date()
            });
            console.log(`[BOT] Execution logged`);
        } catch (logErr) { console.error('Log save error:', logErr.message); }

        console.log(`[BOT] Sending final reply to user ${userId}`);
        await ctx.reply(finalResult);
        console.log(`[BOT] Reply sent`);
    } catch (e) {
        console.error('Bot Error:', e);
        ctx.reply("System encountered an error. Please try again.");
    }
}

bot.start((ctx) => {
    ctx.reply("Hi, I'm MSAJCE Assistant! What assistance do you need today?\n\n• Transport (Bus Routes & Timings)\n• Admission Details\n• Personnel & Contacts\n• Department Info");
});

bot.on('text', async (ctx) => {
    await processQuery(ctx);
});

bot.launch();
console.log('MSAJCE Monorepo Bot Live...');

// Clean shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
