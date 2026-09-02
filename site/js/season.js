import { loadLeagueData } from "./live-data.js";

const elements = {
  status: document.querySelector("#weeklyDataStatus"),
  yearButtons: document.querySelector("#weeklyYearButtons"),
  title: document.querySelector("#weeklyTitle"),
  weekSelect: document.querySelector("#weekSelect"),
  winners: document.querySelector("#weekWinners"),
  losers: document.querySelector("#weekLosers"),
  paid: document.querySelector("#weekPaid"),
  owed: document.querySelector("#weekOwed"),
  ledger: document.querySelector("#ledgerTable")
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

async function loadWeeklyData() {
  try {
    const { data, source } = await loadLeagueData();
    const seasons = (data.seasons ?? [])
      .filter((season) => Array.isArray(season.weeks) && season.weeks.length)
      .sort((left, right) => right.year - left.year);
    if (!seasons.length) throw new Error("No weekly results were found");

    renderSeasonButtons(seasons);
    const requestedYear = Number.parseInt(new URLSearchParams(location.search).get("year"), 10);
    selectSeason(seasons.find((season) => season.year === requestedYear) ?? seasons[0]);
    elements.status.textContent = source === "live" ? "Live from the spreadsheet" : "Showing saved weekly results";
  } catch (error) {
    console.error("Unable to load weekly results", error);
    elements.status.textContent = "Couldn’t load the weekly results";
    elements.title.textContent = "The weekly results didn’t load";
  }
}

function renderSeasonButtons(seasons) {
  elements.yearButtons.replaceChildren();
  seasons.forEach((season) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "year-btn";
    button.textContent = season.year;
    button.addEventListener("click", () => selectSeason(season));
    elements.yearButtons.append(button);
  });
}

function selectSeason(season) {
  elements.yearButtons.querySelectorAll("button").forEach((button) => {
    const active = Number(button.textContent) === season.year;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  history.replaceState(null, "", `?year=${season.year}`);
  elements.title.textContent = `${season.year} weekly money`;
  renderWeekPicker(season);
  renderLedger(season);
}

function renderWeekPicker(season) {
  elements.weekSelect.replaceChildren();
  season.weeks.forEach((week, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = week.label;
    elements.weekSelect.append(option);
  });
  elements.weekSelect.value = String(season.weeks.length - 1);
  elements.weekSelect.onchange = () => renderWeekSummary(season.weeks[Number(elements.weekSelect.value)]);
  renderWeekSummary(season.weeks.at(-1));
}

function renderWeekSummary(week) {
  const winners = week.results.filter((entry) => entry.amount > 0).sort((a, b) => b.amount - a.amount);
  const losers = week.results.filter((entry) => entry.amount < 0).sort((a, b) => a.amount - b.amount);
  renderMoneyList(elements.winners, winners, "No payouts");
  renderMoneyList(elements.losers, losers, "Nobody owes");
  elements.paid.textContent = money.format(winners.reduce((total, entry) => total + entry.amount, 0));
  elements.owed.textContent = money.format(Math.abs(losers.reduce((total, entry) => total + entry.amount, 0)));
}

function renderMoneyList(list, entries, emptyText) {
  list.replaceChildren();
  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "empty-result";
    item.textContent = emptyText;
    list.append(item);
    return;
  }
  entries.forEach((entry) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = entry.manager;
    const amount = document.createElement("strong");
    amount.textContent = formatSignedMoney(entry.amount);
    item.append(name, amount);
    list.append(item);
  });
}

function renderLedger(season) {
  const managers = [...new Set(season.weeks.flatMap((week) => week.results.map((entry) => entry.manager)))];
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  appendCell(headerRow, "Manager", "th");
  season.weeks.forEach((week) => appendCell(headerRow, week.label, "th"));
  appendCell(headerRow, "Net", "th");
  head.append(headerRow);

  const body = document.createElement("tbody");
  managers.forEach((manager) => {
    const row = document.createElement("tr");
    appendCell(row, manager, "td", "ledger-manager");
    let net = 0;
    season.weeks.forEach((week) => {
      const amount = week.results.find((entry) => entry.manager === manager)?.amount ?? null;
      if (amount !== null) net += amount;
      appendCell(row, amount === null ? "" : formatSignedMoney(amount), "td", moneyClass(amount));
    });
    appendCell(row, formatSignedMoney(net), "td", `${moneyClass(net)} ledger-net`);
    body.append(row);
  });

  elements.ledger.replaceChildren(head, body);
}

function appendCell(row, text, tag, className = "") {
  const cell = document.createElement(tag);
  cell.textContent = text;
  cell.className = className;
  if (tag === "th") cell.scope = "col";
  row.append(cell);
}

function formatSignedMoney(amount) {
  if (amount === 0) return "—";
  return `${amount > 0 ? "+" : "−"}${money.format(Math.abs(amount))}`;
}

function moneyClass(amount) {
  if (amount > 0) return "money-positive";
  if (amount < 0) return "money-negative";
  return "money-zero";
}

loadWeeklyData();
