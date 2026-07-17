(function () {
  "use strict";

  const root = document.getElementById("publicScheduleApp");

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function itemMeta(item) {
    const parts = [];
    if (Array.isArray(item.teacherNames) && item.teacherNames.length) parts.push(item.teacherNames.join(", "));
    if (item.level) parts.push(item.level);
    if (item.ageRange) parts.push(item.ageRange);
    return parts.join(" · ");
  }

  function stateHtml(title, message, isError) {
    return `
      <section class="public-schedule-shell">
        <section class="public-schedule-state${isError ? " error" : ""}">
          <h1>${escapeHtml(title)}</h1>
          <p class="muted">${escapeHtml(message)}</p>
        </section>
      </section>
    `;
  }

  function getHashBranch() {
    try {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return "";
      const params = new URLSearchParams(hash);
      return params.get("branş") || params.get("branch") || "";
    } catch (e) {
      return "";
    }
  }

  function setHashBranch(branchId) {
    try {
      const hash = branchId ? `branş=${encodeURIComponent(branchId)}` : "";
      history.replaceState(null, "", window.location.pathname + window.location.search + (hash ? `#${hash}` : ""));
    } catch (e) { /* ignore */ }
  }

  function renderScheduleGrid(days, filterBranchId, branches) {
    const branchById = new Map((branches || []).map((b) => [b.id, b]));
    const showBranchLabel = !filterBranchId;

    return days
      .map((entry) => {
        const filteredItems = filterBranchId
          ? (entry.items || []).filter((item) => item.branchId === filterBranchId)
          : (entry.items || []);

        return `
          <div class="day-column">
            <h4>${escapeHtml(entry.day || "Gün")}</h4>
            ${filteredItems.length
              ? filteredItems
                  .map((item) => {
                    const color = item.branchColor || (branchById.get(item.branchId) || {}).color || "#dc2727";
                    return `
                      <article class="schedule-item public-schedule-item" style="border-left-color:${escapeHtml(color)}">
                        ${showBranchLabel && item.branchName ? `<span class="schedule-branch-label" style="color:${escapeHtml(color)}">${escapeHtml(item.branchName)}</span>` : ""}
                        <strong>${escapeHtml(item.startTime || "-")} - ${escapeHtml(item.endTime || "-")}</strong>
                        <span>${escapeHtml(item.groupName || "Grup")}</span>
                        ${itemMeta(item) ? `<small>${escapeHtml(itemMeta(item))}</small>` : ""}
                        ${item.capacity ? `<small class="schedule-capacity">Kontenjan: ${Number(item.currentCount || 0)}/${Number(item.capacity || 0)}</small>` : ""}
                      </article>
                    `;
                  })
                  .join("")
              : '<small class="muted">Ders yok</small>'}
          </div>
        `;
      })
      .join("");
  }

  let loadedData = null;

  function applyFilter(branchId) {
    if (!loadedData) return;
    const data = loadedData;
    const grid = document.getElementById("scheduleGrid");
    if (grid) {
      grid.innerHTML = renderScheduleGrid(data.days || [], branchId, data.branches || []);
    }
    setHashBranch(branchId);
  }

  function render(data) {
    loadedData = data;
    const branches = Array.isArray(data.branches) && data.branches.length > 1 ? data.branches : [];
    const isAllBranches = Boolean(data.isAllBranches) && branches.length > 0;
    const initialBranch = isAllBranches ? getHashBranch() : (data.branch ? data.branch.id : "");

    root.innerHTML = `
      <section class="public-schedule-shell">
        <section class="table-panel public-schedule-panel">
          <div class="table-header">
            <h3>${isAllBranches ? "Ders programı" : escapeHtml((data.branch && data.branch.name) || data.workspaceName || "Ders programı")}</h3>
            ${isAllBranches
              ? `<div class="filters">
                   <select id="scheduleBranchSelect" class="schedule-branch-select">
                     <option value="">Tüm branşlar</option>
                     ${branches.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("")}
                   </select>
                 </div>`
              : ""}
          </div>
          <div style="padding: 16px;">
            <div id="scheduleGrid" class="schedule-grid schedule-grid-wide">
              ${renderScheduleGrid(data.days || [], initialBranch, branches)}
            </div>
          </div>
        </section>
      </section>
    `;

    if (isAllBranches) {
      const select = document.getElementById("scheduleBranchSelect");
      if (select) {
        if (initialBranch) select.value = initialBranch;
        select.addEventListener("change", () => applyFilter(select.value));
      }
    }
  }

  async function load() {
    if (!root) return;
    try {
      const response = await fetch(`${window.location.pathname.replace(/\/$/, "")}/data`, { credentials: "omit" });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok) {
        throw new Error((payload && (payload.message || payload.error)) || "Program yüklenemedi.");
      }

      render(payload || {});
    } catch (error) {
      root.innerHTML = stateHtml("Program bulunamadı", error.message || "Paylaşılan bağlantı geçersiz veya artık kullanılamıyor.", true);
    }
  }

  load();
})();
