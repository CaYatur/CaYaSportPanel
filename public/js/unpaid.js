(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;
  const appUrl = window.CaYaAppUrl || ((value) => String(value || "").replace(/^\/+/, ""));
  const paymentMethods = ["Nakit", "Kredi kartı", "Havale/EFT", "Online ödeme", "Diğer"];

  function unpaidPayments() {
    const today = storage.todayISO();
    return storage
      .normalizePayments(storage.getData(storage.KEYS.payments, []))
      .filter((payment) => payment.status !== "İptal" && Number(payment.remainingAmount || 0) > 0)
      .map((payment) => ({
        ...payment,
        overdueDays: payment.dueDate ? app.daysBetween(payment.dueDate, today) : 0
      }))
      .sort((a, b) => b.overdueDays - a.overdueDays);
  }

  function studentSummary(studentId) {
    const payments = unpaidPayments().filter((payment) => payment.studentId === studentId);
    const totalRemaining = payments.reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);
    const overdueCount = payments.filter((payment) => payment.overdueDays > 0).length;
    return { payments, totalRemaining, overdueCount };
  }

  function programGroupsForDate(date) {
    const day = app.getTodayName(date || storage.todayISO());
    return storage.getData(storage.KEYS.groups, []).filter((group) => group.status === "Aktif" && app.groupDays(group).includes(day));
  }

  function groupTimeLabel(group, date) {
    const day = app.getTodayName(date || storage.todayISO());
    const sessions = app.groupSessionsForDay(group, day);
    return sessions.length
      ? sessions.map((session) => `${session.startTime || "?"}-${session.endTime || "?"}`).join(", ")
      : "Saat tanımsız";
  }

  function getGroupRoster(groupId) {
    const students = storage.getData(storage.KEYS.students, []);
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const enrollments = storage.getData(storage.KEYS.enrollments, []);
    const studentIds = enrollments
      .filter((enrollment) => enrollment.groupId === groupId && enrollment.status === "Aktif")
      .map((enrollment) => enrollment.studentId);

    return [...new Set(studentIds)]
      .map((id) => studentMap.get(id))
      .filter((student) => student && student.status === "Aktif")
      .sort((a, b) => app.getStudentName(a).localeCompare(app.getStudentName(b), "tr"));
  }

  function renderUnpaidPage() {
    const root = app.$("#page-content");
    if (!root) return;

    const branches = storage.getData(storage.KEYS.branches, []);
    const payments = unpaidPayments();
    const students = storage.getData(storage.KEYS.students, []);
    const studentMap = new Map(students.map((student) => [student.id, student]));

    const grouped = new Map();
    payments.forEach((payment) => {
      if (!grouped.has(payment.studentId)) grouped.set(payment.studentId, []);
      grouped.get(payment.studentId).push(payment);
    });

    const studentGroups = Array.from(grouped.entries()).map(([studentId, items]) => {
      const student = studentMap.get(studentId);
      const totalRemaining = items.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);
      const overdueCount = items.filter((item) => item.overdueDays > 0).length;
      return { studentId, student, items, totalRemaining, overdueCount };
    });

    const totalOutstanding = payments.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);
    const overduePayments = payments.filter((item) => item.overdueDays > 0);
    const overdueTotal = overduePayments.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0);

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Ödeme Yapmayan Öğrenciler</h2>
          <p>Borçlu ve gecikmiş ödemeler. Tek tıkla tahsilat girip listeyi güncel tutun.</p>
        </div>
        <a class="btn btn-primary" href="${appUrl("payments.html")}">Yeni ödeme planı</a>
      </section>

      <section class="grid stats">
        <section class="card stat-card">
          <div class="label"><span>Borçlu öğrenci</span><span class="chip">Toplam</span></div>
          <strong>${studentGroups.length}</strong>
          <small>Açık bakiyesi olan öğrenci sayısı</small>
        </section>
        <section class="card stat-card">
          <div class="label"><span>Açık bakiye</span><span class="chip">Bekliyor</span></div>
          <strong>${app.formatCurrency(totalOutstanding)}</strong>
          <small>Tüm geçerli planların toplam kalanı</small>
        </section>
        <section class="card stat-card">
          <div class="label"><span>Gecikmiş ödeme</span><span class="chip">Risk</span></div>
          <strong>${overduePayments.length}</strong>
          <small>${app.formatCurrency(overdueTotal)} tutar</small>
        </section>
      </section>

      <section class="toolbar" style="margin-top: 18px;">
        <div class="filters">
          <label>Tarih<input id="unpaidProgramDate" type="date" value="${storage.todayISO()}" /></label>
          <label>Grup
            <select id="unpaidProgramGroup">
              <option value="">Grup seçiniz</option>
            </select>
          </label>
        </div>
      </section>

      <section class="grid two">
        <div class="table-panel">
          <div class="table-header">
            <h3>Seçili gün grupları</h3>
            <span class="chip" id="unpaidTodayGroupCount"></span>
          </div>
          <div id="unpaidTodayGroups" class="compact-list" style="padding: 16px;"></div>
        </div>

        <div class="table-panel">
          <div class="table-header">
            <h3>Programdaki borç durumu</h3>
            <span class="chip" id="unpaidProgramRosterCount">0 öğrenci</span>
          </div>
          <div id="unpaidProgramRoster" class="grid" style="padding: 16px;"></div>
        </div>
      </section>

      <section class="toolbar" style="margin-top: 18px;">
        <div class="filters">
          <input id="unpaidSearch" type="search" placeholder="Öğrenci adı veya telefon ara" />
          <select id="unpaidBranchFilter">
            <option value="">Tüm branşlar</option>
            ${branches.map((branch) => `<option value="${branch.id}">${app.escapeHtml(branch.name)}</option>`).join("")}
          </select>
          <select id="unpaidOverdueFilter">
            <option value="">Tümü</option>
            <option value="overdue">Sadece gecikmişler</option>
            <option value="pending">Sadece bekleyenler</option>
          </select>
        </div>
      </section>

      <section class="table-panel">
        <div class="table-header">
          <h3>Borçlu öğrenciler</h3>
          <span class="chip" id="unpaidCount">${studentGroups.length} öğrenci</span>
        </div>
        <div id="unpaidGroups" style="padding: 16px;"></div>
      </section>
    `;

    app.$("#unpaidProgramDate").addEventListener("input", () => {
      renderUnpaidProgramGroups();
      renderUnpaidProgramRoster();
    });
    app.$("#unpaidProgramGroup").addEventListener("input", renderUnpaidProgramRoster);
    app.$("#unpaidTodayGroups").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-group-id]");
      if (!button) return;
      app.$("#unpaidProgramGroup").value = button.dataset.groupId;
      renderUnpaidProgramRoster();
    });
    app.$("#unpaidProgramRoster").addEventListener("click", handleAction);
    ["#unpaidSearch", "#unpaidBranchFilter", "#unpaidOverdueFilter"].forEach((sel) => {
      app.$(sel).addEventListener("input", renderUnpaidGroups);
    });
    app.$("#unpaidGroups").addEventListener("click", handleAction);

    renderUnpaidProgramGroups();
    renderUnpaidProgramRoster();
    renderUnpaidGroups();
  }

  function renderUnpaidProgramGroups() {
    const date = app.$("#unpaidProgramDate")?.value || storage.todayISO();
    const day = app.getTodayName(date);
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = programGroupsForDate(date);
    const groupSelect = app.$("#unpaidProgramGroup");
    const root = app.$("#unpaidTodayGroups");
    if (!groupSelect || !root) return;

    const previousGroup = groupSelect.value;
    groupSelect.innerHTML = `
      <option value="">Grup seçiniz</option>
      ${groups.map((group) => `<option value="${group.id}">${app.escapeHtml(group.name)}</option>`).join("")}
    `;
    if (groups.some((group) => group.id === previousGroup)) groupSelect.value = previousGroup;

    root.innerHTML = groups.length
      ? groups
          .map((group) => {
            const branchName = app.getBranchName(branches, group.branchId);
            const timeLabel = groupTimeLabel(group, date);
            return `
              <div class="list-item">
                <div>
                  <strong>${app.escapeHtml(group.name)}</strong>
                  <small>${app.escapeHtml(branchName)} · ${app.escapeHtml(timeLabel)} · ${app.getGroupStudentCount(group.id)} öğrenci</small>
                </div>
                <button type="button" class="btn" data-group-id="${group.id}">Seç</button>
              </div>
            `;
          })
          .join("")
      : app.emptyState(`${day} günü aktif ders bulunamadı.`);

    app.$("#unpaidTodayGroupCount").textContent = `${groups.length} grup`;
  }

  function renderUnpaidProgramRoster() {
    const groupId = app.$("#unpaidProgramGroup")?.value || "";
    const root = app.$("#unpaidProgramRoster");
    const count = app.$("#unpaidProgramRosterCount");
    if (!root || !count) return;

    if (!groupId) {
      root.innerHTML = app.emptyState("Borç durumunu görmek için grup seçiniz.");
      count.textContent = "0 öğrenci";
      return;
    }

    const roster = getGroupRoster(groupId);
    const unpaidByStudent = new Map();
    unpaidPayments().forEach((payment) => {
      if (!unpaidByStudent.has(payment.studentId)) unpaidByStudent.set(payment.studentId, []);
      unpaidByStudent.get(payment.studentId).push(payment);
    });

    const debtorCount = roster.filter((student) => (unpaidByStudent.get(student.id) || []).length > 0).length;
    count.textContent = `${roster.length} öğrenci · ${debtorCount} borçlu`;
    root.innerHTML = roster.length
      ? roster
          .map((student) => {
            const items = unpaidByStudent.get(student.id) || [];
            const totalRemaining = items.reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);
            const overdueCount = items.filter((payment) => payment.overdueDays > 0).length;
            const nextPayment = items.slice().sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")))[0] || null;
            const detail = nextPayment
              ? `${items.length} ödeme · ${overdueCount} gecikme · ${app.formatDate(nextPayment.dueDate)}`
              : "Açık borç yok";
            return `
              <div class="attendance-card">
                <div class="attendance-card-top">
                  ${app.studentAvatar(student)}
                  <div class="attendance-card-info">
                    <strong>${app.escapeHtml(app.getStudentName(student))}</strong>
                    <small class="muted">${app.escapeHtml(student.phone || "-")} · ${app.escapeHtml(detail)}</small>
                  </div>
                  <div class="status-chips">
                    <span class="chip">${app.formatCurrency(totalRemaining)}</span>
                    ${nextPayment ? app.statusBadge(overdueCount ? "Gecikti" : "Bekliyor") : app.statusBadge("Güncel")}
                  </div>
                </div>
                <div class="actions">
                  <button class="btn btn-ghost" data-action="detail" data-student="${student.id}">Öğrenci detayı</button>
                  ${nextPayment ? `<button class="btn btn-primary" data-action="pay" data-id="${nextPayment.id}">Ödeme al</button>` : ""}
                  ${nextPayment ? `<button class="btn" data-action="paid-full" data-id="${nextPayment.id}">Tamamen ödendi</button>` : ""}
                </div>
              </div>
            `;
          })
          .join("")
      : app.emptyState("Bu gruba aktif öğrenci kayıtlı değil.");
    app.hydrateStudentPhotos(root);
  }

  function renderUnpaidGroups() {
    const root = app.$("#unpaidGroups");
    if (!root) return;
    const branches = storage.getData(storage.KEYS.branches, []);
    const students = storage.getData(storage.KEYS.students, []);
    const studentMap = new Map(students.map((student) => [student.id, student]));

    const search = (app.$("#unpaidSearch")?.value || "").toLocaleLowerCase("tr-TR");
    const branchFilter = app.$("#unpaidBranchFilter")?.value || "";
    const overdueFilter = app.$("#unpaidOverdueFilter")?.value || "";

    const payments = unpaidPayments().filter((payment) => {
      if (branchFilter && payment.branchId !== branchFilter) return false;
      if (overdueFilter === "overdue" && payment.overdueDays <= 0) return false;
      if (overdueFilter === "pending" && payment.overdueDays > 0) return false;
      return true;
    });

    const grouped = new Map();
    payments.forEach((payment) => {
      if (!grouped.has(payment.studentId)) grouped.set(payment.studentId, []);
      grouped.get(payment.studentId).push(payment);
    });

    let entries = Array.from(grouped.entries()).map(([studentId, items]) => ({
      studentId,
      student: studentMap.get(studentId),
      items,
      totalRemaining: items.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0),
      overdueCount: items.filter((item) => item.overdueDays > 0).length
    }));

    if (search) {
      entries = entries.filter(({ student }) => {
        const haystack = [
          app.getStudentName(student),
          student?.phone,
          student?.guardianName,
          student?.guardianPhone,
          student?.email
        ]
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        return haystack.includes(search);
      });
    }

    entries.sort((a, b) => b.totalRemaining - a.totalRemaining);
    app.$("#unpaidCount").textContent = `${entries.length} öğrenci`;

    if (!entries.length) {
      root.innerHTML = app.emptyState("Borçlu öğrenci bulunmuyor. Tüm ödemeler güncel.");
      return;
    }

    root.innerHTML = entries
      .map(({ student, items, totalRemaining, overdueCount, studentId }) => {
        const name = app.getStudentName(student);
        const phone = student?.phone || "-";
        const guardian = student?.guardianName ? `${student.guardianName} (${student.guardianPhone || "-"})` : "";
        return `
          <article class="card" style="margin-bottom: 14px;">
            <div class="toolbar" style="justify-content: space-between;">
              <div>
                <strong style="font-size: 1.05rem;">${app.escapeHtml(name)}</strong>
                <br />
                <small class="muted">${app.escapeHtml(phone)}${guardian ? " · " + app.escapeHtml(guardian) : ""}</small>
              </div>
              <div style="text-align: right;">
                <strong style="font-size: 1.05rem; color: var(--danger);">${app.formatCurrency(totalRemaining)}</strong>
                <br />
                <small class="muted">${items.length} ödeme · ${overdueCount} gecikme</small>
              </div>
            </div>
            <div class="table-scroll" style="margin-top: 10px;">
              <table>
                <thead>
                  <tr>
                    <th>Branş</th>
                    <th>Açıklama</th>
                    <th>Toplam</th>
                    <th>Ödenen</th>
                    <th>Kalan</th>
                    <th>Son ödeme</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  ${items
                    .map((payment) => {
                      const branchName = app.getBranchName(branches, payment.branchId);
                      const overdueLabel = payment.overdueDays > 0
                        ? `<small class="muted">${payment.overdueDays} gün gecikmiş</small>`
                        : "";
                      return `
                        <tr>
                          <td>${app.escapeHtml(branchName)}</td>
                          <td>${app.escapeHtml(payment.description || "-")}</td>
                          <td>${app.formatCurrency(payment.totalAmount)}</td>
                          <td>${app.formatCurrency(payment.paidAmount)}</td>
                          <td><strong>${app.formatCurrency(payment.remainingAmount)}</strong></td>
                          <td>${app.formatDate(payment.dueDate)}<br />${overdueLabel}</td>
                          <td>${app.statusBadge(payment.status)}</td>
                          <td>
                            <div class="actions">
                              <button class="btn btn-primary" data-action="pay" data-id="${payment.id}">Ödeme al</button>
                              <button class="btn" data-action="paid-full" data-id="${payment.id}">Tamamen ödendi</button>
                            </div>
                          </td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
            <div class="actions" style="margin-top: 10px;">
              <button class="btn btn-ghost" data-action="detail" data-student="${studentId}">Öğrenci detayı</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function handleAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const paymentId = button.dataset.id;
    const studentId = button.dataset.student;

    if (action === "pay") openCollectForm(paymentId);
    if (action === "paid-full") markFullyPaid(paymentId);
    if (action === "detail" && studentId) {
      window.location.assign(appUrl(`students.html#${studentId}`));
    }
  }

  function collectFormHtml(payment) {
    return `
      <form id="collectPaymentForm" class="form-card">
        <div class="detail-grid">
          <div class="detail-item"><span>Kalan tutar</span><strong>${app.formatCurrency(payment.remainingAmount)}</strong></div>
          <div class="detail-item"><span>Durum</span><strong>${app.statusBadge(payment.status)}</strong></div>
        </div>
        <div class="form-grid">
          <label>Tutar<input name="amount" type="number" min="1" max="${Number(payment.remainingAmount || 0)}" value="${Number(payment.remainingAmount || 0)}" required /></label>
          <label>Yöntem
            <select name="method">${paymentMethods.map((method) => `<option value="${method}">${method}</option>`).join("")}</select>
          </label>
          <label>İşlem tarihi<input name="date" type="date" value="${storage.todayISO()}" required /></label>
          <label>Not<input name="note" placeholder="Tahsilat notu" /></label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Tahsilatı kaydet</button>
        </div>
      </form>
    `;
  }

  function openCollectForm(paymentId) {
    const payments = storage.normalizePayments(storage.getData(storage.KEYS.payments, []));
    const payment = payments.find((item) => item.id === paymentId);
    if (!payment) return;
    if (payment.status === "Ödendi" || payment.status === "İptal") {
      app.toast("Bu ödeme planına tahsilat girilemez.", "error");
      return;
    }
    app.openModal("Ödeme gir", collectFormHtml(payment), { size: "small" });

    app.$("#collectPaymentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const amount = Number(data.get("amount") || 0);
      if (amount <= 0 || amount > Number(payment.remainingAmount || 0)) {
        app.toast("Tahsilat tutarı kalan borçtan büyük olamaz.", "error");
        return;
      }

      applyPayment(paymentId, {
        amount,
        method: String(data.get("method") || "Diğer"),
        date: String(data.get("date") || storage.todayISO()),
        note: String(data.get("note") || "").trim()
      });
      app.closeModal();
      app.toast("Tahsilat kaydedildi.", "success");
    });
  }

  function markFullyPaid(paymentId) {
    const payments = storage.normalizePayments(storage.getData(storage.KEYS.payments, []));
    const payment = payments.find((item) => item.id === paymentId);
    if (!payment) return;
    if (!confirm(`${app.formatCurrency(payment.remainingAmount)} tutarındaki kalan borç tamamen ödendi olarak işaretlensin mi?`)) return;

    applyPayment(paymentId, {
      amount: Number(payment.remainingAmount || 0),
      method: "Nakit",
      date: storage.todayISO(),
      note: "Borçlu listesinden tamamen ödendi olarak işaretlendi"
    });
    app.toast("Ödeme tamamlandı.", "success");
  }

  function applyPayment(paymentId, transaction) {
    const next = storage.normalizePayments(storage.getData(storage.KEYS.payments, [])).map((item) => {
      if (item.id !== paymentId) return item;
      const updated = {
        ...item,
        paidAmount: Number(item.paidAmount || 0) + Number(transaction.amount || 0),
        transactions: [...(item.transactions || []), transaction]
      };
      return storage.normalizePayment(updated);
    });
    storage.setData(storage.KEYS.payments, next);
    renderUnpaidPage();
  }

  app.registerPage("unpaid", renderUnpaidPage);
})();
