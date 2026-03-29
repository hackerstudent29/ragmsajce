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
    `;

    try {
      console.log(`[RAG] Generating response using prompt length: ${prompt.length}`);
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000
      }, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 25000
      });

      let text = response.data.choices[0].message.content;
      console.log(`[RAG] Response generated: ${text.substring(0, 50)}...`);

      return { response: text, report };
    } catch (e) {
      console.error(`[RAG] Generation failed: ${e.message}`);
      if (e.message.includes('402')) {
          console.warn('[RAG] Credits issue detected. Attempting free model fallback...');
          try {
              const fallback = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: 'google/gemini-2.0-flash-lite-preview-001:free',
                    messages: [{ role: 'system', content: prompt }],
                    temperature: 0.1
                }, { headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` }, timeout: 20000 });
              return { response: fallback.data.choices[0].message.content, report };
          } catch (f) {}
      }
      return { response: "I'm having trouble connecting to my knowledge base right now. Please try again in a moment.", report };
    }

  }
}

module.exports = new RagService();
