const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const gemini = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", generationConfig: { maxOutputTokens: 1000 } });

class RAGService {
    async generate(query, context, history = []) {
        const report = { steps: [], tokens: { reasoning: 0, formulation: 0 } };
        try {
            report.steps.push("Retrieval Successful");
            
            // Stage 1: Reasoning (NVIDIA NIM)
            report.steps.push("Identifying Intent & Reasoning (Llama 3.1 405B)");
            const reasoningRes = await this.getReasoningResponse(query, context, history);
            const reasoning = reasoningRes.content;
            report.tokens.reasoning = reasoningRes.usage?.total_tokens || 0;
            
            // Stage 2: Formulation (Gemini)
            report.steps.push("Generating Grounded Final Answer (Gemini 3 Flash)");
            const finalRes = await this.getFinalResponse(query, reasoning, context);
            const response = finalRes.text;
            report.tokens.formulation = finalRes.usage?.totalTokens || 0;
            
            report.steps.push("Response Delivered");
            return { response, report };
        } catch (e) {
            console.error('RAG Generation Error:', e.message);
            return { response: "Internal error processing the reply. Please retry.", report };
        }
    }

    async getReasoningResponse(query, context, history) {
        try {
            // Trim context to keep input tokens low
            const trimmedContext = JSON.stringify(context).substring(0, 1500);
            const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
                model: "meta/llama-3.1-405b-instruct",
                messages: [
                    { role: "system", content: "Reasoning Engine for MSAJCE. Briefly analyze the query intent and key facts. Be concise." },
                    { role: "user", content: `Query: ${query}\nContext: ${trimmedContext}` }
                ],
                temperature: 0.1,
                max_tokens: 500
            }, {
                headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 10000
            });
            return { content: res.data.choices[0].message.content, usage: res.data.usage };
        } catch (e) { 
            console.error('[RAG] NVIDIA Reasoning Failed:', e.message);
            return { content: "Reasoning failed.", usage: { total_tokens: 0 } }; 
        }
    }

    async getFinalResponse(query, reasoning, context) {
        const trimmedData = JSON.stringify(context).substring(0, 1500);
        const prompt = `You are MSAJCE Assistant. Answer ONLY from DATA.
QUERY: ${query}
REASONING: ${reasoning}
DATA: ${trimmedData}
RULES:
1. If query is about a PERSON, never mention bus stops or transport.
2. If user says "Yogesh R", return ONLY that exact person, not "Dr. Elliss Yogesh R".
3. Multiple people only if vague name (eg just "Yogesh").
4. Plain text, dash bullets, no bold, no italic.
5. Max 5 bullets. No filler like "Based on the provided data".`;
        const result = await gemini.generateContent(prompt);
        return { text: result.response.text(), usage: result.response.usageMetadata };
    }
}

module.exports = new RAGService();
