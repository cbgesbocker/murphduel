export async function loadLeagueData() {
  const [savedResponse, configResponse] = await Promise.all([
    fetch("leaderboard.json", { cache: "no-store" }),
    fetch("config.json", { cache: "no-store" })
  ]);
  if (!savedResponse.ok) throw new Error(`Leaderboard returned ${savedResponse.status}`);
  const saved = await savedResponse.json();
  const config = configResponse.ok ? await configResponse.json() : {};
  return { data: saved, source: config.syncEndpoint ? "synced" : "saved" };
}
