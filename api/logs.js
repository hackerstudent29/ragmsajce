const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MAIN_DATABASE_NAME || 'msajce';

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  const client = await MongoClient.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const db = await client.db(DB_NAME);
  cachedDb = db;
  return db;
}

// Serverless Handler
module.exports = async (req, res) => {
  // CORS Headers for dashboard
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const db = await connectToDatabase();
    const logs = await db.collection('execution_logs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
      
    res.status(200).json(logs);
  } catch (error) {
    console.error('Logs API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
