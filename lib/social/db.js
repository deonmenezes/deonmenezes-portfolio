import { neon } from "@neondatabase/serverless";

let client;

export function getDatabase() {
  if (!client) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
    client = neon(databaseUrl);
  }
  return client;
}

export async function query(text, params = []) {
  return getDatabase().query(text, params);
}
