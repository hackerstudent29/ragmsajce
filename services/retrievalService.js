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

  // ─── PART 1: QUERY UNDERSTANDING ───────────────────────────────

  // Step 1: Normalize raw query
  normalizeQuery(query) {
    return query.toLowerCase().replace(/[?.!,'"]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Step 2: Intent detection — flexible, pattern-based
  detectIntent(query) {
    const q = this.normalizeQuery(query);
    const intents = [];

    // Transport: route numbers, bus keywords, driver
    if (q.match(/\b(ar|r)-?\d+\b/) || q.match(/\b(bus|route|stop|transport|driver|van)\b/)) intents.push('TRANSPORT');
    // Admission
    if (q.match(/\b(admission|fee|eligibility|apply|counseling|scholarship)\b/)) intents.push('ADMISSION');
    // Department / HOD
    if (q.match(/\b(hod|head of|dept|department|office)\b/)) intents.push('DEPT');
    // Person — broad natural language patterns
    if (q.match(/\b(who is|tell me|know about|know abt|details of|about|abt)\b/) || q.match(/\b(principal|professor|staff|chairman|secretary|registrar)\b/)) intents.push('PEOPLE');
    // Computation
    if (q.match(/\b(earliest|latest|first bus|last bus|how many|count|when does)\b/)) intents.push('COMPUTATION');
    // Facilities
    if (q.match(/\b(infra|library|hostel|canteen|auditorium|sports|lab)\b/)) intents.push('FACILITIES');

    return { intents: intents.length > 0 ? intents : ['GENERAL'] };
  }

  // Step 3: Extract person name from natural language
  extractPersonName(query) {
    const q = this.normalizeQuery(query);
    // Ordered from most specific to least, so we grab the right slice
    const triggers = [
      'i want to know about', 'i want to know abt', 'i wanna know about',
      'tell me about', 'tell me abt', 'know about', 'know abt',
      'details of', 'who is', 'about', 'abt', 'find'
    ];
    let name = q;
    for (const t of triggers) {
      const idx = q.indexOf(t);
      if (idx !== -1) {
        name = q.substring(idx + t.length).trim();
        break;
      }
    }
    // Strip titles and noise
    return name.replace(/\b(the|dr|mr|mrs|ms|prof|hod|head of|professor|principal)\b/gi, '').replace(/\s+/g, ' ').trim();
  }

  // Step 4: Extract route number — ar8→AR-8, r22→R-22, route 22→R-22
  extractRouteNumber(query) {
    const q = this.normalizeQuery(query);
    // Match "ar-8", "ar8", "AR 8", "r-22", "r22", "route 22"
    const m = q.match(/\b(ar|r)-?\s*(\d+)\b/i);
    if (m) return `${m[1].toUpperCase()}-${m[2]}`;
    const m2 = q.match(/\broute\s*(\d+)\b/i);
    if (m2) return `R-${m2[1]}`;
    return null;
  }

  // Routing helpers
  isPersonQuery(query) {
    const { intents } = this.detectIntent(query);
    return intents.includes('PEOPLE') && !intents.includes('TRANSPORT');
  }

  isTransportQuery(query) {
    const { intents } = this.detectIntent(query);
    return intents.includes('TRANSPORT') || intents.includes('COMPUTATION');
  }

  isDeptQuery(query) {
    const { intents } = this.detectIntent(query);
    return intents.includes('DEPT') && !intents.includes('PEOPLE');
  }

  // ─── PART 6: ENTITY SYSTEM ─────────────────────────────────────

  rankPeople(people, query) {
    const q = this.normalizeQuery(query);
    return people.sort((a,b) => {
        if (a.normalized_name === q && b.normalized_name !== q) return -1;
        if (b.normalized_name === q && a.normalized_name !== q) return 1;
        const getScore = (p) => {
            const role = (p.role || '').toLowerCase();
            const type = (p.type || '').toLowerCase();
            if (role.includes('principal') || role.includes('chairman')) return 100;
            if (role.includes('hod') || role.includes('head')) return 80;
            if (type.includes('faculty') || type.includes('professor')) return 60;
            if (type.includes('student')) return 20;
            return 10;
        };
        return getScore(b) - getScore(a);
    });
  }

  async handlePersonQuery(query) {
    await this.connect();
    const personName = this.extractPersonName(query);
    if (!personName || personName.length < 2) return null;

    let people = await this.db.collection('entities_master').find({
      $or: [
        { normalized_name: personName },
        { aliases: { $in: [personName] } },
        { normalized_name: { $regex: personName, $options: 'i' } }
      ]
    }).limit(15).toArray();

    if (people.length === 0) return null;
    people = this.rankPeople(people, personName);

    const grouped = { admin: [], faculty: [], students: [], others: [] };
    people.forEach(p => {
      const type = (p.type || '').toLowerCase();
      const role = (p.role || '').toLowerCase();
      const entry = `- ${p.name}\n  Role: ${p.role || 'N/A'}${p.department ? ` (${p.department} Dept)` : ''}${p.mobile ? `\n  Contact: ${p.mobile}` : ''}`;
      
      if (role.includes('principal') || role.includes('chairman') || role.includes('admin')) grouped.admin.push(entry);
      else if (type.includes('faculty') || type.includes('professor') || type.includes('staff')) grouped.faculty.push(entry);
      else if (type.includes('student')) grouped.students.push(entry);
      else grouped.others.push(entry);
    });

    let output = `Results for "${personName}":\n\n`;
    if (grouped.admin.length > 0) output += `ADMINISTRATION:\n${grouped.admin.join('\n\n')}\n\n`;
    if (grouped.faculty.length > 0) output += `FACULTY & STAFF:\n${grouped.faculty.join('\n\n')}\n\n`;
    if (grouped.students.length > 0) output += `STUDENTS:\n${grouped.students.join('\n\n')}\n\n`;
    if (grouped.others.length > 0) output += `OTHER:\n${grouped.others.join('\n\n')}\n\n`;
    return output.trim();
  }

  // ─── DEPT HANDLER ──────────────────────────────────────────────

  async handleDeptQuery(query) {
    await this.connect();
    const q = this.normalizeQuery(query);
    // Extract dept code or name
    const deptCodes = { it: 'Information Technology', cse: 'Computer Science', eee: 'Electrical', ece: 'Electronics', mech: 'Mechanical', civil: 'Civil' };
    let searchTerm = q.replace(/\b(dept|department|hod|head of|office|who is the)\b/g, '').trim();
    
    const depts = await this.db.collection('structured_data').find({
        $or: [ 
          { name: { $regex: searchTerm, $options: 'i' } }, 
          { code: { $regex: searchTerm, $options: 'i' } } 
        ]
    }).toArray();
    if (depts.length === 0) return null;
    let output = "DEPARTMENT INFO:\n\n";
    depts.forEach(d => output += `- ${d.name}${d.code ? ` (${d.code})` : ''}\n  Head: ${d.hod || 'N/A'}\n  Contact: ${d.contact || 'N/A'}\n\n`);
    return output.trim();
  }

  // ─── PART 8: COMPUTATION LAYER ─────────────────────────────────

  async handleLogicalTransportQuery(query) {
    await this.connect();
    const q = this.normalizeQuery(query);
    
    if (q.match(/how many\s*(bus|route)/)) {
        const count = await this.db.collection('transport_routes').countDocuments({});
        return `The college operates ${count} bus routes across Chennai.`;
    }
    if (q.match(/\b(earliest|first bus)\b/)) {
        const stops = await this.db.collection('transport_stops').find({}).sort({ time: 1 }).limit(5).toArray();
        if (stops.length === 0) return null;
        let out = "EARLIEST BUS TIMINGS:\n\n";
        stops.forEach(s => out += `- ${s.time}: ${s.stop} (Route ${s.route_no})\n`);
        return out.trim();
    }
    if (q.match(/\b(latest|last bus|last stop)\b/)) {
        const stops = await this.db.collection('transport_stops').find({ stop: /college/i }).toArray();
        if (stops.length === 0) return null;
        let out = "COLLEGE ARRIVAL TIMES:\n\n";
        stops.forEach(s => out += `- Route ${s.route_no}: Arrives at ${s.time}\n`);
        return out.trim();
    }
    return null;
  }

  // ─── PART 7: TRANSPORT HANDLING ────────────────────────────────

  async handleTransportQuery(query) {
    await this.connect();
    
    // Try computation first
    const logical = await this.handleLogicalTransportQuery(query);
    if (logical) return logical;

    // Extract route number (ar8 → AR-8)
    const routeNo = this.extractRouteNumber(query);
    
    if (routeNo) {
      // Route-specific query — fetch route info + all stops
      const routes = await this.db.collection('transport_routes').find({ route_no: routeNo }).toArray();
      const stops = await this.db.collection('transport_stops').find({ route_no: routeNo }).sort({ time: 1 }).toArray();
      
      if (routes.length === 0 && stops.length === 0) return null;
      let output = `ROUTE ${routeNo} INFO:\n\n`;
      if (routes.length > 0) {
        routes.forEach(r => output += `Driver: ${r.driver || 'N/A'}\nPhone: ${r.phone || 'N/A'}\n\n`);
      }
      if (stops.length > 0) {
        output += `STOPS (${stops.length} total):\n`;
        stops.forEach(s => output += `- ${s.time || 'N/A'}: ${s.stop}\n`);
      }
      return output.trim();
    }

    // General transport query — search by stop name, driver name etc.
    const q = this.normalizeQuery(query);
    let searchTerm = q.replace(/\b(bus|route|stop|full|show|all|details|complete|the|of|for|me|tell|what|is|are|in|at|to|from)\b/g, '').replace(/\s+/g, ' ').trim();
    if (!searchTerm || searchTerm.length < 2) return null;
    
    let routes = await this.db.collection('transport_routes').find({
      $or: [ { route_no: { $regex: searchTerm, $options: 'i' } }, { driver: { $regex: searchTerm, $options: 'i' } } ]
    }).toArray();
    let stops = await this.db.collection('transport_stops').find({
      $or: [ { stop: { $regex: searchTerm, $options: 'i' } }, { normalized_stop: { $regex: searchTerm, $options: 'i' } } ]
    }).toArray();

    if (routes.length === 0 && stops.length === 0) return null;
    let output = `TRANSPORT RESULTS for "${searchTerm}":\n\n`;
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

  // ─── MTC ───────────────────────────────────────────────────────

  async handleMtcQuery(query) {
    await this.connect();
    const q = this.normalizeQuery(query);
    const mtc = await this.db.collection('mtc_routes').find({}).toArray();
    const matches = mtc.filter(m => q.includes(m.route_no.toLowerCase()) || m.stops.some(s => q.includes(s.toLowerCase())));
    if (matches.length === 0) return null;
    let output = "MTC PUBLIC TRANSPORT:\n\n";
    matches.forEach(m => output += `- Route ${m.route_no}: ${m.from} to ${m.to}\n  Key Stops: ${m.stops.slice(0, 5).join(', ')}...\n\n`);
    return output.trim();
  }

  // ─── MULTI-QUERY ──────────────────────────────────────────────

  splitQuery(query) {
    const q = query.toLowerCase();
    if (q.includes(' and ') || q.includes(' & ')) return q.split(/\s+and\s+|\s+&\s+/).map(s => s.trim());
    return [q];
  }

  // ─── PART 9: RAG RETRIEVAL ─────────────────────────────────────

  async retrieve(query) {
    await this.connect();
    const q = this.normalizeQuery(query);
    const { intents } = this.detectIntent(query);
    const context = { people: [], routes: [], vectorMatches: [], relevantDept: [] };

    if (intents.includes('PEOPLE') || intents.includes('GENERAL')) {
      const personName = this.extractPersonName(q) || q;
      context.people = await this.db.collection('entities_master').find({
          $or: [{ normalized_name: { $regex: personName, $options: 'i' } }, { aliases: { $in: [personName] } }]
      }).limit(5).toArray();
    }

    if (q.match(/dept|department/)) {
        const dName = q.replace(/dept|department/g, '').trim();
        context.relevantDept = await this.db.collection('structured_data').find({
            name: { $regex: dName, $options: 'i' }
        }).limit(2).toArray();
    }

    // Vector search
    const embedding = await this.getEmbedding(q);
    if (embedding) {
      const results = await this.db.collection('vector_store').find({}).toArray();
      const scored = results.map(doc => ({
        score: doc.embedding ? doc.embedding.reduce((sum, val, idx) => sum + val * embedding[idx], 0) : 0,
        text: doc.text,
        source: doc.source || 'Knowledge Base'
      })).sort((a, b) => b.score - a.score).slice(0, 10);
      
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

  // ─── CACHING ───────────────────────────────────────────────────

  async getCache(key) {
    try {
      const res = await axios.get(`${REDIS_URL}/get/cache:${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, timeout: 10000
      });
      return res.data.result ? JSON.parse(res.data.result) : null;
    } catch (e) { return null; }
  }

  async setCache(key, value) {
    try {
      await axios.post(`${REDIS_URL}/setex/cache:${encodeURIComponent(key)}/${this.cacheTTL}`, JSON.stringify(value), {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, timeout: 10000
      });
    } catch (e) {}
  }
}

module.exports = new RetrievalService();
