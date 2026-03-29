const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MAIN_DATABASE_NAME || 'msajce';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function getEmbeddings(text) {
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
        console.error('Embedding failed:', e.response ? e.response.data : e.message);
        return null;
    }
}

async function store() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(DB_NAME);

        const structuredDir = path.join(__dirname, '..', 'structured_data');
        const files = fs.readdirSync(structuredDir).filter(f => f.endsWith('.json'));

        for (const file of files) {
            const collectionName = file.replace('.json', '');
            const data = JSON.parse(fs.readFileSync(path.join(structuredDir, file), 'utf8'));
            
            if (data.length === 0) continue;

            console.log(`Storing ${data.length} records into ${collectionName}`);
            
            // Map to specific collections as requested
            let targetCollection = collectionName;
            if (collectionName === 'people') targetCollection = 'entities_master';
            // General text goes to vector_store with embeddings
            if (collectionName === 'general') {
                const vectorStore = db.collection('vector_store');
                for (const item of data) {
                    // Chunking: for now, we just use the text as one chunk if it's small, 
                    // or split if it's large. (Strict objective says "Smart Chunking")
                    const chunks = chunkText(item.text, 800);
                    for (const chunk of chunks) {
                        console.log(`Embedding chunk for ${item.url}`);
                        const embedding = await getEmbeddings(chunk);
                        if (embedding) {
                            await vectorStore.insertOne({
                                text: chunk,
                                embedding,
                                metadata: {
                                    url: item.url,
                                    title: item.title,
                                    headings: item.headings,
                                    source: item.source,
                                    category: 'general'
                                }
                            });
                        }
                    }
                }
            } else {
                const col = db.collection(targetCollection);
                // Clear existing for fresh start if needed, or just upsert
                // For this pipeline, we'll replacement upsert based on ID
                for (const record of data) {
                    await col.updateOne({ id: record.id }, { $set: record }, { upsert: true });
                }
            }
        }

        console.log('Database Storage Complete.');
    } catch (e) {
        console.error('Storage Error:', e);
    } finally {
        await client.close();
    }
}

function chunkText(text, limit) {
    const chunks = [];
    let current = "";
    const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
    
    for (const sentence of sentences) {
        if ((current.length + sentence.length) < limit) {
            current += sentence;
        } else {
            if (current) chunks.push(current.trim());
            current = sentence;
        }
    }
    if (current) chunks.push(current.trim());
    return chunks;
}

store();
