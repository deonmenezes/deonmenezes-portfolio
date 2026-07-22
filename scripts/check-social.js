import { socialSeeds } from "../data/social-seeds.js";
import { buildDeliveryText } from "../lib/social/automation.js";

const seen = new Set();
for (const seed of socialSeeds) {
  if (!/^[A-Za-z0-9_-]{3,80}$/u.test(seed.shortcode)) throw new Error(`Invalid shortcode ${seed.shortcode}`);
  if (seen.has(seed.shortcode)) throw new Error(`Duplicate shortcode ${seed.shortcode}`);
  seen.add(seed.shortcode);
  if (!seed.keyword || seed.keyword !== seed.keyword.toUpperCase()) throw new Error(`Invalid keyword for ${seed.shortcode}`);
  if (seed.enabled && seed.needsSetup) throw new Error(`Enabled seed ${seed.shortcode} cannot need setup`);
  if (seed.enabled && !seed.responseText && !(seed.links || []).length) throw new Error(`Enabled seed ${seed.shortcode} has no response`);
  if (seed.enabled) {
    buildDeliveryText(
      { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", response_text: seed.responseText || "", resource_links: seed.links || [] },
      "9223372036854775807",
      "https://deonmenezes.com",
    );
  }
  for (const link of seed.links || []) {
    const url = new URL(link.url);
    if (url.protocol !== "https:") throw new Error(`Non-HTTPS link for ${seed.shortcode}`);
  }
}
console.log(`Validated ${socialSeeds.length} social automation seeds.`);
