const { MongoClient } = require('mongodb');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MAIN_DATABASE_NAME || 'msajce';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

class Retriever {
    constructor() {
        this.client = new MongoClient(MONGO_URI);
        this.db = null;
    }

    async connect() {
        if (!this.db) {
            await this.client.connect();
            this.db = this.client.db(DB_NAME);
        }
    }

    async getEmbedding(text) {
        try {
            const response = await axios.post('https://openrouter.ai/api/v1/embeddings', {
                model: 'openai/text-embedding-3-small',
                input: text
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data.data[0].embedding;
        } catch (e) {
            console.error('Retrieval Embedding Error:', e.message);
            return null;
        }
    }

    async searchEntities(query) {
        await this.connect();
        const normalizedQuery = query.toLowerCase().trim();
        
        // Search in entities_master (people)
        const people = await this.db.collection('entities_master').find({
            $or: [
                { normalized_name: { $regex: normalizedQuery, $options: 'i' } },
                { aliases: { $in: [normalizedQuery] } },
                { role: { $regex: normalizedQuery, $options: 'i' } }
            ]
        }).limit(5).toArray();

        // Search in transport_routes
        const routes = await this.db.collection('transport_routes').find({
            $or: [
                { route_no: { $regex: normalizedQuery, $options: 'i' } },
                { "stops.stop": { $regex: normalizedQuery, $options: 'i' } }
            ]
        }).limit(3).toArray();

        // If it's a specific route query like "AR-3", fetch details
        if (normalizedQuery.match(/ar[-]?\d+|r[-]?\d+/)) {
            const specificRoute = normalizedQuery.replace("-", " ").toUpperCase();
            const details = await this.db.collection('transport_routes').findOne({
                route_no: { $regex: specificRoute.split(" ").join("[-]?"), $options: 'i' }
            });
            if (details) routes.push(details);
        }

        return { people, routes };
    }

    async searchVectorStore(query) {
        await this.connect();
        const embedding = await this.getEmbedding(query);
        if (!embedding) return [];

        // Manual dot-product or use MongoDB vector search if available.
        // For simplicity (assuming non-Atlas Vector Search license or similar), we'll do search on recent items or top matches.
        // BUT MSAJCE probably needs proper vector search.
        // If not using Atlas Vector Search, we'll fetch and rank (limited subset).
        
        const results = await this.db.collection('vector_store').find({}).toArray();
        const scored = results.map(doc => {
            const score = doc.embedding.reduce((sum, val, idx) => sum + val * embedding[idx], 0);
            return { ...doc, score };
        }).sort((a, b) => b.score - a.score).slice(0, 5);

        return scored.map(s => ({
            text: s.text,
            metadata: s.metadata,
            score: s.score
        }));
    }

    async close() {
        await this.client.close();
    }
}

module.exports = new Retriever();
