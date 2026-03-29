const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const gemini = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

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
            const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
                model: "meta/llama-3.1-405b-instruct",
                messages: [
                    { role: "system", content: "Reasoning Engine for MSAJCE. Analyze query, context, and history. Decide the factual output." },
                    { role: "user", content: `Query: ${query}\n\nContext: ${JSON.stringify(context)}\n\nHistory: ${JSON.stringify(history)}` }
                ],
                temperature: 0.1
            }, {
                headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' }
            });
            return { content: res.data.choices[0].message.content, usage: res.data.usage };
        } catch (e) { return { content: "Reasoning failed.", usage: { total_tokens: 0 } }; }
    }

    async getFinalResponse(query, reasoning, context) {
        const prompt = `
            You are MSAJCE Assistant. Strictly answer only based on DATA provided.
            QUERY: ${query}
            REASONING: ${reasoning}
            DATA: ${JSON.stringify(context)}
            LAWS: Use plain text, dash bullets, no extra info.
        `;
        const result = await gemini.generateContent(prompt);
        return { text: result.response.text(), usage: result.response.usageMetadata };
    }
}

module.exports = new RAGService();
