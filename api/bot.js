const { Telegraf } = require('telegraf');
const retriever = require('../scripts/retriever');
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

async function getReasoning(query, context, history) {
    try {
        const response = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
            model: "meta/llama-3.1-405b-instruct",
            messages: [
                { role: "system", content: "You are the Reasoning Core for MSAJCE Academic Assistant. Analyze the query and provided context. Reason step-by-step. Identify entities, routes, or facts. Provide a summary for the output generation stage." },
                { role: "user", content: `Query: ${query}\n\nContext: ${JSON.stringify(context)}\n\nHistory: ${JSON.stringify(history)}` }
            ],
            temperature: 0.1,
            max_tokens: 1000
        }, {
            headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' }
        });
        return response.data.choices[0].message.content;
    } catch (e) {
        return "Reasoning failed. Falling back to context.";
    }
}

async function getFinalResponse(query, reasoning, context) {
    try {
        const prompt = `
            You are MSAJCE Assistant. Strict mode: Answer ONLY the user's specific question.
            
            QUESTION: ${query}
            REASONING: ${reasoning}
            DATA: ${JSON.stringify(context)}
            
            LAWS:
            1. RESET CONTEXT: Treat every query independently. NO info leakage from previous people.
            2. MULTI-RESULT HANDLING: If multiple people match, use this format for each:
               - Name: [Name]
                 Role: [Student/Faculty/Admin] ([Department/Batch])
                 Details: [Mobile/Info]
            3. DEDUPLICATION: Merge records if they describe the same person. Avoid repetition.
            4. PRIORITY: If user specifies a role (eg: "principal"), return only that person.
            5. FALLBACK: If no clear person matches, say "No matching person found".
            6. STYLE: NO BOLD (**). NO ITALICS (_). DASH BULLETS (-). PLAIN TEXT ONLY.
        `;
        const result = await gemini.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        return "Internal error processing the reply.";
    }
}

bot.start((ctx) => {
    ctx.reply("Hi, I'm MSAJCE Assistant! What assistance do you need today?\n\nI can help you with:\n• Transport (Bus Routes & Timings)\n• Admission Details\n• Personnel & Contacts\n• Department Information\n• Campus Facilities");
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const query = ctx.message.text;

    try {
        const { people, routes } = await retriever.searchEntities(query);
        const vectorMatches = await retriever.searchVectorStore(query);
        const context = { people, routes, vectorMatches };

        const sessionData = await getSession(userId);
        const queryLower = query.toLowerCase();
        const hasReference = queryLower.includes('him') || queryLower.includes('her') || queryLower.includes('that') || queryLower.includes('they') || queryLower.includes('who is he');
        const chatHistory = hasReference ? (sessionData.history.slice(-5)) : [];
        
        const reasoning = await getReasoning(query, context, chatHistory);
        const finalAnswer = await getFinalResponse(query, reasoning, context);

        sessionData.history.push({ role: 'user', content: query });
        sessionData.history.push({ role: 'assistant', content: finalAnswer });
        await setSession(userId, sessionData);

        await ctx.reply(finalAnswer);
    } catch (e) {
        console.error('Webhook Error:', e);
        await ctx.reply("Thinking failed. Please try again.");
    }
});

module.exports = async (request, response) => {
  try {
    await bot.handleUpdate(request.body, response);
  } catch (err) {
    console.error(err);
    response.status(500).send('Webhook Error');
  }
};
