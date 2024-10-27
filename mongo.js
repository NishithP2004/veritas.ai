import { MongoClient } from "mongodb";
import "dotenv/config";

async function connectToDatabase() {
    const client = new MongoClient(process.env.MONGO_CONNECTION_URL)
    const dbName = process.env.MONGO_DB_NAME;
    await client.connect()

    console.log("Connected Successfully to MongoDB.")
    return client.db(dbName)
}

export { connectToDatabase }