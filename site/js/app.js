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

    if (config.googleSheetCsvUrl) {
      const response = await fetch(config.googleSheetCsvUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Spreadsheet returned ${response.status}`);
      const data = parseCsv(await response.text());
      render(data);
      elements.status.textContent = "Up to date from the spreadsheet";
      return;
    }

    const response = await fetch("leaderboard.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Leaderboard returned ${response.status}`);
    render(await response.json());
    elements.status.textContent = "Latest saved standings";
  } catch (error) {
    console.error("Unable to load standings", error);
    elements.status.textContent = "Couldn’t load the standings";
    elements.title.textContent = "The standings didn’t load";
  }
}

function parseCsv(csv) {
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

  const headers = rows.shift().map((header) => header.toLowerCase().replace(/\s+/g, ""));
  const seasons = new Map();

  rows.forEach((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const year = Number.parseInt(record.year, 10);
    const points = Number.parseFloat(record.points);
    if (!Number.isInteger(year) || !Number.isFinite(points)) return;
    if (!seasons.has(year)) seasons.set(year, []);
    seasons.get(year).push({
      manager: record.manager,
      teamName: record.teamname || record.team,
      points
    });
  });

  return {
    seasons: [...seasons.entries()]
      .map(([year, leaderboard]) => ({
        year,
        leaderboard: leaderboard.sort((left, right) => right.points - left.points)
      }))
      .sort((left, right) => right.year - left.year)
  };
}

function render(data) {
  const seasons = [...(data.seasons ?? [])]
    .filter((season) => Array.isArray(season.leaderboard) && season.leaderboard.length)
    .sort((left, right) => right.year - left.year);

  if (!seasons.length) throw new Error("No seasons were found");
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
    appendCell(row, entry.teamName, "team");
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
