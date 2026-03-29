const { Telegraf, session } = require('telegraf');
const retriever = require('./retriever');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN_ACADEMIC;
const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const gemini = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

const bot = new Telegraf(BOT_TOKEN);

// Simple Redis Session using Upstash REST API
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

async function getSession(userId) {
    try {
        const res = await axios.get(`${REDIS_URL}/get/session:${userId}`, {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
        });
        return res.data.result ? JSON.parse(res.data.result) : { history: [] };
    } catch (e) {
        return { history: [] };
    }
}

async function setSession(userId, data) {
    try {
        await axios.post(`${REDIS_URL}/set/session:${userId}`, JSON.stringify(data), {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
        });
    } catch (e) {
        console.error('Session Save Error:', e.message);
    }
}

// Stage 1: NVIDIA Reasoning
async function getReasoning(query, context, history) {
    try {
        const response = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
            model: "meta/llama-3.1-405b-instruct",
            messages: [
                { role: "system", content: "You are the Reasoning Core for MSAJCE Academic Assistant. Analyze the query and provided context. Reason step-by-step. Identify entities, routes, or facts. Provide a summary for the output generation stage. DO NOT directly answer user yet." },
                { role: "user", content: `Query: ${query}\n\nContext: ${JSON.stringify(context)}\n\nHistory: ${JSON.stringify(history)}` }
            ],
            temperature: 0.1,
            max_tokens: 1000
        }, {
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' }
        });
        return response.data.choices[0].message.content;
    } catch (e) {
        console.error('NVIDIA Reasoning Error:', e.response ? e.response.data : e.message);
        return "Failed to perform reason-based planning. Relying on context directly.";
    }
}

// Stage 2: Gemini Final Response
async function getFinalResponse(query, reasoning, context) {
    try {
        const prompt = `
            You are MSAJCE Assistant. Strict mode: Answer ONLY the user's specific question.
            
            QUESTION: ${query}
            REASONING: ${reasoning}
            DATA: ${JSON.stringify(context)}
            
            LAWS:
            1. DO NOT include "Additional" or "Also" information. 
            2. If someone is a student, say they are a student.
            3. If someone is a professor, say they are a professor.
            4. If the question is about a person, DO NOT talk about bus routes or facilities.
            5. FORMAT: Use only simple dashes (-) for bullet points.
            6. STYLE: NO BOLD (**), NO ITALICS (_). USE PLAIN TEXT ONLY.
            7. If you find multiple matches, list them briefly.
        `;
        const result = await gemini.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error('Gemini Output Error:', e.message);
        return "I encountered an error processing your request. Please try again or contact administration.";
    }
}

bot.start((ctx) => {
    ctx.reply("Hi, I'm MSAJCE Assistant! What assistance do you need today?\n\nI can help you with:\n• Transport (Bus Routes & Timings)\n• Admission Details\n• Personnel & Contacts\n• Department Information\n• Campus Facilities");
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const query = ctx.message.text;

    try {
        console.log(`Query from ${userId}: ${query}`);
        await ctx.sendChatAction('typing');

        // Step 1: Retrieval
        const { people, routes } = await retriever.searchEntities(query);
        const vectorMatches = await retriever.searchVectorStore(query);
        const context = { people, routes, vectorMatches };

        // Step 2: Session/History
        const sessionData = await getSession(userId);
        const chatHistory = sessionData.history.slice(-5); // Last 5 messages

        // Step 3: Reasoning (Stage 1)
        const reasoning = await getReasoning(query, context, chatHistory);

        // Step 4: Output Formulation (Stage 2)
        const finalAnswer = await getFinalResponse(query, reasoning, context);

        // Update history
        sessionData.history.push({ role: 'user', content: query });
        sessionData.history.push({ role: 'assistant', content: finalAnswer });
        await setSession(userId, sessionData);

        await ctx.reply(finalAnswer); 
    } catch (e) {
        console.error('Bot Request Full Error:', e);
        ctx.reply("Oops! I had trouble formatting the response correctly. Re-trying...");
    }
});

bot.launch();
console.log('Academic Bot is running...');

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
