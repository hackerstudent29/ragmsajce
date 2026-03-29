const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MAIN_DATABASE_NAME || 'msajce';

app.use(cors());
app.use(express.json());

let db;
const client = new MongoClient(MONGO_URI);

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB for Dashboard Hub');
  }
  return db;
}

app.get('/api/logs', async (req, res) => {
  try {
    const database = await connectDB();
    const logs = await database.collection('execution_logs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(port, () => {
  console.log(`Dashboard API running on port ${port}`);
});
