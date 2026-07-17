(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;
  const engine = window.CaYaEngine;
  const paymentMethods = ["Nakit", "Kredi kartı", "Havale/EFT", "Diğer"];

  function allSalaries() {
    if (engine) engine.ensureTeacherSalaries();
    return engine
      ? engine.normalizeSalaries(storage.getData(storage.KEYS.teacherSalaries, []))
      : storage.getData(storage.KEYS.teacherSalaries, []);
  }

  function teacherName(teacher) {
    if (!teacher) return "-";
    return `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || teacher.id;
  }

  function renderTeacherSalaryStatus() {
    const root = app.$("#teacherSalaryStatus");
    if (!root) return;
    const teachers = storage.getData(storage.KEYS.teachers, []).filter((t) => t.status === "Aktif" && Number(t.monthlySalary || 0) > 0);
    const salaries = allSalaries();

    if (!teachers.length) {
      root.innerHTML = `<p class="muted" style="padding:12px 0;">Aktif maaşlı öğretmen bulunamadı.</p>`;
      return;
    }

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const cards = teachers.map((teacher) => {
      const ts = salaries.filter((s) => s.teacherId === teacher.id && s.status !== "İptal");

      const currentSalary = ts.find((s) => s.period === currentPeriod);

      const unpaid = ts
        .filter((s) => s.status !== "Ödendi" && Number(s.remainingAmount || 0) > 0)
        .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
      const nextUnpaid = unpaid[0] || null;

      const totalOutstanding = ts.reduce((sum, s) => sum + Number(s.remainingAmount || 0), 0);

      let currentMonthHtml;
      if (currentSalary) {
        currentMonthHtml = app.statusBadge(currentSalary.status);
      } else {
        currentMonthHtml = `<span class="badge Bekliyor">Bekliyor</span>`;
      }

      // If no unpaid record exists, project the next upcoming due date from the teacher's pay cycle
      let projectedNextDue = null;
      if (!nextUnpaid) {
        const rawStart = teacher.startDate || teacher.salaryEffectiveDate;
        if (rawStart) {
          const startDay = new Date(`${rawStart}T12:00:00`).getDate();
          const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const lastDayOfNext = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          const day = Math.min(startDay, lastDayOfNext);
          projectedNextDue = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }

      const dueDateISO = nextUnpaid ? nextUnpaid.dueDate : projectedNextDue;

      let dueDateHtml = "-";
      let daysHtml = "-";
      if (dueDateISO) {
        dueDateHtml = app.formatDate(dueDateISO);
        const days = engine?.daysFromToday(dueDateISO);
        if (days !== null) {
          if (days > 0) daysHtml = `<span class="muted">${days} gün kaldı</span>`;
          else if (days === 0) daysHtml = `<span class="badge warning">Bugün</span>`;
          else daysHtml = `<span class="badge danger">${Math.abs(days)} gün gecikti</span>`;
        }
      }

      const outstandingClass = totalOutstanding > 0 ? "tsc-outstanding danger" : "tsc-outstanding";

      return `
        <div class="teacher-salary-card card">
          <div class="tsc-header">
            <div class="tsc-name">
              <strong>${app.escapeHtml(teacherName(teacher))}</strong>
              <span class="chip">${app.formatCurrency(Number(teacher.monthlySalary || 0))}/ay</span>
            </div>
            <div>${currentMonthHtml}</div>
          </div>
          <div class="tsc-body">
            <div class="tsc-item">
              <span class="muted">Toplam borç</span>
              <strong class="${outstandingClass}">${app.formatCurrency(totalOutstanding)}</strong>
            </div>
            <div class="tsc-item">
              <span class="muted">Sıradaki vade</span>
              <strong>${dueDateHtml}</strong>
            </div>
            <div class="tsc-item">
              <span class="muted">Süre</span>
              <strong>${daysHtml}</strong>
            </div>
          </div>
        </div>
      `;
    });

    root.innerHTML = `<div class="teacher-salary-grid">${cards.join("")}</div>`;
  }

  function renderSalariesPage() {
    const root = app.$("#page-content");
    if (!root) return;
    if (engine) engine.runAll();
    const teachers = storage.getData(storage.KEYS.teachers, []);

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Öğretmen Maaşları</h2>
          <p>Aylık maaş yükümlülükleri otomatik oluşturulur ve takip edilir.</p>
        </div>
      </section>

      <section id="salaryStats" class="grid stats"></section>

      <div class="table-panel" style="margin-top: 18px;">
        <div class="table-header"><h3>Öğretmen Ödeme Durumları</h3></div>
        <div id="teacherSalaryStatus" style="padding: 12px 16px;"></div>
      </div>

      <section class="toolbar" style="margin-top: 18px;">
        <div class="filters">
          <input id="salarySearch" type="search" placeholder="Öğretmen ara" />
          <select id="salaryTeacherFilter">
            <option value="">Tüm öğretmenler</option>
            ${teachers.map((t) => `<option value="${t.id}">${app.escapeHtml(teacherName(t))}</option>`).join("")}
          </select>
          <select id="salaryStatusFilter">
            <option value="">Tüm durumlar</option>
            <option value="Bekliyor">Bekliyor</option>
            <option value="Kısmi ödendi">Kısmi ödendi</option>
            <option value="Gecikti">Gecikti</option>
            <option value="Ödendi">Ödendi</option>
          </select>
        </div>
      </section>

      <section class="table-panel">
        <div class="table-header">
          <h3>Maaş ödemeleri</h3>
          <span class="chip" id="salaryCount"></span>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Öğretmen</th>
                <th>Dönem</th>
                <th>Tutar</th>
                <th>Ödenen</th>
                <th>Kalan</th>
                <th>Vade</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody id="salariesTbody"></tbody>
          </table>
        </div>
      </section>
    `;

    ["#salarySearch", "#salaryTeacherFilter", "#salaryStatusFilter"].forEach((sel) => {
      app.$(sel).addEventListener("input", renderSalaryRows);
    });
    app.$("#salariesTbody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "pay") openSalaryPaymentForm(id);
      if (button.dataset.action === "transactions") openSalaryTransactions(id);
    });

    renderSalaryStats();
    renderTeacherSalaryStatus();
    renderSalaryRows();
  }

  function renderSalaryStats() {
    const root = app.$("#salaryStats");
    const salaries = allSalaries();
    const teachers = storage.getData(storage.KEYS.teachers, []).filter((t) => t.status === "Aktif");
    const totalDue = salaries.filter((s) => s.status !== "İptal").reduce((sum, s) => sum + Number(s.remainingAmount || 0), 0);
    const paid = salaries.reduce((sum, s) => sum + Number(s.paidAmount || 0), 0);
    const overdue = salaries.filter((s) => s.status === "Gecikti");
    const monthlyObligation = teachers.reduce((sum, t) => sum + Number(t.monthlySalary || 0), 0);

    root.innerHTML = `
      <section class="card stat-card"><div class="label"><span>Aylık toplam yük</span><span class="chip">Aylık</span></div><strong>${app.formatCurrency(monthlyObligation)}</strong><small>Aktif öğretmenlerin toplam maaşı</small></section>
      <section class="card stat-card"><div class="label"><span>Ödenecek toplam</span><span class="chip">Bakiye</span></div><strong>${app.formatCurrency(totalDue)}</strong><small>İptal olmayan açık maaşlar</small></section>
      <section class="card stat-card"><div class="label"><span>Toplam ödenmiş</span><span class="chip">Geçmiş</span></div><strong>${app.formatCurrency(paid)}</strong><small>Tüm dönemler</small></section>
      <section class="card stat-card"><div class="label"><span>Geciken maaş</span><span class="chip">Risk</span></div><strong>${overdue.length}</strong><small>${app.formatCurrency(overdue.reduce((s, i) => s + Number(i.remainingAmount || 0), 0))}</small></section>
    `;
  }

  function filteredSalaries() {
    const search = (app.$("#salarySearch")?.value || "").toLocaleLowerCase("tr-TR");
    const teacherFilter = app.$("#salaryTeacherFilter")?.value || "";
    const statusFilter = app.$("#salaryStatusFilter")?.value || "";
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));

    return allSalaries()
      .filter((salary) => {
        const teacher = teacherMap.get(salary.teacherId);
        const haystack = teacherName(teacher).toLocaleLowerCase("tr-TR");
        return (!search || haystack.includes(search)) && (!teacherFilter || salary.teacherId === teacherFilter) && (!statusFilter || salary.status === statusFilter);
      })
      .sort((a, b) => String(b.period || "").localeCompare(String(a.period || "")));
  }

  function renderSalaryRows() {
    const tbody = app.$("#salariesTbody");
    if (!tbody) return;
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const salaries = filteredSalaries();
    app.$("#salaryCount").textContent = `${salaries.length} kayıt`;
    const canEdit = app.access.canEdit("salaries");

    tbody.innerHTML = salaries.length
      ? salaries
          .map((salary) => {
            const teacher = teacherMap.get(salary.teacherId);
            const daysRemaining = engine?.daysFromToday(salary.dueDate);
            let dueLabel = app.formatDate(salary.dueDate);
            if (salary.status !== "Ödendi" && daysRemaining !== null) {
              if (daysRemaining > 0) dueLabel += `<br /><small class="muted">${daysRemaining} gün kaldı</small>`;
              else if (daysRemaining === 0) dueLabel += `<br /><small class="badge warning">Bugün</small>`;
              else dueLabel += `<br /><small class="badge danger">${Math.abs(daysRemaining)} gün gecikti</small>`;
            }
            return `
              <tr>
                <td>
                  <strong>${app.escapeHtml(teacherName(teacher))}</strong>
                  <br /><small class="muted">${app.escapeHtml(teacher?.phone || "-")}</small>
                </td>
                <td><strong>${app.escapeHtml(salary.period || "-")}</strong><br /><small class="muted">${app.escapeHtml(salary.description || "")}</small></td>
                <td>${app.formatCurrency(salary.totalAmount)}</td>
                <td>${app.formatCurrency(salary.paidAmount)}</td>
                <td><strong>${app.formatCurrency(salary.remainingAmount)}</strong></td>
                <td>${dueLabel}</td>
                <td>${app.statusBadge(salary.status)}</td>
                <td>
                  <div class="actions">
                    ${canEdit ? `<button class="btn btn-primary" data-action="pay" data-id="${salary.id}">Ödeme gir</button>` : ""}
                    <button class="btn" data-action="transactions" data-id="${salary.id}">Tahsilatlar (${(salary.transactions || []).length})</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="8">${app.emptyState("Filtrelere uygun maaş kaydı bulunamadı.")}</td></tr>`;
  }

  function applySalaryUpdate(salaryId, mutator) {
    const next = allSalaries().map((salary) => {
      if (salary.id !== salaryId) return salary;
      const draft = { ...salary, transactions: (salary.transactions || []).slice() };
      const updated = mutator(draft);
      const paidAmount = (updated.transactions || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
      return engine.normalizeSalary({ ...updated, paidAmount });
    });
    storage.setData(storage.KEYS.teacherSalaries, next);
  }

  function openSalaryPaymentForm(salaryId) {
    const salary = allSalaries().find((item) => item.id === salaryId);
    if (!salary) return;
    if (salary.status === "Ödendi" || salary.status === "İptal") {
      app.toast("Bu maaş kaydına tahsilat girilemez.", "error");
      return;
    }

    app.openModal("Maaş ödemesi", `
      <form id="salaryPayForm" class="form-card">
        <div class="detail-grid">
          <div class="detail-item"><span>Kalan tutar</span><strong>${app.formatCurrency(salary.remainingAmount)}</strong></div>
          <div class="detail-item"><span>Vade</span><strong>${app.formatDate(salary.dueDate)}</strong></div>
        </div>
        <div class="form-grid">
          <label>Tutar<input name="amount" type="number" min="1" max="${Number(salary.remainingAmount || 0)}" value="${Number(salary.remainingAmount || 0)}" required /></label>
          <label>Yöntem
            <select name="method">${paymentMethods.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>
          </label>
          <label>Tarih<input name="date" type="date" value="${storage.todayISO()}" required /></label>
          <label>Not<input name="note" placeholder="Açıklama" /></label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Kaydet</button>
        </div>
      </form>
    `, { size: "small" });

    app.$("#salaryPayForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const amount = Number(data.get("amount") || 0);
      if (amount <= 0 || amount > Number(salary.remainingAmount || 0)) {
        app.toast("Tutar geçersiz.", "error");
        return;
      }
      applySalaryUpdate(salaryId, (item) => {
        item.transactions.push({
          amount,
          method: String(data.get("method") || "Diğer"),
          date: String(data.get("date") || storage.todayISO()),
          note: String(data.get("note") || "").trim()
        });
        return item;
      });
      app.closeModal();
      renderSalariesPage();
      app.toast("Maaş ödemesi kaydedildi.", "success");
      const _t = storage.getData(storage.KEYS.teachers, []).find(t => t.id === salary.teacherId);
      const _tNote = String(data.get("note") || "").trim();
      window.CaYaAudit?.log("salaries", "payment", `Maaş ödemesi kaydedildi: ${_t ? `${_t.firstName} ${_t.lastName}` : salary.teacherId} | Dönem: ${salary.period} | Tutar: ${app.formatCurrency(amount)} | Yöntem: ${String(data.get("method") || "Diğer")} | Tarih: ${app.formatDate(String(data.get("date") || storage.todayISO()))}${_tNote ? " | Not: " + _tNote : ""}`);
    });
  }

  function openSalaryTransactions(salaryId) {
    const salary = allSalaries().find((item) => item.id === salaryId);
    if (!salary) return;
    const transactions = (salary.transactions || []).map((t, i) => ({ ...t, _index: i }));

    app.openModal("Maaş tahsilat geçmişi", `
      <div class="detail-grid">
        <div class="detail-item"><span>Toplam</span><strong>${app.formatCurrency(salary.totalAmount)}</strong></div>
        <div class="detail-item"><span>Ödenen</span><strong>${app.formatCurrency(salary.paidAmount)}</strong></div>
        <div class="detail-item"><span>Kalan</span><strong>${app.formatCurrency(salary.remainingAmount)}</strong></div>
        <div class="detail-item"><span>Durum</span><strong>${app.statusBadge(salary.status)}</strong></div>
      </div>

      <h3 style="margin-top: 16px;">Tahsilat hareketleri</h3>
      <div id="salaryTxList">
        ${
          transactions.length
            ? `<div class="table-scroll"><table>
                <thead><tr><th>Tarih</th><th>Yöntem</th><th>Tutar</th><th>Not</th>${app.access.canEdit("salaries") ? "<th>İşlem</th>" : ""}</tr></thead>
                <tbody>
                  ${transactions.map((t) => `
                    <tr>
                      <td>${app.formatDate(t.date)}</td>
                      <td>${app.escapeHtml(t.method || "-")}</td>
                      <td>${app.formatCurrency(t.amount)}</td>
                      <td>${app.escapeHtml(t.note || "-")}</td>
                      ${app.access.canEdit("salaries") ? `<td><button class="btn btn-warning" type="button" data-delete-tx="${t._index}">Sil</button></td>` : ""}
                    </tr>
                  `).join("")}
                </tbody>
              </table></div>`
            : app.emptyState("Henüz tahsilat yok.")
        }
      </div>
      <div class="form-actions" style="margin-top: 14px;">
        <button type="button" class="btn" data-modal-close>Kapat</button>
      </div>
    `);

    app.$("#salaryTxList").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-delete-tx]");
      if (!button) return;
      const index = Number(button.dataset.deleteTx);
      const current = allSalaries().find((item) => item.id === salaryId);
      const tx = (current?.transactions || [])[index];
      if (!tx) return;
      if (!confirm(`${app.formatCurrency(tx.amount)} tutarındaki tahsilat silinsin mi?`)) return;
      applySalaryUpdate(salaryId, (item) => {
        item.transactions.splice(index, 1);
        return item;
      });
      openSalaryTransactions(salaryId);
      renderSalaryStats();
      renderSalaryRows();
      app.toast("Tahsilat silindi.", "success");
      const _tDel = storage.getData(storage.KEYS.teachers, []).find(t => t.id === salary.teacherId);
      const _tDelName = _tDel ? `${_tDel.firstName} ${_tDel.lastName}` : salary.teacherId;
      window.CaYaAudit?.log("salaries", "delete", `Maaş tahsilatı silindi: ${_tDelName} | Dönem: ${salary.period} | Tutar: ${app.formatCurrency(tx.amount)} | Yöntem: ${tx.method || "-"} | Tarih: ${app.formatDate(tx.date)}`);
    });
  }

  app.registerPage("salaries", renderSalariesPage);
})();
