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

  // --- ADVANCED DETERMINISTIC DOMAINS ---
  async handleDeptQuery(query) {
    await this.connect();
    const normalized = query.toLowerCase().replace(/dept|department/g, '').trim();
    const depts = await this.db.collection('structured_data').find({
        $or: [ { name: { $regex: normalized, $options: 'i' } }, { code: { $regex: normalized, $options: 'i' } } ]
    }).toArray();

    if (depts.length === 0) return null;
    let output = `DEPARTMENT INFO:\n\n`;
    depts.forEach(d => {
        output += `Name: ${d.name}\nHead: ${d.hod || 'N/A'}\nContact: ${d.contact || 'N/A'}\nEmail: ${d.email || 'N/A'}\n\n`;
    });
    return output.trim();
  }

  async handleTransportQuery(query) {
    await this.connect();
    let normalized = query.toLowerCase().replace(/bus|route|stop/g, '').trim();
    
    let routes = await this.db.collection('transport_routes').find({
        $or: [ { route_no: { $regex: normalized, $options: 'i' } }, { driver: { $regex: normalized, $options: 'i' } } ]
    }).toArray();

    let stops = await this.db.collection('transport_stops').find({
        $or: [ { stop: { $regex: normalized, $options: 'i' } }, { normalized_stop: { $regex: normalized, $options: 'i' } } ]
    }).toArray();

    // Part 13: Fallback (Broaden search if no matches)
    if (routes.length === 0 && stops.length === 0 && normalized.length > 3) {
        console.log('[FALLBACK] Broadening transport search...');
        const partial = normalized.substring(0, 4);
        stops = await this.db.collection('transport_stops').find({
            $or: [ { stop: { $regex: partial, $options: 'i' } }, { normalized_stop: { $regex: partial, $options: 'i' } } ]
        }).toArray();
    }

    if (routes.length === 0 && stops.length === 0) return null;

    let output = `TRANSPORT INFO for "${normalized}":\n\n`;
    if (routes.length > 0) {
        output += `ROUTES:\n`;
        routes.forEach(r => output += `- Route ${r.route_no}\n  Driver: ${r.driver || 'N/A'}\n  Phone: ${r.phone || 'N/A'}\n\n`);
    }
    if (stops.length > 0) {
        output += `STOPS:\n`;
        const grouped = {};
        stops.forEach(s => {
            if (!grouped[s.route_no]) grouped[s.route_no] = [];
            grouped[s.route_no].push(`- ${s.stop} at ${s.time || 'N/A'}`);
        });
        for (const [r, sList] of Object.entries(grouped)) output += `Route ${r}:\n${sList.join('\n')}\n\n`;
    }
    return output.trim();
  }

  async handleMtcQuery(query) {
    await this.connect();
    const normalized = query.toLowerCase();
    const mtc = await this.db.collection('mtc_routes').find({}).toArray();
    const matches = mtc.filter(m => normalized.includes(m.route_no.toLowerCase()) || m.stops.some(s => normalized.includes(s.toLowerCase())));
    if (matches.length === 0) return null;
    let output = "MTC PUBLIC TRANSPORT:\n\n";
    matches.forEach(m => output += `- Route ${m.route_no}: ${m.from} to ${m.to}\n  Key Stops: ${m.stops.slice(0, 5).join(', ')}...\n\n`);
    return output.trim();
  }

  splitQuery(query) {
    const q = query.toLowerCase();
    if (q.includes(' and ') || q.includes(' & ')) return q.split(/\s+and\s+|\s+&\s+/).map(s => s.trim());
    return [q];
  }

  // --- HYBRID RAG SEARCH (Part 4) ---
  async retrieve(query) {
    await this.connect();
    const normalizedQuery = query.toLowerCase().trim();
    const { intents } = this.detectIntent(query);
    const context = { people: [], routes: [], vectorMatches: [], relevantDept: [] };

    // Hybrid Search: BM25 (Keyword) + Semantic
    if (intents.includes('PEOPLE') || intents.includes('GENERAL')) {
      const personName = this.extractPersonName(normalizedQuery) || normalizedQuery;
      context.people = await this.db.collection('entities_master').find({
          $or: [{ normalized_name: { $regex: personName, $options: 'i' } }, { aliases: { $in: [personName] } }]
      }).limit(5).toArray();
    }

    if (normalizedQuery.match(/dept|department/i)) {
        const dName = normalizedQuery.replace(/dept|department/g, '').trim();
        context.relevantDept = await this.db.collection('structured_data').find({
            name: { $regex: dName, $options: 'i' }
        }).limit(2).toArray();
    }

    // Semantic Vector Search (Part 4, Step 2)
    const embedding = await this.getEmbedding(normalizedQuery);
    if (embedding) {
      const results = await this.db.collection('vector_store').find({}).toArray();
      const scored = results.map(doc => ({
        score: doc.embedding.reduce((sum, val, idx) => sum + val * embedding[idx], 0),
        text: doc.text,
        source: doc.source || 'Knowledge Base'
      })).sort((a, b) => b.score - a.score).slice(0, 10); // Part 4, Step 3: Top 10
      
      // Re-ranking (Prioritize metadata matches)
      context.vectorMatches = scored.filter(s => s.score > 0.4).slice(0, 5).map(s => ({ 
          text: s.text?.substring(0, 300),
          source: s.source 
      }));
    }
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
