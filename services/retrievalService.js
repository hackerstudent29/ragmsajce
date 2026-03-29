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
    this.client = new MongoClient(MONGO_URI);
    this.db = null;
    this.cacheTTL = 3600; // 1 Hour
  }

  async connect() {
    if (!this.db) {
      await this.client.connect();
      this.db = this.client.db(DB_NAME);
    }
  }

  // --- SMART TTL CACHING (Redis) ---
  async getCache(key) {
    try {
      const res = await axios.get(`${REDIS_URL}/get/cache:${key}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
      });
      return res.data.result ? JSON.parse(res.data.result) : null;
    } catch (e) { return null; }
  }

  async setCache(key, value) {
    try {
      await axios.post(`${REDIS_URL}/setex/cache:${key}/${this.cacheTTL}`, JSON.stringify(value), {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
      });
    } catch (e) { console.error('Cache Store Error:', e.message); }
  }

  // --- INTENT SPLITTING & DEPARTMENT DETECTION ---
  detectIntent(query) {
    const q = query.toLowerCase();
    const intents = [];
    if (q.includes('bus') || q.includes('route') || q.includes('ar-') || q.includes('transport')) intents.push('TRANSPORT');
    if (q.includes('admission') || q.includes('fee') || q.includes('eligibility') || q.includes('apply')) intents.push('ADMISSION');
    if (q.includes('who is') || q.includes('principal') || q.includes('professor') || q.includes('staff')) intents.push('PEOPLE');
    if (q.includes('infra') || q.includes('library') || q.includes('hostel')) intents.push('FACILITIES');
    
    // Dept detection
    const depts = ['it', 'cse', 'ece', 'eee', 'civil', 'mech', 'aids', 'aiml', 'cyber'];
    const detectedDept = depts.find(d => q.includes(d));
    
    return { intents: intents.length > 0 ? intents : ['GENERAL'], department: detectedDept || 'GENERAL' };
  }

  // --- HYBRID SEARCH LOGIC ---
  async retrieve(query) {
    await this.connect();
    const normalizedQuery = query.toLowerCase().trim();
    
    // Check Cache first
    const cached = await this.getCache(normalizedQuery);
    if (cached) return cached;

    const { intents, department } = this.detectIntent(query);
    const context = { people: [], routes: [], vectorMatches: [], department };

    // 1. Entity Search (PEOPLE)
    if (intents.includes('PEOPLE') || intents.includes('GENERAL')) {
      context.people = await this.db.collection('entities_master').find({
        $or: [
          { normalized_name: { $regex: normalizedQuery, $options: 'i' } },
          { aliases: { $in: [normalizedQuery] } }
        ]
      }).limit(10).toArray();

      // Priority Rule: If role specify (eg "principal"), prioritize
      if (normalizedQuery.includes('principal')) {
          context.people = context.people.sort((a,b) => (a.role?.includes('Principal') ? -1 : 1));
      }
    }

    // 2. Transport Search
    if (intents.includes('TRANSPORT')) {
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
      context.vectorMatches = results.map(doc => ({
        ...doc, 
        score: doc.embedding.reduce((sum, val, idx) => sum + val * embedding[idx], 0)
      })).sort((a, b) => b.score - a.score).slice(0, 3);
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
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }
      });
      return response.data.data[0].embedding;
    } catch (e) { return null; }
  }
}

module.exports = new RetrievalService();
