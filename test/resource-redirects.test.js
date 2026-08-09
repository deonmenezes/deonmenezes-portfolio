import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("the Claude gifting shortcut stays official without intercepting the local setup guide", async () => {
  const config = JSON.parse(
    await readFile(new URL("vercel.json", root), "utf8"),
  );

  const redirects = new Map(
    config.redirects.map(({ source, destination }) => [source, destination]),
  );

  assert.equal(redirects.has("/resources/claude-start-here"), false);
  assert.equal(
    redirects.get("/resources/gift-claude-subscription"),
    "https://support.claude.com/en/articles/12938627-how-to-gift-a-claude-subscription",
  );
});
