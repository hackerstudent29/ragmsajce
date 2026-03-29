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
        try {
            // Stage 1: Reasoning (NVIDIA NIM)
            const reasoning = await this.getReasoning(query, context, history);
            
            // Stage 2: Formulation (Gemini)
            const response = await this.getFinalResponse(query, reasoning, context);
            
            return response;
        } catch (e) {
            console.error('RAG Generation Error:', e.message);
            return "Internal error processing the reply. Please retry.";
        }
    }

    async getReasoning(query, context, history) {
        try {
            const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
                model: "meta/llama-3.1-405b-instruct",
                messages: [
                    { role: "system", content: "Reasoning Engine for MSAJCE. Analyze query, context, and history. Decide the factual output and avoid conflicts. Do not directly answer yet." },
                    { role: "user", content: `Query: ${query}\n\nContext: ${JSON.stringify(context)}\n\nHistory: ${JSON.stringify(history)}` }
                ],
                temperature: 0.1
            }, {
                headers: { 'Authorization': `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' }
            });
            return res.data.choices[0].message.content;
        } catch (e) { return "Reasoning failed. Falling back to context."; }
    }

    async getFinalResponse(query, reasoning, context) {
        const prompt = `
            You are MSAJCE Assistant. Strictly answer only based on DATA provided.
            
            QUERY: ${query}
            REASONING: ${reasoning}
            DATA: ${JSON.stringify(context)}
            
            LAWS:
            1. INDEPENDENT QUERY: Treat each question separately. No history leakage.
            2. FORMAT: Dash bullets (-) only. No paragraphs.
            3. STYLE: PLAIN TEXT ONLY. NO BOLD (**), NO ITALICS (_).
            4. DISAMBIGUATION: If multiple matches, group them clearly (eg: Student vs Professor).
            5. ONLY THE SPECIFIC QUESTION: Do not add extra details about others.
        `;
        const result = await gemini.generateContent(prompt);
        return result.response.text();
    }
}

module.exports = new RAGService();
