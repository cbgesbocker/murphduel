import { readFile } from "node:fs/promises";

const requiredFiles = [
  "site/index.html",
  "site/css/style.css",
  "site/js/app.js",
  "site/config.json",
  "site/leaderboard.json",
  "infrastructure/buildspec.yml",
  "infrastructure/template.yml"
];

await Promise.all(requiredFiles.map((path) => readFile(path)));

const config = JSON.parse(await readFile("site/config.json", "utf8"));
if (typeof config.googleSheetCsvUrl !== "string") {
  throw new Error("site/config.json must contain a googleSheetCsvUrl string");
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
    if (!entry.manager || !entry.teamName || !Number.isFinite(entry.points)) {
      throw new Error(`Invalid leaderboard entry in ${season.year}`);
    }
  }
}

const appSource = await readFile("site/js/app.js", "utf8");
new Function(appSource);

console.log(`Validated ${requiredFiles.length} files and ${data.seasons.length} seasons.`);
