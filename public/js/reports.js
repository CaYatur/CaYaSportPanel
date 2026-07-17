(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;

  function renderReportsPage() {
    const root = app.$("#page-content");
    if (!root) return;

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Raporlama</h2>
          <p>Öğrenci, branş, ödeme, devam ve kapasite raporları.</p>
        </div>
      </section>
      <section id="reportStats" class="grid stats"></section>
      <section class="grid two" style="margin-top: 18px;">
        <div class="table-panel">
          <div class="table-header"><h3>Branşlara göre öğrenci dağılımı</h3><span class="chip">Aktif kayıt</span></div>
          <div id="branchDistribution" style="padding: 16px;"></div>
        </div>
        <div class="table-panel">
          <div class="table-header"><h3>Branşlara göre gelir</h3><span class="chip">Tahsilat</span></div>
          <div id="branchIncome" style="padding: 16px;"></div>
        </div>
        <div class="table-panel">
          <div class="table-header"><h3>Aylık tahsilat</h3><span class="chip">Son aylar</span></div>
          <div id="monthlyIncome" style="padding: 16px;"></div>
        </div>
        <div class="table-panel">
          <div class="table-header"><h3>Devamsızlık oranları</h3><span class="chip">Öğrenci bazlı</span></div>
          <div id="absenceReport" style="padding: 16px;"></div>
        </div>
        <div class="table-panel">
          <div class="table-header"><h3>En dolu gruplar</h3><span class="chip">Kapasite</span></div>
          <div id="fullGroups" class="table-scroll"></div>
        </div>
        <div class="table-panel">
          <div class="table-header"><h3>Yaklaşan üyelik bitişleri</h3><span class="chip">30 gün</span></div>
          <div id="endingMemberships" class="table-scroll"></div>
        </div>
      </section>
    `;

    renderStats();
    renderBranchDistribution();
    renderBranchIncome();
    renderMonthlyIncome();
    renderAbsenceReport();
    renderFullGroups();
    renderEndingMemberships();
  }

  function statCard(label, value, note) {
    return `<section class="card stat-card"><div class="label"><span>${app.escapeHtml(label)}</span><span class="chip">Rapor</span></div><strong>${app.escapeHtml(value)}</strong><small>${app.escapeHtml(note || "")}</small></section>`;
  }

  function renderStats() {
    const students = storage.getData(storage.KEYS.students, []);
    const payments = storage.normalizePayments(storage.getData(storage.KEYS.payments, [])).filter((payment) => !payment.deleted);
    const active = students.filter((student) => student.status === "Aktif").length;
    const passive = students.length - active;
    const pending = payments.filter((payment) => ["Bekliyor", "Kısmi ödendi"].includes(payment.status)).reduce((sum, payment) => sum + payment.remainingAmount, 0);
    const overdue = payments.filter((payment) => payment.status === "Gecikti");
    const collected = payments.reduce((sum, payment) => sum + payment.paidAmount, 0);

    app.$("#reportStats").innerHTML = [
      statCard("Toplam öğrenci", students.length, `${active} aktif, ${passive} pasif/diğer`),
      statCard("Aktif öğrenci", active, "Yoklama listesine dahil olanlar"),
      statCard("Bekleyen ödeme", app.formatCurrency(pending), "Vadesi gelmemiş açık bakiye"),
      statCard("Geciken ödeme", overdue.length, app.formatCurrency(overdue.reduce((sum, payment) => sum + payment.remainingAmount, 0))),
      statCard("Toplam tahsilat", app.formatCurrency(collected), "Tüm branşlar"),
      statCard("Toplam grup", storage.getData(storage.KEYS.groups, []).length, "Aktif ve pasif gruplar"),
      statCard("Toplam branş", storage.getData(storage.KEYS.branches, []).length, "Kayıtlı branşlar"),
      statCard("Yoklama kaydı", storage.getData(storage.KEYS.attendance, []).length, "Tüm geçmiş")
    ].join("");
  }

  function barChart(items, formatter) {
    const max = Math.max(...items.map((item) => item.value), 1);
    if (!items.length) return app.emptyState("Rapor için yeterli veri yok.");
    return `
      <div class="bar-chart">
        ${items.map((item) => `
          <div class="bar-row">
            <strong>${app.escapeHtml(item.label)}</strong>
            <div class="bar-track"><span style="--value:${Math.round((item.value / max) * 100)}%; --bar-color:${item.color || "#dc2727"}"></span></div>
            <span>${formatter ? formatter(item.value) : item.value}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderBranchDistribution() {
    const branches = storage.getData(storage.KEYS.branches, []);
    const items = branches
      .map((branch) => ({
        label: branch.name,
        value: app.getBranchStudentCount(branch.id),
        color: branch.color
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
    app.$("#branchDistribution").innerHTML = barChart(items, (value) => `${value} kişi`);
  }

  function renderBranchIncome() {
    const branches = storage.getData(storage.KEYS.branches, []);
    const items = branches
      .map((branch) => ({
        label: branch.name,
        value: app.getBranchRevenue(branch.id),
        color: branch.color
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
    app.$("#branchIncome").innerHTML = barChart(items, app.formatCurrency);
  }

  function renderMonthlyIncome() {
    const payments = storage.normalizePayments(storage.getData(storage.KEYS.payments, [])).filter((payment) => !payment.deleted);
    const map = new Map();
    payments.forEach((payment) => {
      (payment.transactions || []).forEach((transaction) => {
        const month = String(transaction.date || "").slice(0, 7);
        if (!month) return;
        map.set(month, (map.get(month) || 0) + Number(transaction.amount || 0));
      });
    });
    const items = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([label, value]) => ({ label, value, color: "#2563eb" }));
    app.$("#monthlyIncome").innerHTML = barChart(items, app.formatCurrency);
  }

  function renderAbsenceReport() {
    const students = storage.getData(storage.KEYS.students, []);
    const attendance = storage.getData(storage.KEYS.attendance, []);
    const items = students
      .map((student) => {
        const records = attendance.filter((record) => record.studentId === student.id);
        const absent = records.filter((record) => record.status === "Gelmedi").length;
        return {
          label: app.getStudentName(student),
          value: records.length ? Math.round((absent / records.length) * 100) : 0,
          count: absent,
          color: absent > 1 ? "#d92d20" : "#f59e0b"
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    app.$("#absenceReport").innerHTML = barChart(items, (value) => `%${value}`);
  }

  function renderFullGroups() {
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage
      .getData(storage.KEYS.groups, [])
      .map((group) => {
        const count = app.getGroupStudentCount(group.id);
        const capacity = Number(group.capacity || 0);
        return {
          ...group,
          count,
          occupancy: capacity ? Math.round((count / capacity) * 100) : 0
        };
      })
      .sort((a, b) => b.occupancy - a.occupancy)
      .slice(0, 10);

    app.$("#fullGroups").innerHTML = groups.length
      ? `
        <table>
          <thead><tr><th>Grup</th><th>Branş</th><th>Öğrenci</th><th>Doluluk</th><th>Durum</th></tr></thead>
          <tbody>
            ${groups.map((group) => `
              <tr>
                <td>${app.escapeHtml(group.name)}</td>
                <td>${app.escapeHtml(app.getBranchName(branches, group.branchId))}</td>
                <td>${group.count}/${group.capacity || "-"}</td>
                <td><div class="progress"><span style="--value:${Math.min(group.occupancy, 100)}%"></span></div>%${group.occupancy}</td>
                <td>${app.statusBadge(group.status)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `
      : app.emptyState("Grup kaydı bulunamadı.");
  }

  function renderEndingMemberships() {
    const students = storage.getData(storage.KEYS.students, []);
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage.getData(storage.KEYS.groups, []);
    const today = storage.todayISO();
    const enrollments = storage
      .getData(storage.KEYS.enrollments, [])
      .filter((enrollment) => enrollment.status === "Aktif" && enrollment.endDate && app.daysBetween(today, enrollment.endDate) >= 0 && app.daysBetween(today, enrollment.endDate) <= 30)
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));

    app.$("#endingMemberships").innerHTML = enrollments.length
      ? `
        <table>
          <thead><tr><th>Öğrenci</th><th>Branş</th><th>Grup</th><th>Bitiş</th><th>Kalan</th></tr></thead>
          <tbody>
            ${enrollments.map((enrollment) => {
              const student = students.find((item) => item.id === enrollment.studentId);
              const remaining = app.daysBetween(today, enrollment.endDate);
              return `
                <tr>
                  <td>${app.escapeHtml(app.getStudentName(student))}</td>
                  <td>${app.escapeHtml(app.getBranchName(branches, enrollment.branchId))}</td>
                  <td>${app.escapeHtml(app.getGroupName(groups, enrollment.groupId))}</td>
                  <td>${app.formatDate(enrollment.endDate)}</td>
                  <td>${remaining} gün</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `
      : app.emptyState("30 gün içinde bitecek aktif üyelik yok.");
  }

  app.registerPage("reports", renderReportsPage);
})();
