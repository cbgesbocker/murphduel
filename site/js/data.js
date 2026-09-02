export function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return { seasons: [] };

  const headers = rows.shift().map((header) => header.toLowerCase().replace(/\s+/g, ""));
  const seasons = new Map();

  rows.forEach((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const year = Number.parseInt(record.year, 10);
    const points = Number.parseFloat(record.points);
    if (!Number.isInteger(year) || !record.manager || !(record.teamname || record.team) || !Number.isFinite(points)) return;
    if (!seasons.has(year)) seasons.set(year, []);
    seasons.get(year).push({
      manager: record.manager,
      teamName: record.teamname || record.team,
      points
    });
  });

  return {
    seasons: [...seasons.entries()].map(([year, leaderboard]) => ({ year, leaderboard }))
  };
}

export function normalizeData(data) {
  const seasons = (data?.seasons ?? [])
    .filter((season) => Number.isInteger(season.year) && Array.isArray(season.leaderboard))
    .map((season) => ({
      ...season,
      leaderboard: season.leaderboard
        .filter((entry) => entry?.manager && Number.isFinite(Number(entry.points)))
        .map((entry) => ({ ...entry, points: Number(entry.points) }))
        .sort((left, right) => right.points - left.points)
    }))
    .filter((season) => season.leaderboard.length)
    .sort((left, right) => right.year - left.year);

  if (!seasons.length) throw new Error("No seasons were found");
  return { seasons };
}
