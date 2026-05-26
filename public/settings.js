
(function () {
  function $(id) {
    return document.getElementById(id);
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

    alert("Le vrai choix de dossier fonctionne dans la version application Windows. En navigateur, copie-colle le chemin depuis l’Explorateur.");
  }

  async function openSettingsPanel() {
    const dialog = $("settingsDialog");
    if (!dialog) return alert("Panneau Réglages introuvable.");

    try {
      const config = await api("/api/config");
      if ($("cloudBackupPath")) $("cloudBackupPath").value = config.cloudBackupPath || "";
    } catch (_) {}

    if ($("oldVersionPath")) $("oldVersionPath").value = "";

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "open");
  }

  async function saveSettings(event) {
    event.preventDefault();
    alert("Réglages enregistrés.");
    $("settingsDialog").close();
  }

  function exportBackup() {
    window.location.href = "/api/backup/export";
  }

  async function restoreBackup() {
    const file = $("restoreBackupFile") && $("restoreBackupFile").files[0];
    if (!file) return alert("Choisis un fichier de sauvegarde JSON.");
    if (!confirm("Restaurer cette sauvegarde ? Les données actuelles peuvent être remplacées.")) return;

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
    await api("/api/news/cache/clear", {
      method: "POST",
      body: JSON.stringify({})
    });

    alert("Cache news vidé.");
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
  });
})();
