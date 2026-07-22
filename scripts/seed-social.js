import { seedAutomations, syncInstagram } from "../lib/social/automation.js";
import { socialSeeds } from "../data/social-seeds.js";
import { loadLocalEnvironment } from "./env.js";

await loadLocalEnvironment();
const sync = await syncInstagram();
const seed = await seedAutomations(socialSeeds);
console.log(JSON.stringify({ sync, seed }, null, 2));
