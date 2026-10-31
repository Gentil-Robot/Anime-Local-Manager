
(function () {
  function $(id) {
    return document.getElementById(id);
  }


  async function askConfirmation(message, options = {}) {
    if (typeof window.showAppConfirm === "function") {
      return window.showAppConfirm(message, options);
    }
    window.notifyApp?.("La fenêtre de confirmation interne est indisponible.", "error");
    return false;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...options
    });

    if (!response.ok) {
      let message = "Erreur inconnue";
      try {
        const body = await response.json();
        message = body.error || message;
      } catch (_) {}
      throw new Error(message);
    }

    return response.json();
  }

  async function pickFolderToInput(inputId) {
    if (window.animeManager && window.animeManager.pickFolder) {
      const folder = await window.animeManager.pickFolder();
      if (folder && $(inputId)) $(inputId).value = folder;
      return;
    }

    window.notifyApp?.("Le sélecteur de dossier est disponible dans l’application de bureau Windows ou Linux. En navigateur, copie-colle le chemin depuis ton gestionnaire de fichiers.", "warning");
  }

  async function openSettingsPanel() {
    const dialog = $("settingsDialog");
    if (!dialog) return alert("Panneau Réglages introuvable.");

    try {
      const config = await api("/api/config");
      if ($("cloudBackupPath")) $("cloudBackupPath").value = config.cloudBackupPath || "";
      if ($("betaseriesApiKey")) $("betaseriesApiKey").value = config.betaseriesApiKey || "";
      if ($("workerMode")) $("workerMode").value = config.workerMode || "normal";
      const modeLabels = {prudent:"Prudent",normal:"Équilibré",rapide:"Rapide"};
      if ($("workerModeStatus")) $("workerModeStatus").textContent = `Mode actuel : ${modeLabels[config.workerMode] || "Équilibré"}`;
      if ($("betaseriesApiSavedHint")) $("betaseriesApiSavedHint").textContent = config.betaseriesApiKeySaved ? "Clé enregistrée, bonus BetaSeries actif." : "Aucune clé enregistrée ; normal, elle est optionnelle.";
      if ($("metadataManifestUrl")) $("metadataManifestUrl").value = config.metadataManifestUrl || "";
      if ($("metadataUrl")) $("metadataUrl").value = config.metadataUrl || "";
      if ($("metadataUpdateOnStart")) $("metadataUpdateOnStart").checked = config.metadataUpdateOnStart !== false;
      if ($("metadataUpdateIntervalHours")) $("metadataUpdateIntervalHours").value = config.metadataUpdateIntervalHours || 168;
      if ($("metadataAutonomousUpdateOnStart")) $("metadataAutonomousUpdateOnStart").checked = config.metadataAutonomousUpdateOnStart !== false;
      if ($("metadataAutonomousIntervalHours")) $("metadataAutonomousIntervalHours").value = config.metadataAutonomousIntervalHours || 168;
      if ($("metadataAutonomousSeasonalPages")) $("metadataAutonomousSeasonalPages").value = config.metadataAutonomousSeasonalPages || 2;
      if ($("metadataAutonomousUpcomingPages")) $("metadataAutonomousUpcomingPages").value = config.metadataAutonomousUpcomingPages || 2;
      if ($("metadataAutonomousTopPages")) $("metadataAutonomousTopPages").value = config.metadataAutonomousTopPages || 2;
      if ($("metadataAutonomousAniListPages")) $("metadataAutonomousAniListPages").value = config.metadataAutonomousAniListPages || 2;
    } catch (_) {}

    if ($("oldVersionPath")) $("oldVersionPath").value = "";

    dialog.querySelectorAll(".settings-main > details.settings-disclosure").forEach(section => { section.open = false; });
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "open");
  }

  async function saveSettings(event) {
    event.preventDefault();
    // Each section saves through its own explicit action.
  }

  function exportBackup() {
    window.location.href = "/api/backup/export";
  }

  async function restoreBackup() {
    const file = $("restoreBackupFile") && $("restoreBackupFile").files[0];
    if(window.ALM_RESTORE)return; // The unified restore button owns type detection and preview.
    if (!file) return alert("Choisis un fichier de sauvegarde JSON.");
    const accepted = await askConfirmation(
      "Les données de cette sauvegarde peuvent remplacer les données actuelles. Une copie récente est recommandée avant de continuer.",
      { title: "Restaurer cette sauvegarde ?", okText: "Restaurer", cancelText: "Annuler" }
    );
    if (!accepted) return;

    const formData = new FormData();
    formData.append("file", file);

    await api("/api/backup/restore", {
      method: "POST",
      body: formData
    });

    alert("Restauration terminée. La page va se recharger.");
    location.reload();
  }

  async function clearNewsCache() {
    try {
      const result = await api("/api/news/cache/clear", {
        method: "POST",
        body: JSON.stringify({})
      });
      const count = Number(result.historyTotal || 0);
      alert(`Caches techniques des actualités vidés. L’historique local est conservé (${count} article${count > 1 ? "s" : ""}).`);
    } catch (error) {
      alert("Impossible de vider les caches d’actualités : " + error.message);
    }
  }


  async function refreshAliasesNow() {
    try {
      const result = await api("/api/aliases/refresh", {
        method: "POST",
        body: JSON.stringify({})
      });
      if ($("aliasStatus")) $("aliasStatus").textContent = "Alias : " + result.count + " correspondance(s), mis à jour maintenant.";
      alert("Base d’alias mise à jour : " + result.count + " correspondance(s).");
    } catch (error) {
      alert("Erreur alias : " + error.message);
    }
  }

  async function loadAliasStatus() {
    try {
      const result = await api("/api/aliases/status");
      if ($("aliasStatus")) $("aliasStatus").textContent = "Alias : " + result.count + " correspondance(s).";
    } catch {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    $("settingsBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      openSettingsPanel();
    });

    $("settingsForm")?.addEventListener("submit", saveSettings);
    $("cancelSettings")?.addEventListener("click", () => $("settingsDialog")?.close());
    $("exportBackup")?.addEventListener("click", exportBackup);
    $("restoreBackup")?.addEventListener("click", restoreBackup);
    $("clearNewsCache")?.addEventListener("click", clearNewsCache);
    $("refreshAliasesNow")?.addEventListener("click", refreshAliasesNow);
    loadAliasStatus();
  });
})();
