const button = document.querySelector("[data-sync-button]");
const status = document.querySelector("[data-sync-status]");

async function configureSync() {
  if (!button) return;

  try {
    const response = await fetch("config.json", { cache: "no-store" });
    const config = response.ok ? await response.json() : {};
    if (!config.syncEndpoint) return;

    button.disabled = false;
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Syncing…";
      if (status) status.textContent = "Syncing the spreadsheet…";

      try {
        const syncResponse = await fetch(config.syncEndpoint, { method: "POST" });
        const result = await syncResponse.json().catch(() => ({}));
        if (!syncResponse.ok) throw new Error(result.message || "Sync failed");
        if (status) status.textContent = result.status === "recent" ? "Already up to date" : "Spreadsheet synced";
        button.textContent = "Synced";
        window.setTimeout(() => location.reload(), 1200);
      } catch (error) {
        console.error("Unable to sync spreadsheet", error);
        if (status) status.textContent = "Sync failed. Try again.";
        button.disabled = false;
        button.textContent = "Sync data";
      }
    });
  } catch (error) {
    console.warn("Sync is unavailable", error);
  }
}

configureSync();
