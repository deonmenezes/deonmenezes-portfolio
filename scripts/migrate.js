import { readdir, readFile } from "node:fs/promises";
import { getDatabase } from "../lib/social/db.js";
import { loadLocalEnvironment } from "./env.js";

await loadLocalEnvironment();
const sql = getDatabase();
const migrationsUrl = new URL("../migrations/", import.meta.url);
const files = (await readdir(migrationsUrl)).filter((file) => file.endsWith(".sql")).sort();
let applied = 0;
for (const file of files) {
  const migration = await readFile(new URL(file, migrationsUrl), "utf8");
  const statements = migration.split(/;\s*(?:\n|$)/u).map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
  applied += statements.length;
}
console.log(`Applied ${applied} social database statements from ${files.length} migrations.`);
