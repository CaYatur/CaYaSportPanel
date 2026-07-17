(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;
  const attendanceStatuses = ["Geldi", "Gelmedi", "Geç kaldı", "İzinli", "Raporlu", "Telafi"];

  function renderAttendancePage() {
    const root = app.$("#page-content");
    if (!root) return;
    const groups = storage.getData(storage.KEYS.groups, []).filter((group) => group.status === "Aktif");

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Devam - Devamsızlık</h2>
          <p>Grup bazlı yoklama al, geçmiş kayıtları ve devam oranlarını izle.</p>
        </div>
      </section>

      <section class="toolbar">
        <div class="filters">
          <label>Tarih<input id="attendanceDate" type="date" value="${storage.todayISO()}" /></label>
          <label>Grup
            <select id="attendanceGroup">
              <option value="">Grup seçiniz</option>
              ${groups.map((group) => `<option value="${group.id}">${app.escapeHtml(group.name)}</option>`).join("")}
            </select>
          </label>
        </div>
      </section>

      <section class="grid two">
        <div class="grid">
          <div class="table-panel">
            <div class="table-header">
              <h3>Seçili gün grupları</h3>
              <span class="chip" id="todayGroupCount"></span>
            </div>
            <div id="todayGroups" class="compact-list" style="padding: 16px;"></div>
          </div>

          <div class="table-panel">
            <div class="table-header">
              <h3>Yoklama listesi</h3>
              <span class="chip" id="rosterCount">0 öğrenci</span>
            </div>
            <form id="attendanceForm" style="padding: 16px;">
              <div id="attendanceRoster" class="grid"></div>
              ${app.access.canEdit("attendance") ? `<div class="form-actions">
                <button type="submit" class="btn btn-primary">Toplu yoklama kaydet</button>
              </div>` : '<p class="muted" style="margin-top:10px;">Yoklama kaydı için düzenleme yetkiniz yok.</p>'}
            </form>
          </div>
        </div>

        <div class="table-panel">
          <div class="table-header">
            <h3>Yoklama geçmişi</h3>
            <span class="chip">Son kayıtlar</span>
          </div>
          <div id="attendanceHistory" class="table-scroll"></div>
        </div>
      </section>
    `;

    app.$("#attendanceDate").addEventListener("input", () => {
      renderTodayGroups();
      renderRoster();
    });
    app.$("#attendanceGroup").addEventListener("input", renderRoster);
    app.$("#todayGroups").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-group-id]");
      if (!button) return;
      app.$("#attendanceGroup").value = button.dataset.groupId;
      renderRoster();
    });
    app.$("#attendanceForm").addEventListener("submit", saveAttendance);
    app.$("#attendanceRoster").addEventListener("click", (event) => {
      const chip = event.target.closest(".status-chip[data-student-id]");
      if (!chip) return;
      const studentId = chip.dataset.studentId;
      const status = chip.dataset.status;
      const rosterEl = app.$("#attendanceRoster");
      rosterEl.querySelectorAll(`.status-chip[data-student-id="${studentId}"]`).forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const hiddenInput = rosterEl.querySelector(`[name="status_${studentId}"]`);
      if (hiddenInput) hiddenInput.value = status;
    });

    renderTodayGroups();
    renderRoster();
    renderHistory();
  }

  function renderTodayGroups() {
    const date = app.$("#attendanceDate").value || storage.todayISO();
    const day = app.getTodayName(date);
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage.getData(storage.KEYS.groups, []).filter((group) => group.status === "Aktif" && app.groupDays(group).includes(day));
    const root = app.$("#todayGroups");

    root.innerHTML = groups.length
      ? groups
          .map((group) => {
            const branchName = app.getBranchName(branches, group.branchId);
            const sessions = app.groupSessionsForDay(group, day);
            const timeLabel = sessions.length
              ? sessions.map((s) => `${s.startTime || "?"}-${s.endTime || "?"}`).join(", ")
              : "Saat tanımsız";
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
    app.$("#todayGroupCount").textContent = `${groups.length} grup`;
  }

  function getRoster(groupId) {
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

  function renderRoster() {
    const groupId = app.$("#attendanceGroup").value;
    const date = app.$("#attendanceDate").value || storage.todayISO();
    const root = app.$("#attendanceRoster");
    const count = app.$("#rosterCount");

    if (!groupId) {
      root.innerHTML = app.emptyState("Yoklama almak için grup seçiniz.");
      count.textContent = "0 öğrenci";
      return;
    }

    const existingRecords = storage.getData(storage.KEYS.attendance, []).filter((item) => item.groupId === groupId && item.date === date);
    const recordsByStudent = new Map(existingRecords.map((item) => [item.studentId, item]));
    const roster = getRoster(groupId);
    count.textContent = `${roster.length} öğrenci`;

    root.innerHTML = roster.length
      ? roster
          .map((student) => {
            const existing = recordsByStudent.get(student.id);
            const selected = existing ? existing.status : "Geldi";
            return `
              <div class="attendance-card">
                <div class="attendance-card-top">
                  ${app.studentAvatar(student)}
                  <div class="attendance-card-info">
                    <strong>${app.escapeHtml(app.getStudentName(student))}</strong>
                    <small class="muted">Devam oranı: %${app.attendanceRatio(student.id)}</small>
                  </div>
                  <div class="status-chips">
                    ${attendanceStatuses.map((status) => `<button type="button" class="status-chip${status === selected ? " active" : ""}" data-student-id="${student.id}" data-status="${app.escapeHtml(status)}">${app.escapeHtml(status)}</button>`).join("")}
                  </div>
                </div>
                <input type="hidden" name="status_${student.id}" value="${app.escapeHtml(selected)}" />
                <input class="attendance-note-input" name="note_${student.id}" placeholder="Not (isteğe bağlı)" value="${app.escapeHtml(existing ? existing.note : "")}" />
              </div>
            `;
          })
          .join("")
      : app.emptyState("Bu gruba aktif öğrenci kayıtlı değil.");
    app.hydrateStudentPhotos(root);
  }

  function saveAttendance(event) {
    event.preventDefault();
    if (!app.access.canEdit("attendance")) return;
    const groupId = app.$("#attendanceGroup").value;
    const date = app.$("#attendanceDate").value || storage.todayISO();
    const group = storage.getData(storage.KEYS.groups, []).find((item) => item.id === groupId);
    if (!group) {
      app.toast("Grup seçiniz.", "error");
      return;
    }

    const roster = getRoster(groupId);
    if (!roster.length) {
      app.toast("Kaydedilecek aktif öğrenci bulunamadı.", "error");
      return;
    }

    const records = storage.getData(storage.KEYS.attendance, []);
    const next = [...records];

    roster.forEach((student) => {
      const status = app.$(`[name="status_${student.id}"]`).value;
      const note = app.$(`[name="note_${student.id}"]`).value.trim();
      const index = next.findIndex((item) => item.studentId === student.id && item.groupId === groupId && item.date === date);
      const record = {
        id: index >= 0 ? next[index].id : storage.generateId("att"),
        studentId: student.id,
        branchId: group.branchId,
        groupId,
        date,
        status,
        note
      };

      if (index >= 0) {
        next[index] = record;
      } else {
        next.push(record);
      }
    });

    storage.setData(storage.KEYS.attendance, next);
    renderRoster();
    renderHistory();
    app.toast("Yoklama kaydedildi.", "success");
    const _attGroup = storage.getData(storage.KEYS.groups, []).find(g => g.id === groupId) || {};
    const grpName = _attGroup.name || groupId;
    const _attBranch = (storage.getData(storage.KEYS.branches, []).find(b => b.id === _attGroup.branchId) || {}).name || _attGroup.branchId || "-";
    window.CaYaAudit?.log("attendance", "attendance", `Yoklama kaydedildi: ${grpName} | Branş: ${_attBranch} | Tarih: ${app.formatDate(date)} | ${roster.length} öğrenci`);
  }

  function renderHistory() {
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage.getData(storage.KEYS.groups, []);
    const students = storage.getData(storage.KEYS.students, []);
    const records = storage
      .getData(storage.KEYS.attendance, [])
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 40);

    const root = app.$("#attendanceHistory");
    root.innerHTML = records.length
      ? `
        <table>
          <thead><tr><th>Tarih</th><th>Öğrenci</th><th>Branş</th><th>Grup</th><th>Durum</th></tr></thead>
          <tbody>
            ${records.map((record) => {
              const student = students.find((item) => item.id === record.studentId);
              return `
                <tr>
                  <td>${app.formatDate(record.date)}</td>
                  <td>${app.escapeHtml(app.getStudentName(student))}</td>
                  <td>${app.escapeHtml(app.getBranchName(branches, record.branchId))}</td>
                  <td>${app.escapeHtml(app.getGroupName(groups, record.groupId))}</td>
                  <td>${app.statusBadge(record.status)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `
      : app.emptyState("Henüz yoklama kaydı yok.");
  }

  app.registerPage("attendance", renderAttendancePage);
})();
