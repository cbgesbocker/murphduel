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
  const headers = values[payoutRow + 1] ?? [];
  if (payoutRow < 0 || headers.length < 2) throw new Error(`Could not find weekly payouts in ${title}`);

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
    .filter((week) => week.label && week.results.length);
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
      .filter((entry) => entry.manager && entry.points !== null)
      .sort((left, right) => right.points - left.points);

  const year = 2000 + Number.parseInt(shortYear, 10);
  const weeks = parseWeeks(title, values, leaderboard);
  if (!leaderboard.length && !weeks.length) throw new Error(`No usable season data was found in ${title}`);

  return {
    year,
    description: leaderboard.length ? `Fanduel standings from the ${year} season.` : "Final standings are not available yet.",
    leaderboard,
    weeks
  };
}

async function requestGoogle(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);
  return response.json();
}

export async function loadLeagueData() {
  const [savedResponse, configResponse] = await Promise.all([
    fetch("leaderboard.json", { cache: "no-store" }),
    fetch("config.json", { cache: "no-store" })
  ]);
  if (!savedResponse.ok) throw new Error(`Leaderboard returned ${savedResponse.status}`);
  const saved = await savedResponse.json();
  const config = configResponse.ok ? await configResponse.json() : {};
  if (!config.googleSheetId || !config.googleSheetApiKey) return { data: saved, source: "saved" };

  try {
    const metadataUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${config.googleSheetId}`);
    metadataUrl.searchParams.set("fields", "sheets.properties(title)");
    metadataUrl.searchParams.set("key", config.googleSheetApiKey);
    const metadata = await requestGoogle(metadataUrl);
    const titles = (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title) => /^Fanduel \d{2}'$/.test(title));
    if (!titles.length) throw new Error("No Fanduel season tabs were found");

    const valuesUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${config.googleSheetId}/values:batchGet`);
    titles.forEach((title) => valuesUrl.searchParams.append("ranges", `'${title.replaceAll("'", "''")}'!A1:AH200`));
    valuesUrl.searchParams.set("majorDimension", "ROWS");
    valuesUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
    valuesUrl.searchParams.set("key", config.googleSheetApiKey);
    const values = await requestGoogle(valuesUrl);

    const seasons = titles
      .map((title, index) => {
        try {
          return parseSeasonRows(title, values.valueRanges?.[index]?.values ?? []);
        } catch (error) {
          console.warn(`Unable to read ${title}`, error);
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.year - left.year);
    if (!seasons.length) throw new Error("No live season data was found");

    return { data: { seasons }, source: "live" };
  } catch (error) {
    console.warn("Unable to load live spreadsheet data", error);
    return { data: saved, source: "saved" };
  }
}
