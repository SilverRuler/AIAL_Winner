import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60000,
};

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromiseAIAL: Promise<MongoClient> | undefined;
}

if (uri) {
  // Vercel 서버리스 및 로컬 환경 모두에서 연결 풀(Connection Pool) 전역 재사용
  if (!global._mongoClientPromiseAIAL) {
    client = new MongoClient(uri, options);
    global._mongoClientPromiseAIAL = client.connect();
  }
  clientPromise = global._mongoClientPromiseAIAL;
}

export async function getDatabase() {
  if (!uri || !clientPromise) {
    return null;
  }
  try {
    const connectedClient = await clientPromise;
    const dbName = process.env.MONGODB_DB_NAME || 'aial_winner';
    return connectedClient.db(dbName);
  } catch (error) {
    console.error('Failed to connect to MongoDB Atlas:', error);
    return null;
  }
}

export default clientPromise;
