import { readFile, writeFile } from "node:fs/promises";

const spreadsheetId = "1FHEReg8VuEJYJBs1_HCY27KvVLzsjl6uUQRsLMcezqY";
const apiOrigin = "https://sheets.googleapis.com/v4/spreadsheets";
const referer = "https://www.murphduel.com/";

async function loadApiKey() {
  if (process.env.SHEETS_API_KEY) return process.env.SHEETS_API_KEY;

  try {
    const env = await readFile(".env", "utf8");
    const match = env.match(/^SHEETS_API_KEY=(.*)$/m);
    return match?.[1].trim().replace(/^(['"])(.*)\1$/, "$2");
  } catch {
    return null;
  }
}

async function request(path, params = {}) {
  const apiKey = await loadApiKey();
  if (!apiKey) throw new Error("SHEETS_API_KEY is required in the environment or .env file");

  const url = new URL(`${apiOrigin}/${spreadsheetId}${path}`);
  Object.entries({ ...params, key: apiKey }).forEach(([name, value]) => {
    url.searchParams.append(name, value);
  });

  const response = await fetch(url, { headers: { Referer: referer } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || `Google Sheets returned ${response.status}`);
  }
  return response.json();
}

function parsePoints(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoney(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number.parseFloat(text.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
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
      amounts: headers.slice(1).map((_, index) => parseMoney(row[index + 1]))
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

function parseSeason(title, values) {
  const shortYear = title.match(/^Fanduel (\d{2})'$/)?.[1];
  if (!shortYear) return null;

  const placementRow = values.findIndex((row) => String(row[0] ?? "").trim().toUpperCase() === "PLACEMENT");
  const headers = values[placementRow + 1] ?? [];
  const playerColumn = headers.findIndex((value) => String(value).trim().toLowerCase() === "player");
  const totalColumn = headers.findIndex((value, index) => (
    index > playerColumn && String(value).trim().toLowerCase() === "total"
  ));

  if (placementRow < 0 || playerColumn < 0 || totalColumn < 0) {
    throw new Error(`Could not find the final placement table in ${title}`);
  }

  const leaderboard = values
    .slice(placementRow + 2)
    .map((row) => ({
      manager: String(row[playerColumn] ?? "").trim(),
      points: parsePoints(row[totalColumn])
    }))
    .filter((entry) => entry.manager && entry.points !== null)
    .sort((left, right) => right.points - left.points);

  if (!leaderboard.length) throw new Error(`No final standings were found in ${title}`);

  const weeks = parseWeeks(title, values, leaderboard);

  const year = 2000 + Number.parseInt(shortYear, 10);
  return {
    year,
    description: `Final Fanduel standings from the ${year} season.`,
    leaderboard,
    weeks
  };
}

const metadata = await request("", { includeGridData: "false" });
const titles = metadata.sheets
  .map((sheet) => sheet.properties?.title)
  .filter((title) => /^Fanduel \d{2}'$/.test(title));

if (!titles.length) throw new Error("No Fanduel season tabs were found");

const ranges = {};
titles.forEach((title) => {
  ranges.ranges ??= [];
  ranges.ranges.push(`'${title.replaceAll("'", "''")}'!A1:AH200`);
});

const apiKey = await loadApiKey();
const valuesUrl = new URL(`${apiOrigin}/${spreadsheetId}/values:batchGet`);
ranges.ranges.forEach((range) => valuesUrl.searchParams.append("ranges", range));
valuesUrl.searchParams.set("majorDimension", "ROWS");
valuesUrl.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
valuesUrl.searchParams.set("key", apiKey);

const valuesResponse = await fetch(valuesUrl, { headers: { Referer: referer } });
if (!valuesResponse.ok) {
  const body = await valuesResponse.json().catch(() => ({}));
  throw new Error(body.error?.message || `Google Sheets returned ${valuesResponse.status}`);
}

const valueRanges = (await valuesResponse.json()).valueRanges ?? [];
const seasons = titles
  .map((title, index) => parseSeason(title, valueRanges[index]?.values ?? []))
  .filter(Boolean)
  .sort((left, right) => right.year - left.year);

await writeFile("site/leaderboard.json", `${JSON.stringify({ seasons }, null, 2)}\n`);
console.log(
  `Synced ${seasons.length} seasons, ${seasons.reduce((total, season) => total + season.leaderboard.length, 0)} standings, `
  + `and ${seasons.reduce((total, season) => total + season.weeks.length, 0)} weekly ledgers.`
);
