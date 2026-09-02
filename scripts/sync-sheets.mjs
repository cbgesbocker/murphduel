import { readFile, writeFile } from "node:fs/promises";
import { parseSeasonRows } from "../site/js/live-data.js";

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
  .map((title, index) => parseSeasonRows(title, valueRanges[index]?.values ?? []))
  .filter(Boolean)
  .sort((left, right) => right.year - left.year);

await writeFile("site/leaderboard.json", `${JSON.stringify({ seasons }, null, 2)}\n`);
console.log(
  `Synced ${seasons.length} seasons, ${seasons.reduce((total, season) => total + season.leaderboard.length, 0)} standings, `
  + `and ${seasons.reduce((total, season) => total + season.weeks.length, 0)} weekly ledgers.`
);
