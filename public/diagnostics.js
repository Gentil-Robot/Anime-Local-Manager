(() => {
  "use strict";
  let report=null;
  const tr = text => window.ALM_I18N?.t?.(text) || text;
  const element = (tag,text) => { const node=document.createElement(tag); if(text!==undefined)node.textContent=text;return node; };
  function render(host) {
    host.replaceChildren();
    if(!report)return;
    const grid=element("div");grid.className="alm-diagnostic-grid";
    for (const [label,value] of [
      ["Version",report.version],["Stockage",report.storage.mode.toUpperCase()],
      ["Fiches metadata embarqu\u00e9es",report.snapshot.rows],
      ["Saisons \u00e0 identifier",report.library.provisionalSeasons],
      ["Paroles \u00e0 v\u00e9rifier",report.karaoke.flaggedLines],
      ["Passages \u00e0 recaler",report.karaoke.pendingInsertions]
    ]) {const box=element("div");box.append(element("span",tr(label)),element("strong",value));grid.append(box);}
    if (report.library.provisionalSeasons > 0) {
      const review=element("details"), copy=window.ALM_RETOUCHES;
      review.className="provisional-review";
      review.append(element("summary",copy.t("reviewSeasons")),element("p",copy.t("reviewSeasonsHint")));
      for (const anime of (window._almAnimes || []).filter(a=>(report.library.provisionalIds||[]).includes(Number(a.id)))) {
        const open=element("button",anime.title);open.type="button";open.setAttribute("translate","no");
        open.onclick=()=>{document.getElementById("settingsDialog").close();window.openEdit?.(anime);};
        review.append(open);
      }
      host.append(review);
    }
    host.append(grid,element("p",tr("Couverture des catalogues : pr\u00e9sence des cl\u00e9s, pas validation linguistique.")));
    const table=element("table");const head=element("tr");
    for(const label of ["Langue","Traductions","Sources RSS"])head.append(element("th",tr(label)));
    table.append(head);
    for(const [code,data] of Object.entries(report.locales)) {
      const row=element("tr");
      row.append(element("th",code),element("td",`${data.translated}/${data.total} (${data.percent}%)`),element("td",String(report.news[code].configuredSources)));
      table.append(row);
    }
    host.append(table,element("p",tr("Ce diagnostic reste local et ne contacte aucun service externe.")));
    if(!report.news["zh-CN"].configuredSources)host.append(element("p",tr("Chinois : aucun flux RSS configur\u00e9. Les autres langues restent disponibles.")));
    const download=element("button",tr("Exporter le diagnostic"));download.type="button";
    download.onclick=async()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(await window.ALM_SUPPORT.build(),null,2)],{type:"application/json"}));
      const link=element("a");link.href=url;link.download="ALM-diagnostic.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };host.append(download);
  }
  function init() {
    const main=document.querySelector("#settingsDialog .settings-main");if(!main)return;
    const section=element("details");section.className="settings-section settings-disclosure";section.id="almDiagnostics";section.open=true;
    const summary=element("summary");
    const icon=element("span","⚙");icon.className="settings-summary-icon";
    const copy=element("span");copy.append(element("strong","Diagnostic local"));
    const arrow=element("span","⌄");arrow.className="settings-summary-chevron";
    summary.append(icon,copy,arrow);
    const button=element("button","Actualiser le diagnostic");button.type="button";
    const body=element("div");body.className="settings-disclosure-body";
    const output=element("div");output.setAttribute("translate","no");output.setAttribute("aria-live","polite");
    const load=async()=>{if(button.disabled)return;button.disabled=true;try{const response=await fetch("/api/diagnostics");if(!response.ok)throw new Error("HTTP "+response.status);report=await response.json();render(output);}catch{output.textContent=tr("Diagnostic indisponible. R\u00e9essaie apr\u00e8s le d\u00e9marrage.");}finally{button.disabled=false;}};
    button.onclick=load;section.addEventListener("toggle",()=>{if(section.open && !report && !section.closest('[hidden]'))load();});
    window.addEventListener('alm:diagnostic-refresh',load);
    body.append(button,output);section.append(summary,body);main.append(section);
    window.addEventListener("alm:language-changed",()=>render(output));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
