(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;
  const notifications = window.CaYaNotifications;
  const paymentStatuses = ["Bekliyor", "Ödendi", "Kısmi ödendi", "Gecikti", "İptal"];
  const paymentMethods = ["Nakit", "Kredi kartı", "Havale/EFT", "Online ödeme", "Diğer"];

  function allPayments() {
    const normalized = storage.normalizePayments(storage.getData(storage.KEYS.payments, []));
    storage.setData(storage.KEYS.payments, normalized);
    return normalized;
  }

  // Kullanıcıya gösterilecek planlar: "silinmiş" olarak işaretlenenler hariç.
  // Otomatik planları diziden tamamen çıkarmak yerine deleted:true ile gizliyoruz;
  // böylece engine ilgili dönemi (enrollmentId_period) yeniden oluşturmaz.
  function visiblePayments() {
    return allPayments().filter((payment) => !payment.deleted);
  }

  function allActiveGroups() {
    return storage
      .getData(storage.KEYS.groups, [])
      .filter((group) => group.status === "Aktif")
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr"));
  }

  // Groups that have a session on the selected calendar day's weekday.
  function programGroupsForDate(date) {
    const day = app.getTodayName(date || storage.todayISO());
    return allActiveGroups().filter((group) => app.groupDays(group).includes(day));
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

  function openStudentPayments(studentId) {
    const filter = app.$("#paymentStudentFilter");
    if (!filter) return;
    filter.value = studentId;
    renderPaymentRows();
    app.$("#paymentsTbody")?.closest(".table-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function paymentStudentCardHtml(student) {
    if (!student) {
      return `
        <div class="student-picker-selection-card is-empty">
          <span class="muted">Henüz öğrenci seçilmedi.</span>
        </div>
      `;
    }

    return `
      <div class="student-picker-selection-card">
        <div class="student-line">
          ${app.studentAvatar(student)}
          <div>
            <strong>${app.escapeHtml(app.getStudentName(student))}</strong>
            <small>${app.escapeHtml(student.phone || student.email || "İletişim bilgisi yok")}</small>
          </div>
        </div>
      </div>
    `;
  }

  function renderPaymentsPage() {
    const root = app.$("#page-content");
    if (!root) return;
    if (window.CaYaEngine) window.CaYaEngine.runAll();
    const students = storage.getData(storage.KEYS.students, []);

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Ödeme Yönetimi</h2>
          <p>Aylık ödeme planları otomatik oluşturulur. Manuel plan da ekleyebilirsiniz.</p>
        </div>
        <button class="btn btn-primary" id="newPaymentButton">Manuel ödeme planı</button>
      </section>

      <section id="paymentStats" class="grid stats"></section>

      <section class="toolbar" style="margin-top: 18px;">
        <div class="filters">
          <label>Tarih<input id="paymentProgramDate" type="date" value="${storage.todayISO()}" /></label>
          <label>Grup listesi
            <select id="paymentGroupScope">
              <option value="all" selected>Tüm aktif gruplar</option>
              <option value="day">Sadece seçili gün</option>
            </select>
          </label>
          <label>Grup
            <select id="paymentProgramGroup">
              <option value="">Grup seçiniz</option>
            </select>
          </label>
        </div>
      </section>

      <section class="grid two">
        <div class="table-panel">
          <div class="table-header">
            <h3 id="paymentGroupsPanelTitle">Aktif gruplar</h3>
            <span class="chip" id="paymentTodayGroupCount"></span>
          </div>
          <div id="paymentTodayGroups" class="compact-list" style="padding: 16px;"></div>
        </div>

        <div class="table-panel">
          <div class="table-header">
            <h3>Programdaki öğrenciler</h3>
            <span class="chip" id="paymentProgramRosterCount">0 öğrenci</span>
          </div>
          <div id="paymentProgramRoster" class="grid" style="padding: 16px;"></div>
        </div>
      </section>

      <section class="toolbar" style="margin-top: 18px;">
        <div class="filters">
          <input id="paymentSearch" type="search" placeholder="Öğrenci veya açıklama ara" />
          <select id="paymentStudentFilter">
            <option value="">Tüm öğrenciler</option>
            ${students.map((student) => `<option value="${student.id}">${app.escapeHtml(app.getStudentName(student))}</option>`).join("")}
          </select>
          <select id="paymentStatusFilter">
            <option value="">Tüm durumlar</option>
            ${paymentStatuses.map((status) => `<option value="${status}">${status}</option>`).join("")}
          </select>
        </div>
      </section>

      <section class="grid two">
        <div class="table-panel">
          <div class="table-header">
            <h3>Ödeme planları</h3>
            <span class="chip" id="paymentCount"></span>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Dönem</th>
                  <th>Branş</th>
                  <th>Toplam</th>
                  <th>Kalan</th>
                  <th>Son ödeme</th>
                  <th>Kaynak</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody id="paymentsTbody"></tbody>
            </table>
          </div>
        </div>

        <div class="grid">
          <div class="table-panel">
            <div class="table-header">
              <h3>Ödeme uyarıları</h3>
              <span class="chip" id="notificationCount"></span>
            </div>
            <div id="paymentWarnings" class="compact-list" style="padding: 16px;"></div>
          </div>
          <div class="table-panel">
            <div class="table-header">
              <h3>Branş bazlı gelir</h3>
              <span class="chip">Tahsilat</span>
            </div>
            <div id="branchRevenueList" class="compact-list" style="padding: 16px;"></div>
          </div>
        </div>
      </section>
    `;

    app.$("#newPaymentButton").addEventListener("click", () => openPaymentPlanForm());
    app.$("#paymentProgramDate").addEventListener("input", () => {
      renderPaymentProgramGroups();
      renderPaymentProgramRoster();
    });
    app.$("#paymentGroupScope")?.addEventListener("input", () => {
      renderPaymentProgramGroups();
      renderPaymentProgramRoster();
    });
    app.$("#paymentProgramGroup").addEventListener("input", renderPaymentProgramRoster);
    app.$("#paymentTodayGroups").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-group-id]");
      if (!button) return;
      app.$("#paymentProgramGroup").value = button.dataset.groupId;
      renderPaymentProgramRoster();
    });
    app.$("#paymentProgramRoster").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-program-action]");
      if (!button) return;
      if (button.dataset.programAction === "filter-student") openStudentPayments(button.dataset.studentId);
      if (button.dataset.programAction === "collect") openCollectForm(button.dataset.paymentId);
    });
    ["#paymentSearch", "#paymentStudentFilter", "#paymentStatusFilter"].forEach((selector) => app.$(selector).addEventListener("input", renderPaymentRows));
    app.$("#paymentsTbody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "collect") openCollectForm(id);
      if (button.dataset.action === "transactions") openTransactionsModal(id);
      if (button.dataset.action === "whatsapp") openWhatsApp(id);
      if (button.dataset.action === "cancel") cancelPayment(id);
      if (button.dataset.action === "reopen") reopenPayment(id);
      if (button.dataset.action === "delete") deletePayment(id);
    });

    renderPaymentStats();
    renderPaymentProgramGroups();
    renderPaymentProgramRoster();
    renderPaymentRows();
    renderWarnings();
    renderBranchRevenue();
  }

  function renderPaymentProgramGroups() {
    const date = app.$("#paymentProgramDate")?.value || storage.todayISO();
    const day = app.getTodayName(date);
    const scope = app.$("#paymentGroupScope")?.value || "all";
    const branches = storage.getData(storage.KEYS.branches, []);
    const dayGroupIds = new Set(programGroupsForDate(date).map((group) => group.id));
    const groups = scope === "day" ? programGroupsForDate(date) : allActiveGroups();
    const groupSelect = app.$("#paymentProgramGroup");
    const root = app.$("#paymentTodayGroups");
    const title = app.$("#paymentGroupsPanelTitle");
    if (!groupSelect || !root) return;

    if (title) {
      title.textContent = scope === "day" ? `${day} grupları` : "Aktif gruplar";
    }

    const previousGroup = groupSelect.value;
    groupSelect.innerHTML = `
      <option value="">Grup seçiniz</option>
      ${groups
        .map((group) => {
          const branchName = app.getBranchName(branches, group.branchId);
          const onDay = dayGroupIds.has(group.id);
          const dayMark = scope === "all" && onDay ? ` · ${day}` : "";
          return `<option value="${group.id}">${app.escapeHtml(group.name)} (${app.escapeHtml(branchName)})${app.escapeHtml(dayMark)}</option>`;
        })
        .join("")}
    `;
    if (groups.some((group) => group.id === previousGroup)) groupSelect.value = previousGroup;

    root.innerHTML = groups.length
      ? groups
          .map((group) => {
            const branchName = app.getBranchName(branches, group.branchId);
            const onDay = dayGroupIds.has(group.id);
            const timeLabel = onDay ? groupTimeLabel(group, date) : "Bu gün seans yok";
            return `
              <div class="list-item">
                <div>
                  <strong>${app.escapeHtml(group.name)}</strong>
                  <small>${app.escapeHtml(branchName)} · ${app.escapeHtml(timeLabel)} · ${app.getGroupStudentCount(group.id)} öğrenci${onDay ? ` · ${app.escapeHtml(day)}` : ""}</small>
                </div>
                <button type="button" class="btn" data-group-id="${group.id}">Seç</button>
              </div>
            `;
          })
          .join("")
      : app.emptyState(scope === "day" ? `${day} günü aktif ders bulunamadı.` : "Aktif grup bulunamadı.");

    app.$("#paymentTodayGroupCount").textContent = `${groups.length} grup`;
  }

  function renderPaymentProgramRoster() {
    const groupId = app.$("#paymentProgramGroup")?.value || "";
    const root = app.$("#paymentProgramRoster");
    const count = app.$("#paymentProgramRosterCount");
    if (!root || !count) return;

    if (!groupId) {
      root.innerHTML = app.emptyState("Ödeme durumunu görmek için grup seçiniz.");
      count.textContent = "0 öğrenci";
      return;
    }

    const roster = getGroupRoster(groupId);
    const payments = visiblePayments();
    const activePaymentsByStudent = new Map();
    payments
      .filter((payment) => payment.status !== "İptal")
      .forEach((payment) => {
        if (!activePaymentsByStudent.has(payment.studentId)) activePaymentsByStudent.set(payment.studentId, []);
        activePaymentsByStudent.get(payment.studentId).push(payment);
      });

    count.textContent = `${roster.length} öğrenci`;
    root.innerHTML = roster.length
      ? roster
          .map((student) => {
            const items = activePaymentsByStudent.get(student.id) || [];
            const openItems = items
              .filter((payment) => Number(payment.remainingAmount || 0) > 0)
              .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
            const totalRemaining = openItems.reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);
            const nextPayment = openItems[0] || null;
            const nextLabel = nextPayment ? `${app.formatDate(nextPayment.dueDate)} · ${app.formatCurrency(nextPayment.remainingAmount)}` : "Açık borç yok";
            return `
              <div class="attendance-card">
                <div class="attendance-card-top">
                  ${app.studentAvatar(student)}
                  <div class="attendance-card-info">
                    <strong>${app.escapeHtml(app.getStudentName(student))}</strong>
                    <small class="muted">${app.escapeHtml(student.phone || "-")} · Sıradaki: ${app.escapeHtml(nextLabel)}</small>
                  </div>
                  <div class="status-chips">
                    <span class="chip">${app.formatCurrency(totalRemaining)}</span>
                    ${nextPayment ? app.statusBadge(nextPayment.status) : app.statusBadge("Güncel")}
                  </div>
                </div>
                <div class="actions">
                  <button type="button" class="btn" data-program-action="filter-student" data-student-id="${student.id}">Ödemeleri göster</button>
                  ${nextPayment && app.access.canEdit("payments") ? `<button type="button" class="btn btn-primary" data-program-action="collect" data-payment-id="${nextPayment.id}">Tahsilat gir</button>` : ""}
                </div>
              </div>
            `;
          })
          .join("")
      : app.emptyState("Bu gruba aktif öğrenci kayıtlı değil.");
    app.hydrateStudentPhotos(root);
  }

  function filteredPayments() {
    const students = storage.getData(storage.KEYS.students, []);
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const search = (app.$("#paymentSearch")?.value || "").toLocaleLowerCase("tr-TR");
    const studentId = app.$("#paymentStudentFilter")?.value || "";
    const status = app.$("#paymentStatusFilter")?.value || "";

    return visiblePayments().filter((payment) => {
      const student = studentMap.get(payment.studentId);
      const haystack = [app.getStudentName(student), payment.description].join(" ").toLocaleLowerCase("tr-TR");
      return (!search || haystack.includes(search)) && (!studentId || payment.studentId === studentId) && (!status || payment.status === status);
    });
  }

  function renderPaymentStats() {
    const root = app.$("#paymentStats");
    const payments = visiblePayments();
    const collected = payments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
    const remaining = payments.filter((payment) => payment.status !== "İptal").reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);
    const overdue = payments.filter((payment) => payment.status === "Gecikti");
    const monthly = payments.reduce((sum, payment) => {
      const now = new Date();
      return (
        sum +
        (payment.transactions || []).reduce((inner, transaction) => {
          const date = new Date(`${transaction.date}T12:00:00`);
          return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() ? inner + Number(transaction.amount || 0) : inner;
        }, 0)
      );
    }, 0);

    const pending = payments
      .filter((p) => p.status !== "İptal" && Number(p.remainingAmount || 0) > 0)
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
    const next = pending[0];
    let nextLabel = "Yok";
    let nextSmall = "Tüm ödemeler güncel";
    if (next && window.CaYaEngine) {
      const days = window.CaYaEngine.daysFromToday(next.dueDate);
      nextLabel = app.formatDate(next.dueDate);
      if (days > 0) nextSmall = `${days} gün kaldı`;
      else if (days === 0) nextSmall = "Bugün";
      else nextSmall = `${Math.abs(days)} gün gecikmiş`;
    }

    root.innerHTML = `
      <section class="card stat-card"><div class="label"><span>Toplam tahsilat</span><span class="chip">Gelir</span></div><strong>${app.formatCurrency(collected)}</strong><small>Tüm ödeme hareketleri</small></section>
      <section class="card stat-card"><div class="label"><span>Bu ay gelir</span><span class="chip">Aylık</span></div><strong>${app.formatCurrency(monthly)}</strong><small>İşlem tarihine göre</small></section>
      <section class="card stat-card"><div class="label"><span>Bekleyen toplam</span><span class="chip">Bakiye</span></div><strong>${app.formatCurrency(remaining)}</strong><small>İptal olmayan açık bakiye</small></section>
      <section class="card stat-card"><div class="label"><span>Sıradaki ödeme</span><span class="chip">Vade</span></div><strong>${nextLabel}</strong><small>${nextSmall}</small></section>
      <section class="card stat-card"><div class="label"><span>Geciken ödeme</span><span class="chip">Risk</span></div><strong>${overdue.length}</strong><small>${app.formatCurrency(overdue.reduce((sum, payment) => sum + payment.remainingAmount, 0))}</small></section>
    `;
  }

  function renderPaymentRows() {
    const tbody = app.$("#paymentsTbody");
    if (!tbody) return;
    const students = storage.getData(storage.KEYS.students, []);
    const branches = storage.getData(storage.KEYS.branches, []);
    const payments = filteredPayments();
    const canEdit = app.access.canEdit("payments");

    tbody.innerHTML = payments.length
      ? payments
          .map((payment) => {
            const student = students.find((item) => item.id === payment.studentId);
            const daysRemaining = window.CaYaEngine?.daysFromToday(payment.dueDate);
            let dueLabel = app.formatDate(payment.dueDate);
            if (payment.status !== "Ödendi" && payment.status !== "İptal" && daysRemaining !== null) {
              if (daysRemaining > 0) dueLabel += `<br /><small class="muted">${daysRemaining} gün kaldı</small>`;
              else if (daysRemaining === 0) dueLabel += `<br /><small class="badge warning">Bugün</small>`;
              else dueLabel += `<br /><small class="badge danger">${Math.abs(daysRemaining)} gün gecikti</small>`;
            }
            const period = payment.period
              ? `<strong>${app.escapeHtml(payment.period)}</strong>`
              : '<small class="muted">Manuel</small>';
            const source = payment.autoGenerated
              ? (payment.feeSource === "custom" ? '<span class="chip">Özel ücret</span>' : '<span class="chip">Otomatik</span>')
              : '<span class="chip">Manuel</span>';
            return `
              <tr>
                <td>
                  <strong>${app.escapeHtml(app.getStudentName(student))}</strong>
                  <br /><small class="muted">${app.escapeHtml(student ? student.phone || "-" : "-")}</small>
                </td>
                <td>${period}<br /><small class="muted">${app.escapeHtml(payment.description || "")}</small></td>
                <td>${app.escapeHtml(app.getBranchName(branches, payment.branchId))}</td>
                <td>${app.formatCurrency(payment.totalAmount)}<br /><small class="muted">Ödenen: ${app.formatCurrency(payment.paidAmount)}</small></td>
                <td><strong>${app.formatCurrency(payment.remainingAmount)}</strong></td>
                <td>${dueLabel}</td>
                <td>${source}</td>
                <td>${app.statusBadge(payment.status)}</td>
                <td>
                  <div class="actions">
                    ${payment.status === "İptal" ? `
                      ${canEdit ? `<button class="btn btn-primary" data-action="reopen" data-id="${payment.id}">Yeniden Aç</button>` : ""}
                      <button class="btn" data-action="transactions" data-id="${payment.id}">Tahsilatlar (${(payment.transactions || []).length})</button>
                      ${canEdit ? `<button class="btn btn-warning" data-action="delete" data-id="${payment.id}">Sil</button>` : ""}
                    ` : `
                      ${canEdit ? `<button class="btn btn-primary" data-action="collect" data-id="${payment.id}">Ödeme gir</button>` : ""}
                      <button class="btn" data-action="transactions" data-id="${payment.id}">Tahsilatlar (${(payment.transactions || []).length})</button>
                      <button class="btn" data-action="whatsapp" data-id="${payment.id}">WhatsApp</button>
                      ${canEdit ? `<button class="btn btn-ghost" data-action="cancel" data-id="${payment.id}">İptal</button>` : ""}
                    `}
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="9">${app.emptyState("Filtrelere uygun ödeme planı bulunamadı.")}</td></tr>`;

    app.$("#paymentCount").textContent = `${payments.length} kayıt`;
  }

  function renderWarnings() {
    const items = notifications.generatePaymentNotifications();
    const root = app.$("#paymentWarnings");
    root.innerHTML = items.length
      ? items
          .map((item) => `
            <div class="list-item">
              <div>
                <strong>${app.escapeHtml(item.studentName)}</strong>
                <small>${app.escapeHtml(item.branchName)} · ${app.formatDate(item.dueDate)} · ${app.formatCurrency(item.remainingAmount)}</small>
              </div>
              ${app.statusBadge(item.title)}
            </div>
          `)
          .join("")
      : app.emptyState("Ödeme uyarısı bulunmuyor.");
    app.$("#notificationCount").textContent = `${items.length} uyarı`;
  }

  function renderBranchRevenue() {
    const branches = storage.getData(storage.KEYS.branches, []);
    const payments = visiblePayments();
    const root = app.$("#branchRevenueList");
    const data = branches
      .map((branch) => ({
        branch,
        revenue: payments.filter((payment) => payment.branchId === branch.id && payment.status !== "İptal").reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0)
      }))
      .filter((item) => item.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    root.innerHTML = data.length
      ? data
          .map((item) => `
            <div class="list-item">
              <div>
                <strong>${app.escapeHtml(item.branch.name)}</strong>
                <small>Tahsil edilen gelir</small>
              </div>
              <span class="chip">${app.formatCurrency(item.revenue)}</span>
            </div>
          `)
          .join("")
      : app.emptyState("Henüz branş geliri yok.");
  }

  function paymentPlanFormHtml() {
    const students = storage.getData(storage.KEYS.students, []).filter((student) => student.status !== "Pasif" && student.status !== "Ayrıldı");
    const branches = storage.getData(storage.KEYS.branches, []).filter((branch) => branch.status === "Aktif");
    const enrollments = storage.getData(storage.KEYS.enrollments, []);
    const branchNameMap = new Map(branches.map((b) => [b.id, b.name]));

    return `
      <form id="paymentPlanForm" class="form-card">
        <div class="form-grid">
          <label class="span-2">Öğrenci
            <input type="hidden" name="studentId" id="paymentStudent" />
            <div class="student-picker-field">
              <button type="button" class="btn" id="paymentStudentPickerButton">Listeden öğrenci seç</button>
              <div id="paymentStudentSelection" class="student-picker-selection"></div>
            </div>
          </label>
          <label>Branş
            <select name="branchId" id="paymentBranch" required>
              <option value="">Seçiniz</option>
              ${branches.map((branch) => `<option value="${branch.id}" data-fee="${Number(branch.monthlyFee || 0)}">${app.escapeHtml(branch.name)} (${app.formatCurrency(branch.monthlyFee || 0)})</option>`).join("")}
            </select>
          </label>
          <label>Üyelik kaydı
            <select name="enrollmentId" id="paymentEnrollment">
              <option value="">Bağımsız ödeme planı</option>
              ${enrollments.map((enrollment) => {
                const customFee = enrollment.customFee !== undefined && enrollment.customFee !== null && enrollment.customFee !== "" ? Number(enrollment.customFee) : "";
                const label = `${branchNameMap.get(enrollment.branchId) || "Branş"} - ${enrollment.id}`;
                return `<option value="${enrollment.id}" data-student="${enrollment.studentId}" data-branch="${enrollment.branchId}" data-custom-fee="${customFee}">${app.escapeHtml(label)}</option>`;
              }).join("")}
            </select>
          </label>
          <label>Toplam tutar<input name="totalAmount" id="paymentTotal" type="number" min="0" step="1" required /></label>
          <label>Ödenen tutar<input name="paidAmount" type="number" min="0" step="1" /></label>
          <label>Son ödeme tarihi<input name="dueDate" type="date" required value="${storage.todayISO()}" /></label>
          <label class="span-2">Açıklama<input name="description" placeholder="Ödeme açıklaması (örn: Mayıs 2026 aylık ücret)" /></label>
          <div class="span-2"><small class="muted" id="paymentFeeHint">Öğrenci ve branş seçildiğinde önerilen ücret otomatik gelir.</small></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Plan oluştur</button>
        </div>
      </form>
    `;
  }

  function applySuggestedFee() {
    const studentId = app.$("#paymentStudent").value;
    const branchId = app.$("#paymentBranch").value;
    const totalInput = app.$("#paymentTotal");
    const hint = app.$("#paymentFeeHint");
    if (!studentId || !branchId) return;

    const enrollments = storage.getData(storage.KEYS.enrollments, []);
    const branches = storage.getData(storage.KEYS.branches, []);
    const branch = branches.find((item) => item.id === branchId);
    const branchFee = Number(branch?.monthlyFee || 0);
    const enrollment = enrollments
      .filter((item) => item.studentId === studentId && item.branchId === branchId)
      .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")))[0];

    let fee = branchFee;
    let source = "branş varsayılan ücreti";
    if (enrollment && enrollment.customFee !== undefined && enrollment.customFee !== null && enrollment.customFee !== "") {
      fee = Number(enrollment.customFee);
      source = "öğrencinin özel ücreti";
    }

    totalInput.value = fee;
    if (enrollment && app.$("#paymentEnrollment").value === "") {
      app.$("#paymentEnrollment").value = enrollment.id;
    }
    if (hint) hint.textContent = `Önerilen aylık ücret: ${app.formatCurrency(fee)} (${source}).`;
  }

  function openPaymentPlanForm() {
    app.openModal("Yeni ödeme planı", paymentPlanFormHtml());

    const students = storage.getData(storage.KEYS.students, []).filter((student) => student.status !== "Pasif" && student.status !== "Ayrıldı");
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const studentInput = app.$("#paymentStudent");
    const selection = app.$("#paymentStudentSelection");
    const syncSelectedStudent = (studentId) => {
      const student = studentMap.get(studentId) || null;
      if (studentInput) {
        studentInput.value = student ? student.id : "";
        studentInput.dispatchEvent(new Event("change"));
      }
      if (selection) {
        selection.innerHTML = paymentStudentCardHtml(student);
        app.hydrateStudentPhotos(app.$("#modal-root"));
      }
    };

    app.$("#paymentStudentPickerButton")?.addEventListener("click", () => {
      app.openStudentPicker({
        title: "Öğrenci seç",
        description: "Ödeme planı oluşturmak istediğiniz öğrenciyi alfabetik listeden seçin.",
        students,
        selectedId: studentInput?.value || "",
        emptyMessage: "Manuel ödeme planı oluşturulabilecek öğrenci bulunamadı.",
        renderMeta: (student) => student.phone || student.email || "İletişim bilgisi yok",
        onSelect: (student) => {
          syncSelectedStudent(student.id);
          return true;
        }
      });
    });

    syncSelectedStudent("");

    app.$("#paymentStudent").addEventListener("change", applySuggestedFee);
    app.$("#paymentBranch").addEventListener("change", applySuggestedFee);
    app.$("#paymentEnrollment").addEventListener("change", (event) => {
      const option = event.target.selectedOptions[0];
      if (!option || !option.value) return;
      if (option.dataset.student) syncSelectedStudent(option.dataset.student);
      if (option.dataset.branch) app.$("#paymentBranch").value = option.dataset.branch;
      applySuggestedFee();
    });

    app.$("#paymentPlanForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const payment = storage.normalizePayment({
        id: storage.generateId("pay"),
        studentId: String(data.get("studentId") || ""),
        branchId: String(data.get("branchId") || ""),
        enrollmentId: String(data.get("enrollmentId") || ""),
        totalAmount: Number(data.get("totalAmount") || 0),
        paidAmount: Number(data.get("paidAmount") || 0),
        dueDate: String(data.get("dueDate") || storage.todayISO()),
        status: "Bekliyor",
        description: String(data.get("description") || "").trim(),
        transactions: Number(data.get("paidAmount") || 0) > 0 ? [{ amount: Number(data.get("paidAmount") || 0), method: "Diğer", date: storage.todayISO(), note: "Plan oluşturulurken girildi" }] : []
      });

      if (!payment.studentId || !payment.branchId || payment.totalAmount <= 0) {
        app.toast("Öğrenci, branş ve toplam tutar zorunludur.", "error");
        return;
      }

      storage.setData(storage.KEYS.payments, [...allPayments(), payment]);
      app.closeModal();
      renderPaymentsPage();
      app.toast("Ödeme planı oluşturuldu.", "success");
      const sName = storage.getData(storage.KEYS.students, []).find(s => s.id === payment.studentId);
      const _cBranch = (storage.getData(storage.KEYS.branches, []).find(b => b.id === payment.branchId) || {}).name || payment.branchId;
      const _cDesc = payment.description || payment.period || "-";
      window.CaYaAudit?.log("payments", "add", `Manuel ödeme planı oluşturuldu: ${sName ? app.getStudentName(sName) : payment.studentId} | Branş: ${_cBranch} | Tutar: ${app.formatCurrency(payment.totalAmount)} | Plan: ${_cDesc} | Vade: ${app.formatDate(payment.dueDate)}`);
    });
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
    const payment = allPayments().find((item) => item.id === paymentId);
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

      const next = allPayments().map((item) => {
        if (item.id !== payment.id) return item;
        const updated = {
          ...item,
          paidAmount: Number(item.paidAmount || 0) + amount,
          transactions: [
            ...(item.transactions || []),
            {
              amount,
              method: String(data.get("method") || "Diğer"),
              date: String(data.get("date") || storage.todayISO()),
              note: String(data.get("note") || "").trim()
            }
          ]
        };
        return storage.normalizePayment(updated);
      });

      storage.setData(storage.KEYS.payments, next);
      app.closeModal();
      renderPaymentsPage();
      app.toast("Tahsilat kaydedildi.", "success");
      const _p = allPayments().find(x => x.id === paymentId);
      const _s = _p && storage.getData(storage.KEYS.students, []).find(s => s.id === _p.studentId);
      const _colNote = String(data.get("note") || "").trim();
      const _pPlanDesc = _p?.description || _p?.period || "-";
      window.CaYaAudit?.log("payments", "payment", `Tahsilat kaydedildi: ${_s ? app.getStudentName(_s) : ""} | Plan: ${_pPlanDesc} | Tutar: ${app.formatCurrency(amount)} | Yöntem: ${String(data.get("method") || "Diğer")} | Tarih: ${app.formatDate(String(data.get("date") || storage.todayISO()))}${_colNote ? " | Not: " + _colNote : ""}`);
    });
  }

  function recalculatePayment(payment) {
    const transactions = Array.isArray(payment.transactions) ? payment.transactions : [];
    const paidAmount = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    return storage.normalizePayment({ ...payment, paidAmount, transactions });
  }

  function applyPaymentUpdate(paymentId, mutator) {
    const next = allPayments().map((item) => {
      if (item.id !== paymentId) return item;
      const updated = mutator({ ...item, transactions: (item.transactions || []).slice() });
      return recalculatePayment(updated);
    });
    storage.setData(storage.KEYS.payments, next);
  }

  function transactionsModalHtml(payment) {
    const transactions = (payment.transactions || []).map((t, index) => ({ ...t, _index: index }));
    return `
      <div class="detail-grid">
        <div class="detail-item"><span>Toplam tutar</span><strong>${app.formatCurrency(payment.totalAmount)}</strong></div>
        <div class="detail-item"><span>Tahsil edilen</span><strong>${app.formatCurrency(payment.paidAmount)}</strong></div>
        <div class="detail-item"><span>Kalan</span><strong>${app.formatCurrency(payment.remainingAmount)}</strong></div>
        <div class="detail-item"><span>Durum</span><strong>${app.statusBadge(payment.status)}</strong></div>
      </div>

      <h3 style="margin-top: 16px;">Tahsilat hareketleri</h3>
      <div id="transactionsList">
        ${
          transactions.length
            ? `<div class="table-scroll">
                <table>
                  <thead><tr><th>Tarih</th><th>Yöntem</th><th>Tutar</th><th>Not</th>${app.access.canEdit("payments") ? "<th>İşlem</th>" : ""}</tr></thead>
                  <tbody>
                    ${transactions
                      .map((t) => `
                        <tr data-tx-index="${t._index}">
                          <td>${app.formatDate(t.date)}</td>
                          <td>${app.escapeHtml(t.method || "-")}</td>
                          <td>${app.formatCurrency(t.amount)}</td>
                          <td>${app.escapeHtml(t.note || "-")}</td>
                          ${app.access.canEdit("payments") ? `<td>
                            <div class="actions">
                              <button class="btn" type="button" data-tx-action="edit" data-tx-index="${t._index}">Düzenle</button>
                              <button class="btn btn-warning" type="button" data-tx-action="delete" data-tx-index="${t._index}">Sil</button>
                            </div>
                          </td>` : ""}
                        </tr>
                      `)
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : app.emptyState("Bu ödeme planı için henüz tahsilat hareketi yok.")
        }
      </div>

      ${app.access.canEdit("payments") ? `
      <h3 style="margin-top: 16px;">Yeni tahsilat ekle</h3>
      <form id="newTransactionForm" class="form-card">
        <div class="form-grid">
          <label>Tutar<input name="amount" type="number" min="0" step="0.01" required /></label>
          <label>Yöntem
            <select name="method">${paymentMethods.map((m) => `<option value="${m}">${m}</option>`).join("")}</select>
          </label>
          <label>İşlem tarihi<input name="date" type="date" value="${storage.todayISO()}" required /></label>
          <label>Not<input name="note" placeholder="Tahsilat notu" /></label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Tahsilat ekle</button>
        </div>
      </form>` : ""}

      <div class="form-actions" style="margin-top: 18px;">
        <button type="button" class="btn" data-modal-close>Kapat</button>
      </div>
    `;
  }

  function transactionEditHtml(transaction) {
    return `
      <form id="editTransactionForm" class="form-card">
        <div class="form-grid">
          <label>Tutar<input name="amount" type="number" min="0" step="0.01" value="${Number(transaction.amount || 0)}" required /></label>
          <label>Yöntem
            <select name="method">
              ${paymentMethods.map((m) => `<option value="${m}" ${m === transaction.method ? "selected" : ""}>${m}</option>`).join("")}
            </select>
          </label>
          <label>İşlem tarihi<input name="date" type="date" value="${app.escapeHtml(transaction.date || "")}" required /></label>
          <label>Not<input name="note" value="${app.escapeHtml(transaction.note || "")}" /></label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Güncelle</button>
        </div>
      </form>
    `;
  }

  function openTransactionsModal(paymentId) {
    const payment = allPayments().find((item) => item.id === paymentId);
    if (!payment) return;
    app.openModal("Tahsilat geçmişi", transactionsModalHtml(payment));
    attachTransactionsModalListeners(paymentId);
  }

  function refreshTransactionsModal(paymentId) {
    const refreshed = allPayments().find((item) => item.id === paymentId);
    if (!refreshed) return;
    app.openModal("Tahsilat geçmişi", transactionsModalHtml(refreshed));
    attachTransactionsModalListeners(paymentId);
  }

  function attachTransactionsModalListeners(paymentId) {
    const list = app.$("#transactionsList");
    if (list) {
      list.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-tx-action]");
        if (!button) return;
        const index = Number(button.dataset.txIndex);
        const current = allPayments().find((item) => item.id === paymentId);
        const transaction = (current?.transactions || [])[index];
        if (!transaction) return;

        if (button.dataset.txAction === "delete") {
          if (!confirm(`${app.formatCurrency(transaction.amount)} tutarındaki tahsilat silinsin mi?`)) return;
          applyPaymentUpdate(paymentId, (item) => {
            item.transactions.splice(index, 1);
            return item;
          });
          refreshTransactionsModal(paymentId);
          renderPaymentsPage();
          app.toast("Tahsilat silindi. Kalan bakiye güncellendi.", "success");
          const _sDel = storage.getData(storage.KEYS.students, []).find(s => s.id === current.studentId);
          const _pDelDesc = current.description || current.period || "-";
          window.CaYaAudit?.log("payments", "delete", `Tahsilat silindi: ${_sDel ? app.getStudentName(_sDel) : ""} | Plan: ${_pDelDesc} | Tutar: ${app.formatCurrency(transaction.amount)} | Yöntem: ${transaction.method || "-"} | Tarih: ${app.formatDate(transaction.date)}`);
        } else if (button.dataset.txAction === "edit") {
          openTransactionEdit(paymentId, index);
        }
      });
    }

    const form = app.$("#newTransactionForm");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const transaction = {
          amount: Number(data.get("amount") || 0),
          method: String(data.get("method") || "Diğer"),
          date: String(data.get("date") || storage.todayISO()),
          note: String(data.get("note") || "").trim()
        };
        if (transaction.amount <= 0) {
          app.toast("Tutar 0'dan büyük olmalı.", "error");
          return;
        }
        applyPaymentUpdate(paymentId, (item) => {
          item.transactions.push(transaction);
          return item;
        });
        refreshTransactionsModal(paymentId);
        renderPaymentsPage();
        app.toast("Tahsilat eklendi.", "success");
        const _pAdd = allPayments().find(item => item.id === paymentId);
        const _sAdd = _pAdd && storage.getData(storage.KEYS.students, []).find(s => s.id === _pAdd.studentId);
        const _pAddDesc = _pAdd?.description || _pAdd?.period || "-";
        window.CaYaAudit?.log("payments", "payment", `Tahsilat eklendi: ${_sAdd ? app.getStudentName(_sAdd) : ""} | Plan: ${_pAddDesc} | Tutar: ${app.formatCurrency(transaction.amount)} | Yöntem: ${transaction.method} | Tarih: ${app.formatDate(transaction.date)}`);
      });
    }
  }

  function openTransactionEdit(paymentId, index) {
    const current = allPayments().find((item) => item.id === paymentId);
    const transaction = (current?.transactions || [])[index];
    if (!transaction) return;

    app.openModal("Tahsilatı düzenle", transactionEditHtml(transaction), { size: "small" });
    app.$("#editTransactionForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const updated = {
        amount: Number(data.get("amount") || 0),
        method: String(data.get("method") || "Diğer"),
        date: String(data.get("date") || storage.todayISO()),
        note: String(data.get("note") || "").trim()
      };
      if (updated.amount <= 0) {
        app.toast("Tutar 0'dan büyük olmalı.", "error");
        return;
      }
      applyPaymentUpdate(paymentId, (item) => {
        item.transactions[index] = updated;
        return item;
      });
      refreshTransactionsModal(paymentId);
      renderPaymentsPage();
      app.toast("Tahsilat güncellendi.", "success");
      const _pEd = allPayments().find(item => item.id === paymentId);
      const _sEd = _pEd && storage.getData(storage.KEYS.students, []).find(s => s.id === _pEd.studentId);
      const _pEdDesc = _pEd?.description || _pEd?.period || "-";
      window.CaYaAudit?.log("payments", "edit", `Tahsilat düzenlendi: ${_sEd ? app.getStudentName(_sEd) : ""} | Plan: ${_pEdDesc} | Tutar: ${app.formatCurrency(updated.amount)} | Yöntem: ${updated.method} | Tarih: ${app.formatDate(updated.date)}`);
    });
  }

  function openWhatsApp(paymentId) {
    const payment = allPayments().find((item) => item.id === paymentId);
    if (!payment) return;
    const link = notifications.createWhatsAppLink(payment);
    window.open(link, "_blank", "noopener,noreferrer");
    navigator.clipboard?.writeText(link).catch(() => {});
    app.toast("WhatsApp bağlantısı oluşturuldu.", "success");
  }

  function cancelPayment(paymentId) {
    const payment = allPayments().find((item) => item.id === paymentId);
    if (!payment) return;
    if (!confirm("Bu ödeme planı iptal edilsin mi?")) return;

    storage.setData(
      storage.KEYS.payments,
      allPayments().map((item) => (item.id === paymentId ? { ...item, status: "İptal" } : item))
    );
    renderPaymentsPage();
    app.toast("Ödeme planı iptal edildi.", "success");
    const _sCan = storage.getData(storage.KEYS.students, []).find(s => s.id === payment.studentId);
    const _canDesc = payment.description || payment.period || "-";
    window.CaYaAudit?.log("payments", "cancel", `Ödeme planı iptal edildi: ${_sCan ? app.getStudentName(_sCan) : ""} | Plan: ${_canDesc} | Toplam: ${app.formatCurrency(payment.totalAmount)} | Ödenen: ${app.formatCurrency(payment.paidAmount)}`);
  }

  function reopenPayment(paymentId) {
    const payment = allPayments().find((item) => item.id === paymentId);
    if (!payment) return;
    if (!confirm("Bu ödeme planı yeniden açılsın mı?")) return;

    const reopened = storage.normalizePayment({ ...payment, status: "Bekliyor" });
    storage.setData(
      storage.KEYS.payments,
      allPayments().map((item) => (item.id === paymentId ? reopened : item))
    );
    renderPaymentsPage();
    app.toast("Ödeme planı yeniden açıldı.", "success");
    const _sReop = storage.getData(storage.KEYS.students, []).find(s => s.id === payment.studentId);
    const _reopDesc = payment.description || payment.period || "-";
    window.CaYaAudit?.log("payments", "reopen", `Ödeme planı yeniden açıldı: ${_sReop ? app.getStudentName(_sReop) : ""} | Plan: ${_reopDesc} | Toplam: ${app.formatCurrency(payment.totalAmount)} | Kalan: ${app.formatCurrency(payment.remainingAmount)}`);
  }

  function deletePayment(paymentId) {
    const payment = allPayments().find((item) => item.id === paymentId);
    if (!payment) return;
    if (payment.status !== "İptal") {
      app.toast("Yalnızca iptal edilmiş ödeme planları silinebilir.", "error");
      return;
    }

    if (!confirm("Bu iptal edilmiş ödeme planı kalıcı olarak silinsin mi? Bu işlem geri alınamaz.")) return;

    // Otomatik planlar, kayıt (enrollment) aktif olduğu sürece engine tarafından
    // ilgili dönem için yeniden oluşturulur. Bu yüzden diziden çıkarmak yerine
    // deleted:true ile işaretleyip gizliyoruz; engine bu dönemi yeniden üretmez.
    // Manuel planlarda yeniden üretim riski yok, doğrudan siliyoruz.
    const isAuto = payment.autoGenerated && payment.enrollmentId && payment.period;
    storage.setData(
      storage.KEYS.payments,
      isAuto
        ? allPayments().map((item) => (item.id === paymentId ? { ...item, deleted: true } : item))
        : allPayments().filter((item) => item.id !== paymentId)
    );
    renderPaymentsPage();
    app.toast("Ödeme planı silindi.", "success");
    const _sDelP = storage.getData(storage.KEYS.students, []).find(s => s.id === payment.studentId);
    const _delPDesc = payment.description || payment.period || "-";
    window.CaYaAudit?.log("payments", "delete", `İptal edilmiş ödeme planı silindi: ${_sDelP ? app.getStudentName(_sDelP) : ""} | Plan: ${_delPDesc} | Toplam: ${app.formatCurrency(payment.totalAmount)} | Ödenen: ${app.formatCurrency(payment.paidAmount)}`);
  }

  app.registerPage("payments", renderPaymentsPage);
})();
