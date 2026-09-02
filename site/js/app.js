import { normalizeData, parseCsv } from "./data.js";

const elements = {
  status: document.querySelector("#dataStatus"),
  yearButtons: document.querySelector("#yearButtons"),
  title: document.querySelector("#seasonTitle"),
  description: document.querySelector("#seasonDescription"),
  leaderboard: document.querySelector("#leaderboardBody"),
  champions: document.querySelector("#championsList"),
  seasons: document.querySelector("#totalSeasons"),
  managers: document.querySelector("#totalManagers"),
  championCount: document.querySelector("#totalChampions"),
  points: document.querySelector("#totalPoints")
};

const number = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

async function loadData() {
  try {
    const configResponse = await fetch("config.json", { cache: "no-store" });
    const config = configResponse.ok ? await configResponse.json() : {};
    let spreadsheetError = null;

    if (config.googleSheetCsvUrl) {
      try {
        const response = await fetch(config.googleSheetCsvUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`Spreadsheet returned ${response.status}`);
        render(normalizeData(parseCsv(await response.text())));
        elements.status.textContent = "Up to date from the spreadsheet";
        return;
      } catch (error) {
        spreadsheetError = error;
        console.warn("Unable to load the spreadsheet; using saved standings", error);
      }
    }

    const response = await fetch("leaderboard.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Leaderboard returned ${response.status}`);
    render(normalizeData(await response.json()));
    elements.status.textContent = spreadsheetError
      ? "Spreadsheet unavailable — showing saved standings"
      : "Latest saved standings";
  } catch (error) {
    console.error("Unable to load standings", error);
    elements.status.textContent = "Couldn’t load the standings";
    elements.title.textContent = "The standings didn’t load";
  }
}

function render(data) {
  const seasons = data.seasons;
  renderSeasonButtons(seasons);
  renderLeaderboard(seasons[0]);
  renderStats(seasons);
  renderChampions(seasons);
}

function renderSeasonButtons(seasons) {
  elements.yearButtons.replaceChildren();
  seasons.forEach((season, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `year-btn${index === 0 ? " active" : ""}`;
    button.textContent = season.year;
    button.setAttribute("aria-pressed", String(index === 0));
    button.addEventListener("click", () => {
      elements.yearButtons.querySelectorAll("button").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      renderLeaderboard(season);
    });
    elements.yearButtons.append(button);
  });
}

function renderLeaderboard(season) {
  elements.title.textContent = `${season.year} standings`;
  elements.description.textContent = season.description ?? "";
  elements.leaderboard.replaceChildren();

  season.leaderboard.forEach((entry, index) => {
    const row = document.createElement("tr");
    if (index === 0) row.className = "champion";
    appendCell(row, `${medal(index)} ${index + 1}`.trim(), "rank");
    appendCell(row, entry.manager, "manager");
    appendCell(row, number.format(Number(entry.points)), "numeric");
    appendCell(row, finish(index), "finish");
    elements.leaderboard.append(row);
  });
}

function appendCell(row, text, className) {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = text ?? "";
  row.append(cell);
}

function medal(rank) {
  return ["🥇", "🥈", "🥉"][rank] ?? "";
}

function finish(rank) {
  return ["Champion", "Runner-up", "Third place"][rank] ?? "—";
}

function renderStats(seasons) {
  const managers = new Set();
  let points = 0;
  seasons.forEach((season) => season.leaderboard.forEach((entry) => {
    managers.add(entry.manager);
    points += Number(entry.points) || 0;
  }));

  elements.seasons.textContent = seasons.length;
  elements.managers.textContent = managers.size;
  elements.championCount.textContent = seasons.length;
  elements.points.textContent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(points);
}

function renderChampions(seasons) {
  const champions = new Map();
  seasons.forEach((season) => {
    const champion = season.leaderboard[0];
    const wins = champions.get(champion.manager) ?? [];
    wins.push(season.year);
    champions.set(champion.manager, wins);
  });

  elements.champions.replaceChildren();
  [...champions.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .forEach(([manager, years], index) => {
      const card = document.createElement("article");
      card.className = "champion-card";
      card.dataset.rank = String(index + 1).padStart(2, "0");

      const crown = document.createElement("span");
      crown.className = "crown";
      crown.textContent = "◆";
      const name = document.createElement("h3");
      name.textContent = manager;
      const count = document.createElement("p");
      count.className = "win-count";
      count.textContent = years.length === 1 ? "Champion" : `${years.length}-time champion`;
      const seasonsWon = document.createElement("p");
      seasonsWon.textContent = years.sort((a, b) => b - a).join(" · ");
      card.append(crown, name, count, seasonsWon);
      elements.champions.append(card);
    });
}

loadData();
