function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number.parseFloat(text.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) return text.includes("-") ? 0 : null;
  return text.includes("(") && parsed > 0 ? -parsed : parsed;
}

function canonicalManager(name, leaderboard) {
  const exact = leaderboard.find((entry) => entry.manager.toLowerCase() === name.toLowerCase());
  if (exact) return exact.manager;

  const firstName = name.split(/\s+/)[0].toLowerCase();
  const matches = leaderboard.filter((entry) => entry.manager.split(/\s+/)[0].toLowerCase() === firstName);
  return matches.length === 1 ? matches[0].manager : name;
}

function parseWeeks(title, values, leaderboard) {
  const payoutRow = values.findIndex((row) => String(row[0] ?? "").trim().toUpperCase() === "PAYOUT");
  if (payoutRow < 0) throw new Error(`Could not find weekly payouts in ${title}`);

  const headers = values[payoutRow + 1] ?? [];
  if (headers.length < 2) throw new Error(`Could not find weekly payout columns in ${title}`);

  const managers = [];
  for (const row of values.slice(payoutRow + 2)) {
    const name = String(row[0] ?? "").trim();
    if (!name) break;
    managers.push({
      manager: canonicalManager(name, leaderboard),
      amounts: headers.slice(1).map((_, index) => parseNumber(row[index + 1]))
    });
  }

  return headers
    .slice(1)
    .map((label, index) => ({
      label: String(label).trim(),
      results: managers
        .map(({ manager, amounts }) => ({ manager, amount: amounts[index] }))
        .filter((entry) => entry.amount !== null)
    }))
    .filter((week) => week.label && week.results.some((entry) => entry.amount > 0));
}

export function parseSeasonRows(title, values) {
  const shortYear = title.match(/^Fanduel (\d{2})'$/)?.[1];
  if (!shortYear) return null;

  const placementRow = values.findIndex((row) => String(row[0] ?? "").trim().toUpperCase() === "PLACEMENT");
  const headers = values[placementRow + 1] ?? [];
  const playerColumn = headers.findIndex((value) => String(value).trim().toLowerCase() === "player");
  const totalColumn = headers.findIndex((value, index) => (
    index > playerColumn && String(value).trim().toLowerCase() === "total"
  ));

  const leaderboard = placementRow < 0 || playerColumn < 0 || totalColumn < 0
    ? []
    : values
      .slice(placementRow + 2)
      .map((row) => ({
        manager: String(row[playerColumn] ?? "").trim(),
        points: parseNumber(row[totalColumn])
      }))
      .filter((entry) => entry.manager && entry.points !== null && entry.points > 0)
      .sort((left, right) => right.points - left.points);

  const year = 2000 + Number.parseInt(shortYear, 10);
  const weeks = parseWeeks(title, values, leaderboard);
  return {
    year,
    description: leaderboard.length
      ? `Fanduel standings from the ${year} season.`
      : "Final standings are not available yet.",
    leaderboard,
    weeks
  };
}

export function parseLeagueData(titles, valueRanges) {
  return {
    seasons: titles
      .map((title, index) => {
        try {
          return parseSeasonRows(title, valueRanges[index]?.values ?? []);
        } catch (error) {
          console.warn(`Unable to read ${title}`, error);
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.year - left.year)
  };
}
