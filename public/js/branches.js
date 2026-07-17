(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;

  function renderBranchesPage() {
    const root = app.$("#page-content");
    if (!root) return;

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Branş Yönetimi</h2>
          <p>Branş ücretleri, kapasite, doluluk ve gelir takibi.</p>
        </div>
        <button class="btn btn-primary" id="newBranchButton">Branş ekle</button>
      </section>

      <section class="toolbar">
        <div class="filters">
          <input id="branchSearch" type="search" placeholder="Branş adı veya açıklama ara" />
          <select id="branchStatusFilter">
            <option value="">Tüm durumlar</option>
            <option value="Aktif">Aktif</option>
            <option value="Pasif">Pasif</option>
          </select>
        </div>
      </section>

      <section id="branchGrid" class="grid three"></section>
    `;

    app.$("#newBranchButton").addEventListener("click", () => openBranchForm());
    app.$("#branchSearch").addEventListener("input", renderBranchCards);
    app.$("#branchStatusFilter").addEventListener("input", renderBranchCards);
    app.$("#branchGrid").addEventListener("click", handleBranchAction);
    renderBranchCards();
  }

  function filteredBranches() {
    const search = (app.$("#branchSearch")?.value || "").toLocaleLowerCase("tr-TR");
    const status = app.$("#branchStatusFilter")?.value || "";

    return storage.getData(storage.KEYS.branches, []).filter((branch) => {
      const haystack = [branch.name, branch.description, branch.notes].join(" ").toLocaleLowerCase("tr-TR");
      return (!search || haystack.includes(search)) && (!status || branch.status === status);
    });
  }

  function firstDayOfNextMonthISO() {
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth() + 1, 1, 12, 0, 0);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  }

  function feeHistoryForSave(branch, oldFee, newFee, nextEffectiveDate) {
    const current = Array.isArray(branch?.feeHistory)
      ? branch.feeHistory
          .filter((item) => item && item.effectiveDate !== undefined && item.amount !== undefined)
          .map((item) => {
            const normalized = {
              effectiveDate: String(item.effectiveDate),
              amount: Number(item.amount || 0)
            };
            if (item.changedDate) normalized.changedDate = String(item.changedDate);
            return normalized;
          })
      : [];

    if (!branch) {
      return newFee > 0 ? [{ effectiveDate: storage.todayISO(), changedDate: storage.todayISO(), amount: newFee }] : [];
    }

    if (oldFee === newFee) return current;

    const history = current.length ? current.slice() : [{ effectiveDate: "1900-01-01", amount: Number(oldFee || 0) }];
    return history
      .filter((item) => item.effectiveDate !== nextEffectiveDate)
      .concat([{ effectiveDate: nextEffectiveDate, changedDate: storage.todayISO(), amount: newFee }])
      .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
  }

  function renderBranchCards() {
    const grid = app.$("#branchGrid");
    if (!grid) return;
    const branches = filteredBranches();
    const canEdit = app.access.canEdit("branches");
    const canMoney = app.access.canView("payments");

    grid.innerHTML = branches.length
      ? branches
          .map((branch) => {
            const count = app.getBranchStudentCount(branch.id);
            const capacity = Number(branch.capacity || 0);
            const occupancy = capacity ? Math.min(Math.round((count / capacity) * 100), 100) : 0;
            const revenue = app.getBranchRevenue(branch.id);
            return `
              <article class="card">
                <div class="toolbar">
                  <span class="chip color-dot" style="--chip-color:${branch.color || "#dc2727"}">${app.escapeHtml(branch.name)}</span>
                  ${app.statusBadge(branch.status)}
                </div>
                <p class="muted">${app.escapeHtml(branch.description || "Açıklama yok.")}</p>
                <div class="detail-grid">
                  ${canMoney ? `<div class="detail-item"><span>Aylık ücret</span><strong>${app.formatCurrency(branch.monthlyFee)}</strong></div>` : ""}
                  ${canMoney ? `<div class="detail-item"><span>Ders başı</span><strong>${app.formatCurrency(branch.lessonFee)}</strong></div>` : ""}
                  <div class="detail-item"><span>Öğrenci</span><strong>${count}/${capacity || "-"}</strong></div>
                  ${canMoney ? `<div class="detail-item"><span>Gelir</span><strong>${app.formatCurrency(revenue)}</strong></div>` : ""}
                  <div class="detail-item"><span>Yaş</span><strong>${app.escapeHtml(branch.minAge || "-")} - ${app.escapeHtml(branch.maxAge || "-")}</strong></div>
                  <div class="detail-item"><span>Doluluk</span><strong>%${occupancy}</strong></div>
                </div>
                <div class="progress" style="margin: 14px 0;"><span style="--value:${occupancy}%; --bar-color:${branch.color || "#dc2727"}"></span></div>
                ${canEdit ? `<div class="actions">
                  <button class="btn" data-action="edit" data-id="${branch.id}">Düzenle</button>
                  ${branch.status === "Aktif"
                    ? `<button class="btn btn-warning" data-action="passive" data-id="${branch.id}">Pasifleştir</button>`
                    : `<button class="btn btn-primary" data-action="activate" data-id="${branch.id}">Aktifleştir</button>
                       <button class="btn btn-danger" data-action="delete" data-id="${branch.id}">Sil</button>`
                  }
                </div>` : ""}
              </article>
            `;
          })
          .join("")
      : app.emptyState("Filtrelere uygun branş bulunamadı.");

  }

  function handleBranchAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    if (button.dataset.action === "edit") openBranchForm(id);
    if (button.dataset.action === "passive") makeBranchPassive(id);
    if (button.dataset.action === "activate") makeBranchActive(id);
    if (button.dataset.action === "delete") deletePassiveBranch(id);
  }

  function branchFormHtml(branch) {
    const item = branch || {
      status: "Aktif",
      color: "#dc2727",
      monthlyFee: "",
      lessonFee: "",
      capacity: "",
      minAge: "",
      maxAge: ""
    };

    return `
      <form id="branchForm" class="form-card">
        <div class="form-grid">
          <label>Branş adı<input name="name" value="${app.escapeHtml(item.name || "")}" required /></label>
          <label>Branş rengi<input name="color" type="color" value="${app.escapeHtml(item.color || "#dc2727")}" /></label>
          ${app.access.canView("payments")
            ? `<label>Aylık ücret<input name="monthlyFee" type="number" min="0" value="${app.escapeHtml(item.monthlyFee ?? "")}" /></label>
          <label>Ders başı ücret<input name="lessonFee" type="number" min="0" value="${app.escapeHtml(item.lessonFee ?? "")}" /></label>`
            : `<input type="hidden" name="monthlyFee" value="${app.escapeHtml(item.monthlyFee ?? "")}" /><input type="hidden" name="lessonFee" value="${app.escapeHtml(item.lessonFee ?? "")}" />`}
          <label>Kapasite<input name="capacity" type="number" min="0" value="${app.escapeHtml(item.capacity ?? "")}" /></label>
          <label>Durum
            <select name="status">
              <option value="Aktif" ${item.status === "Aktif" ? "selected" : ""}>Aktif</option>
              <option value="Pasif" ${item.status === "Pasif" ? "selected" : ""}>Pasif</option>
            </select>
          </label>
          <label>Minimum yaş<input name="minAge" type="number" min="0" value="${app.escapeHtml(item.minAge ?? "")}" /></label>
          <label>Maksimum yaş<input name="maxAge" type="number" min="0" value="${app.escapeHtml(item.maxAge ?? "")}" /></label>
          <label class="span-2">Açıklama<textarea name="description">${app.escapeHtml(item.description || "")}</textarea></label>
          <label class="span-2">Notlar<textarea name="notes">${app.escapeHtml(item.notes || "")}</textarea></label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Kaydet</button>
        </div>
      </form>
    `;
  }

  function openBranchForm(branchId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const branch = branches.find((item) => item.id === branchId);
    app.openModal(branch ? "Branş düzenle" : "Branş ekle", branchFormHtml(branch), { size: "small" });

    app.$("#branchForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const record = {
        id: branch ? branch.id : storage.generateId("br"),
        name: String(data.get("name") || "").trim(),
        description: String(data.get("description") || "").trim(),
        monthlyFee: Number(data.get("monthlyFee") || 0),
        lessonFee: Number(data.get("lessonFee") || 0),
        capacity: Number(data.get("capacity") || 0),
        minAge: Number(data.get("minAge") || 0),
        maxAge: Number(data.get("maxAge") || 0),
        status: String(data.get("status") || "Aktif"),
        color: String(data.get("color") || "#dc2727"),
        notes: String(data.get("notes") || "").trim(),
        feeHistory: Array.isArray(branch?.feeHistory) ? branch.feeHistory : []
      };

      if (!record.name) {
        app.toast("Branş adı zorunludur.", "error");
        return;
      }

      const oldFee = branch ? Number(branch.monthlyFee || 0) : null;
      const newFee = Number(record.monthlyFee || 0);
      const nextEffectiveDate = branch && oldFee !== newFee ? firstDayOfNextMonthISO() : "";
      record.feeHistory = feeHistoryForSave(branch, oldFee, newFee, nextEffectiveDate);

      const next = branch ? branches.map((item) => (item.id === branch.id ? record : item)) : [...branches, record];
      storage.setData(storage.KEYS.branches, next);

      let propagatedCount = 0;
      if (window.CaYaEngine && branch && oldFee !== newFee) {
        const result = window.CaYaEngine.ensureStudentPayments();
        propagatedCount = result.updated || 0;
      } else if (window.CaYaEngine) {
        window.CaYaEngine.runAll();
      }

      app.closeModal();
      renderBranchesPage();
      if (branch && oldFee !== newFee && propagatedCount > 0) {
        app.toast(`Branş kaydedildi. ${propagatedCount} gelecek dönem ödeme planı yeni ücretle güncellendi. Yeni ücret ${app.formatDate(nextEffectiveDate)} tarihinden itibaren geçerli.`, "success");
      } else if (branch && oldFee !== newFee) {
        app.toast(`Branş kaydedildi. Yeni ücret ${app.formatDate(nextEffectiveDate)} tarihinden itibaren geçerli olacak.`, "success");
      } else {
        app.toast("Branş kaydedildi.", "success");
      }
      window.CaYaAudit?.log("branches", branch ? "edit" : "add", `Branş ${branch ? "güncellendi" : "eklendi"}: ${record.name} | Aylık ücret: ${record.monthlyFee ? app.formatCurrency(record.monthlyFee) : "-"} | Kapasite: ${record.capacity || "Sınırsız"} | Durum: ${record.status}`);
    });
  }

  function makeBranchPassive(branchId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return;
    if (!confirm(`${branch.name} branşı pasifleştirilsin mi?`)) return;

    storage.setData(
      storage.KEYS.branches,
      branches.map((item) => (item.id === branchId ? { ...item, status: "Pasif" } : item))
    );
    renderBranchesPage();
    app.toast("Branş pasifleştirildi.", "success");
    window.CaYaAudit?.log("branches", "passive", `Branş pasifleştirildi: ${branch.name} | Aylık ücret: ${branch.monthlyFee ? app.formatCurrency(branch.monthlyFee) : "-"}`);
  }

  function makeBranchActive(branchId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return;
    if (!confirm(`${branch.name} branşı aktifleştirilsin mi?`)) return;

    storage.setData(
      storage.KEYS.branches,
      branches.map((item) => (item.id === branchId ? { ...item, status: "Aktif" } : item))
    );
    renderBranchesPage();
    app.toast("Branş aktifleştirildi.", "success");
    window.CaYaAudit?.log("branches", "activate", `Branş aktifleştirildi: ${branch.name} | Aylık ücret: ${branch.monthlyFee ? app.formatCurrency(branch.monthlyFee) : "-"}`);
  }

  function deletePassiveBranch(branchId) {
    if (!app.access.canEdit("branches")) return;

    const branches = storage.getData(storage.KEYS.branches, []);
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return;

    if (branch.status !== "Pasif") {
      app.toast("Yalnızca pasif branşlar silinebilir. Önce pasifleştirin.", "error");
      return;
    }

    const activeGroups = storage
      .getData(storage.KEYS.groups, [])
      .filter((group) => group.branchId === branchId && group.status === "Aktif");
    const activeEnrollments = storage
      .getData(storage.KEYS.enrollments, [])
      .filter((enrollment) => enrollment.branchId === branchId && enrollment.status === "Aktif");

    if (activeGroups.length || activeEnrollments.length) {
      app.toast(
        `Silinemez: ${activeGroups.length} aktif grup, ${activeEnrollments.length} aktif öğrenci kaydı bu branşa bağlı. Önce bunları kapatın.`,
        "error"
      );
      return;
    }

    if (!confirm(`"${branch.name}" pasif branşı kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;

    storage.setData(
      storage.KEYS.branches,
      branches.filter((item) => item.id !== branchId)
    );
    renderBranchesPage();
    app.toast("Pasif branş silindi.", "success");
    window.CaYaAudit?.log(
      "branches",
      "delete",
      `Pasif branş silindi: ${branch.name} | Aylık ücret: ${branch.monthlyFee ? app.formatCurrency(branch.monthlyFee) : "-"}`
    );
  }

  app.registerPage("branches", renderBranchesPage);
})();
