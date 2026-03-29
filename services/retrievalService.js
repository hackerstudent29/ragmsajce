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

  // --- NEW: STRICT ENTITY ROUTING ---
  isPersonQuery(query) {
    const q = query.toLowerCase();
    const triggers = ['who is', 'tell me about', 'tell me abt', 'abt', 'about', 'principal', 'professor', 'hod', 'staff', 'chairman', 'secretary'];
    return triggers.some(t => q.includes(t));
  }

  async handlePersonQuery(query) {
    await this.connect();
    const personName = this.extractPersonName(query);
    
    const people = await this.db.collection('entities_master').find({
      $or: [
        { normalized_name: personName },
        { aliases: { $in: [personName] } },
        { normalized_name: { $regex: personName, $options: 'i' } }
      ]
    }).limit(15).toArray();

    if (people.length === 0) return null;

    const grouped = { admin: [], faculty: [], students: [], others: [] };
    people.forEach(p => {
      const type = (p.type || '').toLowerCase();
      const entry = `- ${p.name}\n  Role: ${p.role || 'N/A'}${p.department ? ` (${p.department} Dept)` : ''}${p.mobile ? `\n  Contact: ${p.mobile}` : ''}${p.email ? `\n  Email: ${p.email}` : ''}`;
      if (type.includes('principal') || type.includes('chairman') || type.includes('admin')) grouped.admin.push(entry);
      else if (type.includes('faculty') || type.includes('professor') || type.includes('hod')) grouped.faculty.push(entry);
      else if (type.includes('student')) grouped.students.push(entry);
      else grouped.others.push(entry);
    });

    let output = `I found matching records for "${personName}":\n\n`;
    if (grouped.admin.length > 0) output += `ADMINISTRATION:\n${grouped.admin.join('\n\n')}\n\n`;
    if (grouped.faculty.length > 0) output += `FACULTY & STAFF:\n${grouped.faculty.join('\n\n')}\n\n`;
    if (grouped.students.length > 0) output += `STUDENT RECORDS:\n${grouped.students.join('\n\n')}\n\n`;
    if (output === `I found matching records for "${personName}":\n\n` && grouped.others.length > 0) {
      output += `RECORDS:\n${grouped.others.join('\n\n')}`;
    }
    return output.trim();
  }

  // --- HYBRID SEARCH LOGIC ---
  async retrieve(query) {
    await this.connect();
    const normalizedQuery = query.toLowerCase().trim();
    const cached = await this.getCache(normalizedQuery);
    if (cached) return cached;

    const { intents, department } = this.detectIntent(query);
    const context = { people: [], routes: [], vectorMatches: [], department };

    if (intents.includes('PEOPLE') || intents.includes('GENERAL')) {
      const personName = this.extractPersonName(normalizedQuery) || normalizedQuery;
      const rawPeople = await this.db.collection('entities_master').find({
        $or: [
          { normalized_name: { $regex: personName, $options: 'i' } },
          { aliases: { $in: [personName] } }
        ]
      }).limit(10).toArray();

      context.people = rawPeople.map(p => ({
        name: p.name, role: p.role, mobile: p.mobile, email: p.email,
        type: p.type, id: p.id,
        ...(p.education ? { education: p.education } : {}),
      }));
    }

    if (intents.includes('TRANSPORT') && !intents.includes('PEOPLE')) {
      context.routes = await this.db.collection('transport_routes').find({
        $or: [
          { route_no: { $regex: normalizedQuery, $options: 'i' } },
          { "stops.stop": { $regex: normalizedQuery, $options: 'i' } }
        ]
      }).toArray();
    }

    const embedding = await this.getEmbedding(normalizedQuery);
    if (embedding) {
      const results = await this.db.collection('vector_store').find({}).toArray();
      const scored = results.map(doc => ({
        score: doc.embedding.reduce((sum, val, idx) => sum + val * embedding[idx], 0),
        text: doc.text,
        source: doc.source
      })).sort((a, b) => b.score - a.score).slice(0, 3);
      context.vectorMatches = scored.map(s => ({ text: s.text?.substring(0, 300), source: s.source }));
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
