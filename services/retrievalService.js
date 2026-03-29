const { MongoClient } = require('mongodb');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MAIN_DATABASE_NAME || 'msajce';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

class RetrievalService {
  constructor() {
    this.client = new MongoClient(MONGO_URI, { 
        serverSelectionTimeoutMS: 30000, 
        connectTimeoutMS: 30000 
    });
    this.db = null;
    this.cacheTTL = 3600; 
  }

  async connect() {
    try {
        if (!this.db) {
          console.log('[RETRIEVAL] Connecting to MongoDB...');
          await this.client.connect();
          this.db = this.client.db(DB_NAME);
          console.log('[RETRIEVAL] DB Connected.');
        }
    } catch (e) {
        console.error('[RETRIEVAL] DB Connection Failed:', e.message);
        throw e;
    }
  }

  // --- SMART TTL CACHING (Redis) ---
  async getCache(key) {
    try {
      const res = await axios.get(`${REDIS_URL}/get/cache:${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        timeout: 10000
      });
      return res.data.result ? JSON.parse(res.data.result) : null;
    } catch (e) { return null; }
  }

  async setCache(key, value) {
    try {
      await axios.post(`${REDIS_URL}/setex/cache:${encodeURIComponent(key)}/${this.cacheTTL}`, JSON.stringify(value), {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        timeout: 10000
      });
    } catch (e) { console.error('Cache Store Error:', e.message); }
  }

  // --- INTENT SPLITTING & DEPARTMENT DETECTION ---
  detectIntent(query) {
    const q = query.toLowerCase();
    const intents = [];
    if (q.includes('bus') || q.includes('route') || q.includes('ar-') || q.includes('transport') || q.includes('stop')) intents.push('TRANSPORT');
    if (q.includes('admission') || q.includes('fee') || q.includes('eligibility') || q.includes('apply')) intents.push('ADMISSION');
    if (q.includes('who is') || q.includes('tell me') || q.includes('abt') || q.includes('about') || q.includes('principal') || q.includes('professor') || q.includes('staff') || q.includes('hod')) intents.push('PEOPLE');
    if (q.includes('infra') || q.includes('library') || q.includes('hostel')) intents.push('FACILITIES');
    
    const depts = ['it', 'cse', 'ece', 'eee', 'civil', 'mech', 'aids', 'aiml', 'cyber'];
    const detectedDept = depts.find(d => q.includes(d));
    
    return { intents: intents.length > 0 ? intents : ['GENERAL'], department: detectedDept || 'GENERAL' };
  }

  // Extract the actual person name from queries like 'who is ram' or 'tell me abt yogesh r'
  extractPersonName(query) {
    const q = query.toLowerCase().trim();
    return q.replace(/^(who is|tell me about|tell me abt|about|abt|find)\s*/i, '').trim();
  }

  // --- HYBRID SEARCH LOGIC ---
  async retrieve(query) {
    await this.connect();
    const normalizedQuery = query.toLowerCase().trim();
    
    const cached = await this.getCache(normalizedQuery);
    if (cached) return cached;

    const { intents, department } = this.detectIntent(query);
    const context = { people: [], routes: [], vectorMatches: [], department, intent: intents[0] };

    // 1. Entity Search (PEOPLE)
    if (intents.includes('PEOPLE') || intents.includes('GENERAL')) {
      const personName = this.extractPersonName(normalizedQuery) || normalizedQuery;
      
      const rawPeople = await this.db.collection('entities_master').find({
        $or: [
          { normalized_name: { $regex: personName, $options: 'i' } },
          { aliases: { $in: [personName] } }
        ]
      }).limit(10).toArray();

      // Strip heavy fields to reduce token usage
      context.people = rawPeople.map(p => ({
        name: p.name, role: p.role, mobile: p.mobile, email: p.email,
        type: p.type, source: p.source, id: p.id,
        ...(p.education ? { education: p.education } : {}),
        ...(p.projects ? { projects: p.projects } : {}),
      }));

      if (normalizedQuery.includes('principal')) {
          context.people = context.people.sort((a,b) => (a.role?.includes('Principal') ? -1 : 1));
      }
    }

    // 2. Transport Search — ONLY when intent is explicitly TRANSPORT (never for PEOPLE queries)
    if (intents.includes('TRANSPORT') && !intents.includes('PEOPLE')) {
      context.routes = await this.db.collection('transport_routes').find({
        $or: [
          { route_no: { $regex: normalizedQuery, $options: 'i' } },
          { "stops.stop": { $regex: normalizedQuery, $options: 'i' } }
        ]
      }).toArray();
    }

    // 3. Vector Search (General Info)
    const embedding = await this.getEmbedding(normalizedQuery);
    if (embedding) {
      const results = await this.db.collection('vector_store').find({}).toArray();
      const scored = results.map(doc => ({
        score: doc.embedding.reduce((sum, val, idx) => sum + val * embedding[idx], 0),
        text: doc.text,
        source: doc.source
      })).sort((a, b) => b.score - a.score).slice(0, 3);
      
      // Only send text snippets to AI, never raw embeddings
      context.vectorMatches = scored.map(s => ({ text: s.text?.substring(0, 300), source: s.source, score: s.score.toFixed(3) }));
    }

    await this.setCache(normalizedQuery, context);
    return context;
  }

  async getEmbedding(text) {
    try {
      const response = await axios.post('https://openrouter.ai/api/v1/embeddings', {
        model: 'openai/text-embedding-3-small',
        input: text
      }, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return response.data.data[0].embedding;
    } catch (e) { return null; }
  }
}

module.exports = new RetrievalService();
