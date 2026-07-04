/* /api/stats · live social + repo counts, edge-cached 3h.
   Sources: GitHub API, Discord invite API, Instagram web profile,
   X syndication. Every field falls back to a recent known value so
   the site never shows a hole when an upstream blocks a datacenter IP. */

const FALLBACK = {
  mantishackStars: 363,
  opentradexStars: 53,
  ghFollowers: 102,
  discordMembers: 1088,
  igFollowers: 32642,
  xFollowers: 1345,
  liFollowers: null, // no public LinkedIn endpoint
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function jfetch(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(6500),
    headers: { "user-agent": UA, ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(url + " -> " + r.status);
  return r;
}

const tasks = {
  async mantishackStars() {
    const d = await (await jfetch("https://api.github.com/repos/deonmenezes/mantishack")).json();
    return d.stargazers_count;
  },
  async opentradexStars() {
    const d = await (await jfetch("https://api.github.com/repos/deonmenezes/opentradex")).json();
    return d.stargazers_count;
  },
  async ghFollowers() {
    const d = await (await jfetch("https://api.github.com/users/deonmenezes")).json();
    return d.followers;
  },
  async discordMembers() {
    const d = await (
      await jfetch("https://discord.com/api/v9/invites/Sz6VMY5Jm?with_counts=true")
    ).json();
    return d.approximate_member_count;
  },
  async igFollowers() {
    try {
      const d = await (
        await jfetch(
          "https://i.instagram.com/api/v1/users/web_profile_info/?username=deon_tech",
          { headers: { "user-agent": "Instagram 76.0.0.15 Android", "x-ig-app-id": "936619743392459" } }
        )
      ).json();
      const n = d?.data?.user?.edge_followed_by?.count;
      if (n) return n;
      throw new Error("no count in api response");
    } catch (e) {
      // fallback: parse the public profile page og description ("33K Followers, ...")
      const html = await (await jfetch("https://www.instagram.com/deon_tech/")).text();
      const m = html.match(/content="([\d.,]+)([KM]?) Followers/);
      if (!m) throw new Error("og parse failed");
      const base = parseFloat(m[1].replace(/,/g, ""));
      return Math.round(m[2] === "M" ? base * 1e6 : m[2] === "K" ? base * 1e3 : base);
    }
  },
  async xFollowers() {
    const html = await (
      await jfetch("https://syndication.twitter.com/srv/timeline-profile/screen-name/DeonMen")
    ).text();
    const m = html.match(/"followers_count":(\d+)/);
    if (!m) throw new Error("x parse failed");
    return parseInt(m[1], 10);
  },
};

export default async function handler(req, res) {
  const keys = Object.keys(tasks);
  const settled = await Promise.allSettled(keys.map((k) => tasks[k]()));
  const out = { ...FALLBACK, fetchedAt: new Date().toISOString(), live: [] };
  settled.forEach((s, i) => {
    if (s.status === "fulfilled" && Number.isFinite(s.value)) {
      out[keys[i]] = s.value;
      out.live.push(keys[i]);
    }
  });
  res.setHeader("Cache-Control", "s-maxage=10800, stale-while-revalidate=86400");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json(out);
}
