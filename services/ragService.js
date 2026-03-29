const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

class RagService {
  // Part 6: Query Optimization (Query Rewriting / Multi-Query)
  async optimizeQuery(query, history = []) {
    try {
      console.log(`[RAG] Optimizing query: "${query}"`);
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'google/gemini-2.0-flash-lite-001',
        messages: [
          { role: 'system', content: 'Rewrite the user query for a database search. Keep it short and factual.' },
          { role: 'user', content: `Query: ${query}\nHistory: ${JSON.stringify(history.slice(-2))}` }
        ],
        temperature: 0.1
      }, { 
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 10000 
      });
      const optimized = response.data.choices[0].message.content;
      console.log(`[RAG] Query optimized to: "${optimized}"`);
      return optimized;
    } catch (e) { 
      console.error(`[RAG] Query optimization failed: ${e.message}`);
      return query; 
    }
  }

  // Part 11: Confidence Scoring Layer
  calculateConfidence(context, response) {
    let score = 0;
    if (context.people?.length > 0) score += 40;
    if (context.routes?.length > 0) score += 40;
    if (context.vectorMatches?.length > 0) score += 20;
    
    // Penalize if response contains "couldn't find"
    if (response?.toLowerCase().includes("couldn't find")) score = 0;
    return Math.min(score, 100);
  }

  async generate(query, context, history = []) {
    const report = { steps: ["Part 6: Optimization", "Part 7: Context Aggregation", "Part 11: Scoring"], tokens: 0 };
    
    // Part 6: Optimization
    const optimized = await this.optimizeQuery(query, history);
    
    // Part 7: Aggregation
    const contextString = `
    PEOPLE: ${JSON.stringify(context.people || [])}
    ROUTES: ${JSON.stringify(context.routes || [])}
    DEPT: ${JSON.stringify(context.relevantDept || [])}
    KNOWLEDGE: ${context.vectorMatches?.map(v => v.text).join('\n')}
    `.substring(0, 3000);

    // Part 12: Summarization-Only Generation
    const prompt = `You are the MSAJCE Academic Assistant.
STRICT RULE: Use ONLY the provided context. If context is empty, say "I couldn't find that information".
NEVER approximate names or routes.

USER QUERY: ${optimized}
CONTEXT:
${contextString}

FORMAT:
- Structured bullets
- No duplication
- Confidence: {SCORE}%
    `;

    try {
      console.log(`[RAG] Generating response using prompt length: ${prompt.length}`);
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.1,
        max_tokens: 1500
      }, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 20000
      });

      let text = response.data.choices[0].message.content;
      console.log(`[RAG] Response generated: ${text.substring(0, 100)}...`);
      const confidence = this.calculateConfidence(context, text);
      text = text.replace('{SCORE}', confidence);

      return { response: text, report };
    } catch (e) {
      console.error(`[RAG] Generation failed: ${e.message}`);
      return { response: "Internal error processing the reply. Please retry.", report };
    }
  }
}

module.exports = new RagService();
