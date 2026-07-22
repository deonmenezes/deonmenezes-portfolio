const tradingLinks = [
  { label: "TradingView MCP on GitHub", url: "https://github.com/tradesdontlie/tradingview-mcp" },
  { label: "Setup video", url: "https://youtu.be/F-Ht1rRagH8?is=saQs2S69FpIf7nmi" },
];

const commonTriggers = (...specific) => [...new Set(["LINK", "TOOL", "DOC", "🔗", ...specific])].join(", ");

export const socialSeeds = [
  {
    shortcode: "Da6eVgUx-Bu", title: "International students webinar", keyword: commonTriggers(), enabled: true,
    responseText: "Here is the international-student webinar link you asked for:",
    links: [{ label: "Open the webinar", url: "https://na2.hubs.ly/H06Ld5Q0" }],
  },
  {
    shortcode: "Da2m_rzhiwV", title: "Edge City India", keyword: commonTriggers(), enabled: true,
    responseText: "Here is the Edge City India page:",
    links: [{ label: "Open Edge City India", url: "https://edgecity.simplefi.tech/portal/edge-india" }],
  },
  {
    shortcode: "Da2BsqqpkiU", title: "Codex Pro Giveaway", keyword: commonTriggers("CODEX"), enabled: true,
    responseText: "You’re enrolled for the Codex Pro giveaway. Follow @deon_tech so you don’t miss the winner announcement. 👍", links: [],
  },
  {
    shortcode: "DaviFsNBtvC", title: "Codex Pro Giveaway", keyword: commonTriggers("CODEX"), enabled: true,
    responseText: "Congrats — you’re enrolled for the Codex Pro giveaway. Follow @deon_tech so you don’t miss the winner announcement. 👍", links: [],
  },
  {
    shortcode: "DaMdE8qheDc", title: "Edge City India application", keyword: commonTriggers(), enabled: true,
    responseText: "Here is the Edge City India application:",
    links: [{ label: "Apply for Edge City India", url: "https://edgecity.simplefi.tech/portal/edge-india" }],
  },
  {
    shortcode: "DZoVJVMNYY8", title: "Claude Does Trading For You", keyword: commonTriggers("CLAUDE"), enabled: true,
    responseText: "Here are the TradingView MCP repository and setup video:", links: tradingLinks,
  },
  {
    shortcode: "DZkzwbKt3QC", title: "$1T / Learnify", keyword: commonTriggers(), enabled: true,
    responseText: "Here is the learning app:",
    links: [{ label: "Download Learnify", url: "https://apps.apple.com/us/app/learnify-addictive-learning/id6774788081" }],
  },
  {
    shortcode: "DZZcVZTBV9i", title: "Doomscroll learning", keyword: commonTriggers(), enabled: true,
    responseText: "Here is the learning app:",
    links: [{ label: "Download Learnify", url: "https://apps.apple.com/us/app/learnify-addictive-learning/id6774788081" }],
  },
  {
    shortcode: "DZNPNQ5vzdZ", title: "TechScroll Android test", keyword: commonTriggers("APP"), enabled: true,
    responseText: "Thanks for helping test TechScroll on Android:",
    links: [{ label: "Join the Android test", url: "https://play.google.com/apps/internaltest/4701160708513832150" }],
  },
  {
    shortcode: "DZK1Wq3gKHK", title: "Learnify iPhone", keyword: commonTriggers("APP"), enabled: true,
    responseText: "Here is the iPhone learning app:",
    links: [{ label: "Download Learnify", url: "https://apps.apple.com/us/app/learnify-addictive-learning/id6774788081" }],
  },
  {
    shortcode: "DZIVfo_By9W", title: "TradingView MCP with Claude", keyword: commonTriggers("CLAUDE"), enabled: true,
    responseText: "Here are the TradingView MCP repository and setup video:", links: tradingLinks,
  },
  {
    shortcode: "DZBuj-2yu4m", title: "Claude trades with TradingView", keyword: commonTriggers("CLAUDE"), enabled: true,
    responseText: "Here are the TradingView MCP repository and setup video:", links: tradingLinks,
  },
  {
    shortcode: "DZHc4d-FT_U", title: "Top open-source repositories", keyword: commonTriggers(), enabled: true,
    responseText: "Here are all 12 open-source repositories from the Reel:",
    links: [{ label: "Open the repository list", url: "https://deonmenezes.com/resources#top-repositories" }],
  },
  {
    shortcode: "DY45B1whBQu", title: "Dangerous Claude MCP", keyword: commonTriggers("MCP"), enabled: true,
    responseText: "Here is the GitHub repository:",
    links: [{ label: "MantisHack on GitHub", url: "https://github.com/deonmenezes/mantishack" }],
  },
  {
    shortcode: "DYpjqDcJrGQ", title: "You Need to Be on X", keyword: commonTriggers("X"), enabled: true,
    responseText: "Here is my X profile. Tip: follow people in your niche, post useful replies, and share what you are building consistently.",
    links: [{ label: "Follow Deon on X", url: "https://x.com/deonmen?s=21" }],
  },
  {
    shortcode: "DYaOSu7xUKv", title: "Indian open-source community", keyword: commonTriggers("OPENSOURCE"), enabled: true,
    responseText: "Join the open-source community here:",
    links: [{ label: "Join Discord", url: "https://discord.gg/cyJb4bxwD" }],
  },
  {
    shortcode: "DYPlz0VNL_H", title: "India tech links", keyword: commonTriggers("INDIA"), enabled: true,
    responseText: "Here are the India community and open-source links:",
    links: [
      { label: "Join Discord", url: "https://discord.gg/M6EDFQk2q" },
      { label: "MantisHack", url: "https://github.com/deonmenezes/mantishack" },
      { label: "Watch the setup video", url: "https://youtu.be/_csYi6_Bpb4?si=I0jYdcpWamVo0Xcr" },
    ],
  },
  {
    shortcode: "DYFpKVkMxGq", title: "UFO Files Just Dropped", keyword: commonTriggers("UFO"), enabled: true,
    responseText: "Here are the official UFO files:",
    links: [{ label: "Open the official UFO page", url: "https://www.war.gov/UFO/" }],
  },
  {
    shortcode: "DXrwSqujvle", title: "Free $20 Claude Credits", keyword: commonTriggers("CLAUDE"), enabled: true,
    responseText: "Here is the Claude credits offer:",
    links: [{ label: "Claim the Claude offer", url: "https://platform.claude.com/offers/a5eb741e-2ee0-4521-a26e-edcec8fb98b4" }],
  },
  {
    shortcode: "DXvP7icOHGG", title: "Top research papers", keyword: commonTriggers("RESEARCH"), enabled: true,
    responseText: "Here are the research resources:",
    links: [
      { label: "Google Scholar profile", url: "https://scholar.google.com/citations?user=Jm6NfuEAAAAJ&hl=en" },
      { label: "Top 10 research papers", url: "https://deonmenezes.com/resources#research-papers" },
    ],
  },
  {
    shortcode: "DW0rFXRDkFq", title: "India open-source links", keyword: commonTriggers("INDIA"), enabled: true,
    responseText: "Here are all the relevant India tech links:",
    links: [
      { label: "Join Discord", url: "https://discord.gg/6m8au3cpS" },
      { label: "OpenTradeX", url: "https://github.com/deonmenezes/opentradex" },
      { label: "MantisHack", url: "https://github.com/deonmenezes/mantishack" },
    ],
  },
  {
    shortcode: "DWx0Ibgjs9S", title: "AI engineers and traders community", keyword: commonTriggers("COMMUNITY"), enabled: true,
    responseText: "Join the community here:",
    links: [{ label: "Join Discord", url: "https://discord.gg/6m8au3cpS" }],
  },
  { shortcode: "DZQcHHgykJS", title: "NEET and JEE security repository", keyword: "LINK", enabled: false, needsSetup: true, responseText: "", links: [] },
  {
    shortcode: "DXWLZExDubV", title: "World’s best engineering resources", keyword: "*", enabled: true,
    responseText: "Here are the engineering resources:",
    publicReplyText: "",
    links: [{ label: "Open engineering resources", url: "https://deonmenezes.com/resources" }],
  },
  {
    shortcode: "DW3QQ5XhJpj", title: "Robotics roadmap", keyword: "ROADMAP", enabled: true,
    responseText: "Here is the robotics roadmap and the resources to start:",
    links: [{ label: "Open the robotics roadmap", url: "https://deonmenezes.com/resources#robotics-roadmap" }],
  },
  { shortcode: "DW2Et2gktss", title: "Mythos interview", keyword: "MYTHOS", enabled: false, needsSetup: true, responseText: "", links: [] },
  {
    shortcode: "DWvvB7lgAnv", title: "Implementation links and guides", keyword: "INSTALL", enabled: true,
    responseText: "Here are the implementation links and guides:",
    links: [{ label: "Open implementation guides", url: "https://deonmenezes.com/resources#implementation-guides" }],
  },
  {
    shortcode: "DVoWCNLktpD", title: "AR/VR guide", keyword: "LINK", enabled: true,
    responseText: "Here is the AR and VR starter guide:",
    links: [{ label: "Open the AR/VR guide", url: "https://deonmenezes.com/resources#xr-guide" }],
  },
  { shortcode: "DVjLQwtklrF", title: "Follow-gated link", keyword: "LINK", enabled: false, needsSetup: true, responseText: "", links: [] },
  {
    shortcode: "DVgXquzktmo", title: "Most important APIs", keyword: "API", enabled: true,
    responseText: "Here are the API guides and references I recommend:",
    links: [{ label: "Open the API toolkit", url: "https://deonmenezes.com/resources#api-toolkit" }],
  },
];
