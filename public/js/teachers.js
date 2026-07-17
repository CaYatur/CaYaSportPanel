(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;

  function renderTeachersPage() {
    const root = app.$("#page-content");
    if (!root) return;

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Öğretmen Yönetimi</h2>
          <p>Öğretmen kayıt, branş atama ve durum takibi.</p>
        </div>
        <button class="btn btn-primary" id="newTeacherButton">Öğretmen ekle</button>
      </section>

      <section class="toolbar">
        <div class="filters">
          <input id="teacherSearch" type="search" placeholder="Ad, soyad veya telefon ara" />
          <select id="teacherBranchFilter">
            <option value="">Tüm branşlar</option>
            ${storage.getData(storage.KEYS.branches, []).map((branch) => `<option value="${branch.id}">${app.escapeHtml(branch.name)}</option>`).join("")}
          </select>
          <select id="teacherStatusFilter">
            <option value="">Tüm durumlar</option>
            <option value="Aktif">Aktif</option>
            <option value="Pasif">Pasif</option>
          </select>
        </div>
      </section>

      <section class="table-panel">
        <div class="table-header">
          <h3>Öğretmen Listesi</h3>
          <span class="chip" id="teacherCount"></span>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ad Soyad</th>
                <th>Telefon</th>
                <th>E-posta</th>
                <th>Branşlar</th>
                ${app.access.canView("salaries") ? "<th>Aylık maaş</th>" : ""}
                <th>Başlangıç</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody id="teachersTbody"></tbody>
          </table>
        </div>
      </section>
    `;

    app.$("#newTeacherButton").addEventListener("click", () => openTeacherForm());
    ["#teacherSearch", "#teacherBranchFilter", "#teacherStatusFilter"].forEach((sel) =>
      app.$(sel).addEventListener("input", renderTeacherRows)
    );
    app.$("#teachersTbody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "edit") openTeacherForm(button.dataset.id);
      if (button.dataset.action === "passive") makeTeacherPassive(button.dataset.id);
      if (button.dataset.action === "activate") makeTeacherActive(button.dataset.id);
    });
    renderTeacherRows();
  }

  function filteredTeachers() {
    const search = (app.$("#teacherSearch")?.value || "").toLocaleLowerCase("tr-TR");
    const branchId = app.$("#teacherBranchFilter")?.value || "";
    const status = app.$("#teacherStatusFilter")?.value || "";

    return storage.getData(storage.KEYS.teachers, []).filter((teacher) => {
      const fullName = `${teacher.firstName || ""} ${teacher.lastName || ""}`;
      const haystack = [fullName, teacher.phone, teacher.email, teacher.notes].join(" ").toLocaleLowerCase("tr-TR");
      const branchMatch = !branchId || (teacher.branchIds || []).includes(branchId);
      return (!search || haystack.includes(search)) && branchMatch && (!status || teacher.status === status);
    });
  }

  function renderTeacherRows() {
    const tbody = app.$("#teachersTbody");
    if (!tbody) return;
    const branches = storage.getData(storage.KEYS.branches, []);
    const teachers = filteredTeachers();

    const canSal = app.access.canView("salaries");
    const canEdit = app.access.canEdit("teachers");
    tbody.innerHTML = teachers.length
      ? teachers
          .map((teacher) => {
            const fullName = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || "-";
            const branchNames = (teacher.branchIds || [])
              .map((id) => {
                const branch = branches.find((b) => b.id === id);
                return branch ? `<span class="chip color-dot" style="--chip-color:${branch.color || "#dc2727"}">${app.escapeHtml(branch.name)}</span>` : "";
              })
              .filter(Boolean)
              .join(" ");
            const salary = Number(teacher.monthlySalary || 0);
            return `
              <tr>
                <td><strong>${app.escapeHtml(fullName)}</strong></td>
                <td>${app.escapeHtml(teacher.phone || "-")}</td>
                <td>${app.escapeHtml(teacher.email || "-")}</td>
                <td>${branchNames || '<span class="muted">-</span>'}</td>
                ${canSal ? `<td>${salary ? app.formatCurrency(salary) : '<span class="muted">Belirtilmemiş</span>'}<br /><small class="muted">${app.formatDate(teacher.salaryEffectiveDate)}</small></td>` : ""}
                <td>${app.formatDate(teacher.startDate)}</td>
                <td>${app.statusBadge(teacher.status)}</td>
                <td>
                  <div class="actions">
                    ${canEdit ? `<button class="btn" data-action="edit" data-id="${teacher.id}">Düzenle</button>
                    ${teacher.status === "Aktif"
                      ? `<button class="btn btn-warning" data-action="passive" data-id="${teacher.id}">Pasifleştir</button>`
                      : `<button class="btn btn-primary" data-action="activate" data-id="${teacher.id}">Aktifleştir</button>`
                    }` : '<span class="muted">-</span>'}
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="${app.access.canView("salaries") ? 8 : 7}">${app.emptyState("Filtrelere uygun öğretmen bulunamadı.")}</td></tr>`;

    app.$("#teacherCount").textContent = `${teachers.length} kayıt`;
  }

  function teacherFormHtml(teacher) {
    const allBranches = storage.getData(storage.KEYS.branches, []);
    const item = teacher || { status: "Aktif", branchIds: [], salaryHistory: [] };
    const selectedBranchIds = item.branchIds || [];
    const salaryHistory = item.salaryHistory || [];

    return `
      <form id="teacherForm" class="form-card">
        <div class="form-grid">
          <label>Ad<input name="firstName" value="${app.escapeHtml(item.firstName || "")}" required /></label>
          <label>Soyad<input name="lastName" value="${app.escapeHtml(item.lastName || "")}" required /></label>
          <label>Telefon<input name="phone" type="tel" value="${app.escapeHtml(item.phone || "")}" /></label>
          <label>E-posta<input name="email" type="email" value="${app.escapeHtml(item.email || "")}" /></label>
          <label>Başlangıç tarihi<input name="startDate" type="date" value="${app.escapeHtml(item.startDate || "")}" ${teacher ? "" : "required"} /></label>
          ${app.access.canView("salaries")
            ? `<label>Aylık maaş<input name="monthlySalary" type="number" min="0" step="1" value="${app.escapeHtml(item.monthlySalary ?? "")}" placeholder="Ör: 25000" /></label>
          <label>Maaş geçerlilik tarihi<input name="salaryEffectiveDate" type="date" value="${app.escapeHtml(item.salaryEffectiveDate || "")}" /></label>`
            : `<input type="hidden" name="monthlySalary" value="${app.escapeHtml(item.monthlySalary ?? "")}" /><input type="hidden" name="salaryEffectiveDate" value="${app.escapeHtml(item.salaryEffectiveDate || "")}" />`}
          <label>Durum
            <select name="status">
              <option value="Aktif" ${item.status === "Aktif" ? "selected" : ""}>Aktif</option>
              <option value="Pasif" ${item.status === "Pasif" ? "selected" : ""}>Pasif</option>
            </select>
          </label>
          ${
            app.access.canView("salaries") && salaryHistory.length
              ? `<div class="span-2"><strong>Maaş geçmişi</strong><div class="compact-list" style="padding: 0;">${salaryHistory
                  .slice()
                  .reverse()
                  .map((entry) => `<div class="list-item"><div><strong>${app.formatCurrency(entry.amount)}</strong><small>${app.formatDate(entry.effectiveDate)}${entry.note ? " · " + app.escapeHtml(entry.note) : ""}</small></div></div>`)
                  .join("")}</div></div>`
              : ""
          }
          <label class="span-2">Branşlar
            <div class="checkbox-group">
              ${
                allBranches.length
                  ? allBranches
                      .map(
                        (branch) => `
                        <label class="checkbox-label">
                          <input type="checkbox" name="branchIds" value="${branch.id}" ${selectedBranchIds.includes(branch.id) ? "checked" : ""} />
                          <span class="color-dot" style="--chip-color:${branch.color || "#dc2727"}"></span>
                          ${app.escapeHtml(branch.name)}
                        </label>
                      `
                      )
                      .join("")
                  : '<span class="muted">Henüz branş eklenmemiş.</span>'
              }
            </div>
          </label>
          <label class="span-2">Notlar<textarea name="notes">${app.escapeHtml(item.notes || "")}</textarea></label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Kaydet</button>
        </div>
      </form>
    `;
  }

  function openTeacherForm(teacherId) {
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const teacher = teachers.find((item) => item.id === teacherId);
    app.openModal(teacher ? "Öğretmen düzenle" : "Öğretmen ekle", teacherFormHtml(teacher), { size: "small" });

    app.$("#teacherForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const branchIds = data.getAll("branchIds");
      const salaryRaw = String(data.get("monthlySalary") || "").trim();
      const monthlySalary = salaryRaw === "" ? null : Number(salaryRaw);
      const salaryEffectiveDate = String(data.get("salaryEffectiveDate") || "").trim() || storage.todayISO();
      const previousSalary = teacher ? Number(teacher.monthlySalary || 0) : null;
      const salaryHistory = (teacher && Array.isArray(teacher.salaryHistory)) ? teacher.salaryHistory.slice() : [];
      if (monthlySalary !== null && monthlySalary !== previousSalary) {
        salaryHistory.push({
          amount: monthlySalary,
          effectiveDate: salaryEffectiveDate,
          note: teacher ? "Düzenleme" : "İlk kayıt"
        });
      }

      const record = {
        id: teacher ? teacher.id : storage.generateId("tc"),
        firstName: String(data.get("firstName") || "").trim(),
        lastName: String(data.get("lastName") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        email: String(data.get("email") || "").trim(),
        startDate: String(data.get("startDate") || "").trim(),
        status: String(data.get("status") || "Aktif"),
        branchIds,
        monthlySalary,
        salaryEffectiveDate: monthlySalary !== null ? salaryEffectiveDate : "",
        salaryHistory,
        notes: String(data.get("notes") || "").trim()
      };

      if (!record.firstName || !record.lastName) {
        app.toast("Ad ve soyad zorunludur.", "error");
        return;
      }

      const next = teacher
        ? teachers.map((item) => (item.id === teacher.id ? record : item))
        : [...teachers, record];
      storage.setData(storage.KEYS.teachers, next);

      let salaryReport = null;
      if (window.CaYaEngine) {
        salaryReport = window.CaYaEngine.ensureTeacherSalaries();
      }

      app.closeModal();
      renderTeachersPage();
      if (salaryReport && (salaryReport.added > 0 || salaryReport.updated > 0)) {
        const messages = [];
        if (salaryReport.added) messages.push(`${salaryReport.added} maaş kaydı oluşturuldu`);
        if (salaryReport.updated) messages.push(`${salaryReport.updated} maaş tutarı güncellendi`);
        app.toast(`Öğretmen kaydedildi. ${messages.join(", ")}.`, "success");
      } else {
        app.toast("Öğretmen kaydedildi.", "success");
      }
      const _tcBranches = storage.getData(storage.KEYS.branches, []);
      const _tcBranchNames = (record.branchIds || []).map(bid => (_tcBranches.find(b => b.id === bid) || {}).name || bid).join(", ") || "-";
      window.CaYaAudit?.log("teachers", teacher ? "edit" : "add", `Öğretmen ${teacher ? "güncellendi" : "eklendi"}: ${record.firstName} ${record.lastName} | Telefon: ${record.phone || "-"} | Maaş: ${record.monthlySalary ? app.formatCurrency(record.monthlySalary) : "-"} | Branşlar: ${_tcBranchNames} | Durum: ${record.status}`);
    });
  }

  function makeTeacherPassive(teacherId) {
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const teacher = teachers.find((item) => item.id === teacherId);
    if (!teacher) return;
    if (!confirm(`${teacher.firstName} ${teacher.lastName} pasifleştirilsin mi?`)) return;

    storage.setData(
      storage.KEYS.teachers,
      teachers.map((item) => (item.id === teacherId ? { ...item, status: "Pasif" } : item))
    );
    renderTeacherRows();
    app.toast("Öğretmen pasifleştirildi.", "success");
    window.CaYaAudit?.log("teachers", "passive", `Öğretmen pasifleştirildi: ${teacher.firstName} ${teacher.lastName} | Telefon: ${teacher.phone || "-"} | Maaş: ${teacher.monthlySalary ? app.formatCurrency(teacher.monthlySalary) : "-"}`);
  }

  function makeTeacherActive(teacherId) {
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const teacher = teachers.find((item) => item.id === teacherId);
    if (!teacher) return;
    if (!confirm(`${teacher.firstName} ${teacher.lastName} aktifleştirilsin mi?`)) return;

    storage.setData(
      storage.KEYS.teachers,
      teachers.map((item) => (item.id === teacherId ? { ...item, status: "Aktif" } : item))
    );
    renderTeacherRows();
    app.toast("Öğretmen aktifleştirildi.", "success");
    window.CaYaAudit?.log("teachers", "activate", `Öğretmen aktifleştirildi: ${teacher.firstName} ${teacher.lastName} | Telefon: ${teacher.phone || "-"} | Maaş: ${teacher.monthlySalary ? app.formatCurrency(teacher.monthlySalary) : "-"}`);
  }

  app.registerPage("teachers", renderTeachersPage);
})();
