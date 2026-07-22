import { readFile } from "node:fs/promises";

export async function loadLocalEnvironment(file = ".env.local") {
  let contents;
  try { contents = await readFile(file, "utf8"); } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[match[1]]) process.env[match[1]] = value.replace(/\\n/gu, "\n");
  }
}
