import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { normalizeData, parseCsv } from "../site/js/data.js";
import { parseSeasonRows } from "../site/js/live-data.js";

const requiredFiles = [
  "site/index.html",
  "site/season.html",
  "site/css/style.css",
  "site/js/app.js",
  "site/js/data.js",
  "site/js/live-data.js",
  "site/js/season.js",
  "site/config.json",
  "site/leaderboard.json",
  "site/favicon.svg",
  "site/og.png",
  "infrastructure/buildspec.yml",
  "infrastructure/template.yml"
];

await Promise.all(requiredFiles.map((path) => readFile(path)));

const config = JSON.parse(await readFile("site/config.json", "utf8"));
if (typeof config.googleSheetCsvUrl !== "string") {
  throw new Error("site/config.json must contain a googleSheetCsvUrl string");
}
if (typeof config.googleSheetId !== "string" || typeof config.googleSheetApiKey !== "string") {
  throw new Error("site/config.json must contain Google Sheet ID and API key strings");
}

const data = JSON.parse(await readFile("site/leaderboard.json", "utf8"));
if (!Array.isArray(data.seasons) || data.seasons.length === 0) {
  throw new Error("site/leaderboard.json must contain at least one season");
}

for (const season of data.seasons) {
  if (!Number.isInteger(season.year) || !Array.isArray(season.leaderboard) || season.leaderboard.length === 0) {
    throw new Error("Each season needs an integer year and a non-empty leaderboard");
  }
  for (const entry of season.leaderboard) {
    if (!entry.manager || !Number.isFinite(entry.points)) {
      throw new Error(`Invalid leaderboard entry in ${season.year}`);
    }
  }
  if (!Array.isArray(season.weeks) || season.weeks.length === 0) {
    throw new Error(`Season ${season.year} needs weekly payout data`);
  }
  for (const week of season.weeks) {
    if (!week.label || !Array.isArray(week.results) || week.results.length === 0) {
      throw new Error(`Invalid weekly payout data in ${season.year}`);
    }
    for (const result of week.results) {
      if (!result.manager || !Number.isFinite(result.amount)) {
        throw new Error(`Invalid payout entry for ${week.label} in ${season.year}`);
      }
    }
  }
}

const appSource = await readFile("site/js/app.js", "utf8");
assert.match(appSource, /from "\.\/data\.js"/);
assert.match(appSource, /from "\.\/live-data\.js"/);

const html = await readFile("site/index.html", "utf8");
assert.match(html, /<meta property="og:image" content="https:\/\/www\.murphduel\.com\/og\.png">/);
assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
assert.match(html, /href="season\.html"/);

const seasonHtml = await readFile("site/season.html", "utf8");
assert.match(seasonHtml, /id="weekSelect"/);
assert.match(seasonHtml, /id="ledgerTable"/);
assert.match(seasonHtml, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);

const normalized = normalizeData(data);
const expectedYears = data.seasons.map(({ year }) => year).sort((left, right) => right - left);
assert.deepEqual(normalized.seasons.map(({ year }) => year), expectedYears);
assert.ok(normalized.seasons.every((season) => season.leaderboard.every((entry, index, entries) => (
  index === 0 || entries[index - 1].points >= entry.points
))));

const csv = [
  "year,manager,teamName,points",
  '2024,"Murphy, Pat",Red Birds,1200.25',
  "2025,Alex,Fourth and Long,1400",
  "2025,Jordan,Goal Diggers,1500.5",
  "invalid,Skipped,No Score,nope"
].join("\r\n");
const parsed = normalizeData(parseCsv(csv));
assert.deepEqual(parsed.seasons.map(({ year }) => year), [2025, 2024]);
assert.equal(parsed.seasons[0].leaderboard[0].manager, "Jordan");
assert.equal(parsed.seasons[1].leaderboard[0].manager, "Murphy, Pat");

const sheetRows = [
  ["PAYOUT"],
  ["", "Week 1"],
  ["Jordan", 25],
  ["Alex", -10],
  [],
  ["PLACEMENT"],
  ["", "", "Player", "Total"],
  ["", "", "Jordan", "1,500.50"],
  ["", "", "Alex", 1400]
];
const sheetSeason = parseSeasonRows("Fanduel 26'", sheetRows);
assert.equal(sheetSeason.year, 2026);
assert.equal(sheetSeason.leaderboard[0].manager, "Jordan");
assert.equal(sheetSeason.weeks[0].results[1].amount, -10);

const weeklyOnlyRows = [
  ["PAYOUT"],
  ["", "Week 1"],
  ["Jordan", 25],
  ["Alex", -10]
];
const weeklyOnlySeason = parseSeasonRows("Fanduel 26'", weeklyOnlyRows);
assert.equal(weeklyOnlySeason.leaderboard.length, 0);
assert.equal(weeklyOnlySeason.weeks[0].results.length, 2);

console.log(
  `Validated ${requiredFiles.length} files, ${data.seasons.length} seasons, and `
  + `${data.seasons.reduce((total, season) => total + season.weeks.length, 0)} weekly ledgers.`
);
