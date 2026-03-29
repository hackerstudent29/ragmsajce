const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

class RAGService {
    async generate(query, context, history = []) {
        const report = { steps: [], tokens: { reasoning: 0, formulation: 0 } };
        try {
            report.steps.push("Retrieval Successful");
            
            // Stage 1: Reasoning
            report.steps.push("Identifying Intent & Reasoning (Llama 3.1 405B)");
            const reasoningRes = await this.getReasoning(query, context);
            report.tokens.reasoning = reasoningRes.tokens;
            
            // Stage 2: Formulation
            report.steps.push("Generating Grounded Final Answer (Gemini 2.0 Flash)");
            const finalRes = await this.getResponse(query, reasoningRes.text, context);
            report.tokens.formulation = finalRes.tokens;
            
            report.steps.push("Response Delivered");
            return { response: finalRes.text, report };
        } catch (e) {
            console.error('RAG Error:', e.message);
            return { response: "Internal error. Please retry.", report };
        }
    }

    async callModel(model, messages, maxTokens) {
        const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.1
        }, {
            headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: 30000
        });
        return {
            text: res.data.choices[0].message.content,
            tokens: res.data.usage?.total_tokens || 0,
            promptTokens: res.data.usage?.prompt_tokens || 0,
            completionTokens: res.data.usage?.completion_tokens || 0
        };
    }

    async getReasoning(query, context) {
        try {
            const trimmed = JSON.stringify(context).substring(0, 1500);
            return await this.callModel('meta-llama/llama-3.1-8b-instruct:free', [
                { role: "system", content: "Briefly analyze the query intent and identify key facts from context. Be concise." },
                { role: "user", content: `Query: ${query}\nContext: ${trimmed}` }
            ], 300);
        } catch (e) {
            console.error('[RAG] Reasoning Failed:', e.message);
            return { text: "Direct answer from context.", tokens: 0 };
        }
    }

    async getResponse(query, reasoning, context) {
        try {
            const trimmed = JSON.stringify(context).substring(0, 1500);
            return await this.callModel('google/gemini-2.0-flash-001', [
                { role: "user", content: `You are MSAJCE Assistant. Answer ONLY from DATA.
QUERY: ${query}
REASONING: ${reasoning}
DATA: ${trimmed}
RULES:
1. If query is about a PERSON, never mention bus stops or transport.
2. If user says "Yogesh R", return ONLY that exact person, not "Dr. Elliss Yogesh R".
3. Multiple people only if vague name (eg just "Yogesh").
4. Plain text, dash bullets, no bold, no italic.
5. Max 5 bullets. No filler.` }
            ], 500);
        } catch (e) {
            console.error('[RAG] Gemini Failed:', e.message);
            return { text: "Could not generate response.", tokens: 0 };
        }
    }
}

module.exports = new RAGService();
