import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { normalizeData, parseCsv } from "../site/js/data.js";
import { parseSeasonRows } from "../backend/sync/parser.mjs";

const requiredFiles = [
  "site/index.html",
  "site/season.html",
  "site/standings.html",
  "site/dictator.html",
  "site/rules.html",
  "site/flakes.html",
  "site/css/style.css",
  "site/js/app.js",
  "site/js/data.js",
  "site/js/live-data.js",
  "site/js/season.js",
  "site/js/sync.js",
  "backend/sync/index.mjs",
  "backend/sync/parser.mjs",
  "site/config.json",
  "site/leaderboard.json",
  "site/favicon.svg",
  "site/images/commissioner.jpeg",
  "site/images/operative-kenneth.png",
  "site/images/sargeant-chirico.png",
  "site/images/bloodhawk.png",
  "site/images/airforce-artega.png",
  "site/og.png",
  "infrastructure/buildspec.yml",
  "infrastructure/template.yml"
];

await Promise.all(requiredFiles.map((path) => readFile(path)));

const config = JSON.parse(await readFile("site/config.json", "utf8"));
if (typeof config.syncEndpoint !== "string") throw new Error("site/config.json must contain a syncEndpoint string");
assert.equal("googleSheetApiKey" in config, false, "The browser config must never contain the Sheets API key");

const data = JSON.parse(await readFile("site/leaderboard.json", "utf8"));
if (!Array.isArray(data.seasons) || data.seasons.length === 0) {
  throw new Error("site/leaderboard.json must contain at least one season");
}

for (const season of data.seasons) {
  if (!Number.isInteger(season.year) || !Array.isArray(season.leaderboard)) {
    throw new Error("Each season needs an integer year and a leaderboard array");
  }
  for (const entry of season.leaderboard) {
    if (!entry.manager || !Number.isFinite(entry.points)) {
      throw new Error(`Invalid leaderboard entry in ${season.year}`);
    }
  }
  if (!Array.isArray(season.weeks)) throw new Error(`Season ${season.year} needs a weekly payout array`);
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

const syncSource = await readFile("site/js/sync.js", "utf8");
assert.match(syncSource, /fetch\(config\.syncEndpoint, \{ method: "POST" \}\)/);

const templateSource = await readFile("infrastructure/template.yml", "utf8");
assert.match(templateSource, /Type: AWS::Lambda::Function/);
assert.match(templateSource, /SHEETS_SECRET_ARN/);
assert.match(templateSource, /ScheduleExpressionTimezone: America\/Denver/);

const html = await readFile("site/index.html", "utf8");
assert.match(html, /<meta property="og:image" content="https:\/\/www\.murphduel\.com\/og\.png">/);
assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
assert.match(html, /id="weekSelect"/);
assert.match(html, /id="ledgerTable"/);
assert.match(html, /data-sync-button/);
assert.match(html, /src="js\/sync\.js"/);
assert.match(html, /href="index\.html" aria-current="page">Weekly money/);
assert.match(html, /href="standings\.html">Standings/);
assert.match(html, /href="dictator\.html"/);
assert.match(html, /href="rules\.html"/);
assert.match(html, /href="flakes\.html"/);

const seasonHtml = await readFile("site/season.html", "utf8");
assert.match(seasonHtml, /id="weekSelect"/);
assert.match(seasonHtml, /id="ledgerTable"/);
assert.match(seasonHtml, /data-sync-button/);
assert.match(seasonHtml, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
assert.match(seasonHtml, /href="dictator\.html"/);
assert.match(seasonHtml, /href="rules\.html"/);
assert.match(seasonHtml, /href="flakes\.html"/);

const standingsHtml = await readFile("site/standings.html", "utf8");
assert.match(standingsHtml, /id="leaderboardBody"/);
assert.match(standingsHtml, /src="js\/app\.js"/);
assert.match(standingsHtml, /data-sync-button/);
assert.match(standingsHtml, /href="standings\.html" aria-current="page">Standings/);
assert.match(standingsHtml, /href="index\.html">Weekly money/);
assert.match(standingsHtml, /href="flakes\.html"/);

const dictatorHtml = await readFile("site/dictator.html", "utf8");
assert.match(dictatorHtml, /<h1 id="dictatorTitle">The<br><span>Dictator\.<\/span><\/h1>/);
assert.match(dictatorHtml, /<p class="dictator-name">Dictator Strang<\/p>/);
assert.match(dictatorHtml, /src="images\/commissioner\.jpeg"/);
assert.match(dictatorHtml, /href="dictator\.html" aria-current="page"/);
assert.match(dictatorHtml, /href="rules\.html"/);
assert.match(dictatorHtml, /href="flakes\.html"/);

const rulesHtml = await readFile("site/rules.html", "utf8");
assert.match(rulesHtml, /<h1 id="rulesTitle">The<br><span>Rules\.<\/span><\/h1>/);
assert.match(rulesHtml, /<h2>Set Your Lineup<\/h2>/);
assert.match(rulesHtml, /<h2>Weekly Payment<\/h2>/);
assert.match(rulesHtml, /<h2>Bonus Pot<\/h2>/);
assert.match(rulesHtml, /<h2>No Lineup Fine<\/h2>/);
assert.match(rulesHtml, /Thanksgiving week has two contests/);
assert.match(rulesHtml, /href="rules\.html" aria-current="page"/);
assert.match(rulesHtml, /href="flakes\.html"/);

const flakesHtml = await readFile("site/flakes.html", "utf8");
assert.match(flakesHtml, /<h1 id="flakesTitle">Fallen<br><span>Soldiers\.<\/span><\/h1>/);
assert.match(flakesHtml, /src="images\/operative-kenneth\.png"/);
assert.match(flakesHtml, /<p class="flake-rank" lang="ko">요원<\/p>/);
assert.match(flakesHtml, /<h2 lang="ko">케니 조<\/h2>/);
assert.match(flakesHtml, /src="images\/sargeant-chirico\.png"/);
assert.match(flakesHtml, /<h2>Father Chirico<\/h2>/);
assert.match(flakesHtml, /src="images\/bloodhawk\.png"/);
assert.match(flakesHtml, /<h2>Bloodhawk<\/h2>/);
assert.match(flakesHtml, /<p class="flake-years">2022–2025<\/p>/);
assert.match(flakesHtml, /src="images\/airforce-artega\.png"/);
assert.match(flakesHtml, /<h2>Airforce Artega<\/h2>/);
assert.match(flakesHtml, /<p class="flake-years">2020–2025<\/p>/);
assert.match(flakesHtml, /href="flakes\.html" aria-current="page"/);

const normalized = normalizeData(data);
const expectedYears = data.seasons
  .filter((season) => season.leaderboard.length)
  .map(({ year }) => year)
  .sort((left, right) => right - left);
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

const futureSeason = parseSeasonRows("Fanduel 27'", [
  ["PAYOUT"],
  ["", "Week 1"],
  ["Jordan", -10],
  ["Alex", -10]
]);
assert.equal(futureSeason.year, 2027);
assert.equal(futureSeason.leaderboard.length, 0);
assert.equal(futureSeason.weeks.length, 0);

console.log(
  `Validated ${requiredFiles.length} files, ${data.seasons.length} seasons, and `
  + `${data.seasons.reduce((total, season) => total + season.weeks.length, 0)} weekly ledgers.`
);
