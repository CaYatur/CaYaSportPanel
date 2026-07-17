(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;
  const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  const levels = ["Başlangıç", "Orta", "İleri"];

  async function requestJson(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options && options.headers ? options.headers : {}) },
      ...options
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      throw new Error((payload && (payload.message || payload.error)) || "İstek tamamlanamadı.");
    }

    return payload;
  }

  async function copyText(value) {
    const text = String(value || "");
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function selectedStudentCardHtml(student, placeholder) {
    if (!student) {
      return `
        <div class="student-picker-selection-card is-empty">
          <span class="muted">${app.escapeHtml(placeholder || "Henüz öğrenci seçilmedi.")}</span>
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

  function refreshScheduleShareControls(branches) {
    const branchId = app.$("#groupBranchFilter")?.value || "";
    const branch = branches.find((item) => item.id === branchId);
    const shareButton = app.$("#shareScheduleButton");
    const shareHint = app.$("#scheduleShareHint");
    const scopeChip = app.$("#scheduleScopeChip");

    if (shareButton) shareButton.disabled = false;
    if (shareHint) {
      shareHint.textContent = branch
        ? `${branch.name} branşının aktif haftalık programı sabit bağlantı ile paylaşılır.`
        : "Tüm branşların aktif haftalık programı sabit bağlantı ile paylaşılır.";
    }
    if (scopeChip) scopeChip.textContent = branch ? branch.name : "Tüm branşlar";
  }

  async function openScheduleShareModal() {
    const branchId = app.$("#groupBranchFilter")?.value || "";
    const apiScope = branchId || "all";

    const shareButton = app.$("#shareScheduleButton");
    const originalLabel = shareButton ? shareButton.textContent : "";
    if (shareButton) {
      shareButton.disabled = true;
      shareButton.textContent = "Link hazırlanıyor...";
    }

    try {
      const payload = await requestJson(`api/public-schedules/${encodeURIComponent(apiScope)}`);
      // Build share URL using the current origin + app base path + server path.
      // payload.path is an absolute path like /schedule/... without any subpath prefix,
      // so prepend the app's directory (e.g. /cayasportpanel) derived from the current page URL.
      const appBase = window.location.pathname.replace(/\/[^/]*$/, ""); // e.g. "/cayasportpanel"
      const sharePath = String(payload.path || "");
      const shareUrl = sharePath
        ? `${window.location.origin}${appBase}${sharePath}`
        : String(payload.url || "");
      let autoCopied = false;

      if (shareUrl) {
        try {
          await copyText(shareUrl);
          autoCopied = true;
        } catch (error) {
          autoCopied = false;
        }
      }

      app.openModal("Program paylaşımı", `
        <div class="share-link-panel">
          <p class="muted"><strong>${app.escapeHtml(payload.branchName || "Branş")}</strong> için üretilen bu link sabittir; aktif haftalık programı telefon ve masaüstünde düzenli biçimde gösterir.</p>
          <label>Paylaşım bağlantısı
            <input id="scheduleShareUrl" type="text" readonly value="${app.escapeHtml(shareUrl)}" />
          </label>
          <div class="form-actions">
            <button type="button" class="btn" id="copyScheduleShareButton">Kopyala</button>
            <a class="btn btn-primary" href="${app.escapeHtml(shareUrl || "#")}" target="_blank" rel="noopener noreferrer">Aç</a>
          </div>
        </div>
      `, { size: "small" });

      if (autoCopied) {
        app.toast("Bağlantı kopyalandı.", "success");
      }

      const linkInput = app.$("#scheduleShareUrl");
      if (linkInput) {
        linkInput.focus();
        linkInput.select();
      }

      app.$("#copyScheduleShareButton")?.addEventListener("click", async () => {
        try {
          await copyText(shareUrl);
          app.toast("Bağlantı kopyalandı.", "success");
        } catch (error) {
          app.toast("Link kopyalanamadı.", "error");
        }
      });
    } catch (error) {
      app.toast(error.message || "Paylaşım linki oluşturulamadı.", "error");
    } finally {
      if (shareButton) shareButton.textContent = originalLabel || "Programı paylaş";
      refreshScheduleShareControls(storage.getData(storage.KEYS.branches, []));
    }
  }

  function renderGroupsPage() {
    const root = app.$("#page-content");
    if (!root) return;
    const branches = storage.getData(storage.KEYS.branches, []);

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Grup / Seans Yönetimi</h2>
          <p>Branş grupları, eğitmenler, saatler ve haftalık ders programı.</p>
        </div>
        <button class="btn btn-primary" id="newGroupButton">Grup ekle</button>
      </section>

      <section class="toolbar">
        <div class="filters">
          <input id="groupSearch" type="search" placeholder="Grup veya eğitmen ara" />
          <select id="groupBranchFilter">
            <option value="">Tüm branşlar</option>
            ${branches.map((branch) => `<option value="${branch.id}">${app.escapeHtml(branch.name)}</option>`).join("")}
          </select>
          <select id="groupStatusFilter">
            <option value="">Tüm durumlar</option>
            <option value="Aktif">Aktif</option>
            <option value="Pasif">Pasif</option>
          </select>
        </div>
      </section>

      <section class="table-panel">
        <div class="table-header">
          <h3>Grup Listesi</h3>
          <span class="chip" id="groupCount"></span>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Grup</th>
                <th>Branş</th>
                <th>Eğitmen(ler)</th>
                <th>Gün / Saat</th>
                <th>Doluluk</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody id="groupsTbody"></tbody>
          </table>
        </div>
      </section>

      <section class="table-panel" style="margin-top: 18px;">
        <div class="table-header">
          <div>
            <h3>Haftalık program</h3>
            <small id="scheduleShareHint" class="muted">Tüm branşların aktif haftalık programı sabit bağlantı ile paylaşılır.</small>
          </div>
          <div class="table-header-actions">
            <span class="chip" id="scheduleScopeChip">Tüm branşlar</span>
            <button class="btn" id="shareScheduleButton" type="button">Programı paylaş</button>
          </div>
        </div>
        <div style="padding: 16px;">
          <div id="scheduleGrid" class="schedule-grid schedule-grid-wide"></div>
        </div>
      </section>
    `;

    app.$("#newGroupButton").addEventListener("click", () => openGroupForm());
    app.$("#shareScheduleButton").addEventListener("click", openScheduleShareModal);
    ["#groupSearch", "#groupBranchFilter", "#groupStatusFilter"].forEach((selector) => app.$(selector).addEventListener("input", renderGroups));
    app.$("#groupsTbody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "detail") openGroupDetail(button.dataset.id);
      if (button.dataset.action === "edit") openGroupForm(button.dataset.id);
      if (button.dataset.action === "passive") makeGroupPassive(button.dataset.id);
      if (button.dataset.action === "activate") makeGroupActive(button.dataset.id);
      if (button.dataset.action === "add-student") openAddStudentForm(button.dataset.id);
    });
    renderGroups();
  }

  function filteredGroups() {
    const search = (app.$("#groupSearch")?.value || "").toLocaleLowerCase("tr-TR");
    const branchId = app.$("#groupBranchFilter")?.value || "";
    const status = app.$("#groupStatusFilter")?.value || "";
    const teachers = storage.getData(storage.KEYS.teachers, []);

    return storage.getData(storage.KEYS.groups, []).filter((group) => {
      const teacherNames = app.groupTeacherNames(group, teachers).join(" ");
      const haystack = [group.name, teacherNames, group.level, group.ageRange].join(" ").toLocaleLowerCase("tr-TR");
      return (!search || haystack.includes(search)) && (!branchId || group.branchId === branchId) && (!status || group.status === status);
    });
  }

  function sessionDayLabel(sessions) {
    if (!sessions.length) return '<span class="muted">Saat tanımlı değil</span>';
    return sessions
      .map((session) => `<div><strong>${app.escapeHtml(session.day)}</strong> <small class="muted">${app.escapeHtml(session.startTime || "?")} - ${app.escapeHtml(session.endTime || "?")}</small></div>`)
      .join("");
  }

  function renderGroups() {
    const tbody = app.$("#groupsTbody");
    const schedule = app.$("#scheduleGrid");
    if (!tbody || !schedule) return;
    const branches = storage.getData(storage.KEYS.branches, []);
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const groups = filteredGroups();

    const canEditGroups = app.access.canEdit("groups");
    // Enrolling a student to a group is a group-level write; require both
    // students:edit (to create the enrollment record) and groups:edit (to
    // modify the group's member list).  Having only branches:view or
    // students:edit alone is not sufficient.
    const canEnroll = app.access.canEdit("students") && app.access.canEdit("groups");
    tbody.innerHTML = groups.length
      ? groups
          .map((group) => {
            const count = app.getGroupStudentCount(group.id);
            const capacity = Number(group.capacity || 0);
            const occupancy = capacity ? Math.round((count / capacity) * 100) : 0;
            const teacherNames = app.groupTeacherNames(group, teachers);
            const sessions = app.groupSessions(group);
            return `
              <tr>
                <td>
                  <strong>${app.escapeHtml(group.name)}</strong>
                  <br /><small class="muted">${app.escapeHtml(group.level || "-")} · ${app.escapeHtml(group.ageRange || "-")}</small>
                </td>
                <td>${app.escapeHtml(app.getBranchName(branches, group.branchId))}</td>
                <td>${teacherNames.length ? teacherNames.map((n) => `<span class="chip">${app.escapeHtml(n)}</span>`).join(" ") : '<span class="muted">-</span>'}</td>
                <td>${sessionDayLabel(sessions)}</td>
                <td>
                  <strong>${count}/${capacity || "-"}</strong>
                  <div class="progress"><span style="--value:${Math.min(occupancy, 100)}%"></span></div>
                </td>
                <td>${app.statusBadge(group.status)}</td>
                <td>
                  <div class="actions">
                    <button class="btn btn-ghost" data-action="detail" data-id="${group.id}">Detay</button>
                    ${canEnroll ? `<button class="btn btn-primary" data-action="add-student" data-id="${group.id}">Öğrenci ekle</button>` : ""}
                    ${canEditGroups ? `<button class="btn" data-action="edit" data-id="${group.id}">Düzenle</button>
                    ${group.status === "Aktif"
                      ? `<button class="btn btn-warning" data-action="passive" data-id="${group.id}">Pasifleştir</button>`
                      : `<button class="btn btn-primary" data-action="activate" data-id="${group.id}">Aktifleştir</button>`
                    }` : ""}
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="7">${app.emptyState("Filtrelere uygun grup bulunamadı.")}</td></tr>`;

    app.$("#groupCount").textContent = `${groups.length} kayıt`;
    refreshScheduleShareControls(branches);
    renderSchedule(groups, branches, teachers);
  }

  function renderSchedule(groups, branches, teachers) {
    const schedule = app.$("#scheduleGrid");
    schedule.innerHTML = days
      .map((day) => {
        const items = groups
          .filter((group) => group.status === "Aktif")
          .flatMap((group) => app.groupSessionsForDay(group, day).map((session) => ({ session, group })))
          .sort((a, b) => String(a.session.startTime || "").localeCompare(String(b.session.startTime || "")));
        return `
          <div class="day-column">
            <h4>${day}</h4>
            ${
              items.length
                ? items
                    .map(({ session, group }) => {
                      const branch = branches.find((item) => item.id === group.branchId);
                      const teacherNames = app.groupTeacherNames(group, teachers);
                      const count = app.getGroupStudentCount(group.id);
                      const capacity = Number(group.capacity || 0);
                      return `
                        <div class="schedule-item" style="border-left-color:${branch ? branch.color : "#dc2727"}">
                          <strong>${app.escapeHtml(session.startTime || "-")} - ${app.escapeHtml(session.endTime || "-")}</strong>
                          <span>${app.escapeHtml(group.name)}</span>
                          <small>${app.escapeHtml(branch ? branch.name : "-")}${teacherNames.length ? " · " + app.escapeHtml(teacherNames.join(", ")) : ""}</small>
                          ${capacity ? `<small class="schedule-capacity">Kontenjan: ${count}/${capacity}</small>` : ""}
                        </div>
                      `;
                    })
                    .join("")
                : '<small class="muted">Ders yok</small>'
            }
          </div>
        `;
      })
      .join("");
  }

  function sessionRowHtml(session, index) {
    return `
      <div class="form-grid three group-session-row" data-session-index="${index}">
        <label>Gün
          <select data-session-field="day">
            ${days.map((day) => `<option value="${day}" ${day === session.day ? "selected" : ""}>${day}</option>`).join("")}
          </select>
        </label>
        <label>Başlangıç<input type="time" data-session-field="startTime" value="${app.escapeHtml(session.startTime || "")}" /></label>
        <label>Bitiş
          <span style="display: flex; gap: 6px;">
            <input type="time" data-session-field="endTime" value="${app.escapeHtml(session.endTime || "")}" style="flex: 1;" />
            <button type="button" class="btn btn-warning" data-remove-session="${index}" style="white-space: nowrap;">Sil</button>
          </span>
        </label>
      </div>
    `;
  }

  function groupFormHtml(group) {
    const branches = storage.getData(storage.KEYS.branches, []).filter((branch) => branch.status === "Aktif");
    const teachers = storage.getData(storage.KEYS.teachers, []).filter((teacher) => teacher.status === "Aktif");
    const item = group || {
      status: "Aktif",
      level: "Başlangıç",
      sessions: [],
      capacity: "",
      instructorIds: []
    };
    const sessions = app.groupSessions(item);
    const instructorIds = Array.isArray(item.instructorIds) ? item.instructorIds : [];

    return `
      <form id="groupForm" class="form-card">
        <div class="form-grid">
          <label>Grup adı<input name="name" value="${app.escapeHtml(item.name || "")}" required /></label>
          <label>Branş
            <select name="branchId" required>
              <option value="">Seçiniz</option>
              ${branches.map((branch) => `<option value="${branch.id}" ${branch.id === item.branchId ? "selected" : ""}>${app.escapeHtml(branch.name)}</option>`).join("")}
            </select>
          </label>
          <label>Kapasite<input name="capacity" type="number" min="0" value="${app.escapeHtml(item.capacity ?? "")}" /></label>
          <label>Seviye<select name="level">${levels.map((level) => `<option value="${level}" ${level === item.level ? "selected" : ""}>${level}</option>`).join("")}</select></label>
          <label>Yaş aralığı<input name="ageRange" value="${app.escapeHtml(item.ageRange || "")}" placeholder="8-14" /></label>
          <label>Durum
            <select name="status">
              <option value="Aktif" ${item.status === "Aktif" ? "selected" : ""}>Aktif</option>
              <option value="Pasif" ${item.status === "Pasif" ? "selected" : ""}>Pasif</option>
            </select>
          </label>
          <label class="span-2">Eğitmen(ler)
            <div class="checkbox-group">
              ${
                teachers.length
                  ? teachers
                      .map((teacher) => {
                        const name = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim();
                        return `
                          <label class="checkbox-label">
                            <input type="checkbox" name="instructorIds" value="${teacher.id}" ${instructorIds.includes(teacher.id) ? "checked" : ""} />
                            ${app.escapeHtml(name || teacher.id)}
                          </label>
                        `;
                      })
                      .join("")
                  : '<span class="muted">Önce öğretmen ekleyin.</span>'
              }
            </div>
          </label>
        </div>

        <div style="margin-top: 14px;">
          <strong>Ders günleri ve saatleri</strong>
          <p class="muted">Aynı grup birden fazla gün için farklı saatlerde toplanabilir. Örn: Pazartesi 18:00-19:30, Çarşamba 19:00-20:30.</p>
          <div id="groupSessionsList">
            ${sessions.length ? sessions.map((session, index) => sessionRowHtml(session, index)).join("") : ""}
          </div>
          <button type="button" class="btn" id="addGroupSession" style="margin-top: 8px;">+ Gün/saat ekle</button>
        </div>

        <div class="form-actions" style="margin-top: 14px;">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Kaydet</button>
        </div>
      </form>
    `;
  }

  function openGroupForm(groupId) {
    const groups = storage.getData(storage.KEYS.groups, []);
    const group = groups.find((item) => item.id === groupId);
    app.openModal(group ? "Grup düzenle" : "Grup ekle", groupFormHtml(group));

    const sessionsList = app.$("#groupSessionsList");
    const sessionState = app.groupSessions(group || { sessions: [] });

    const renderSessions = () => {
      sessionsList.innerHTML = sessionState.length
        ? sessionState.map((session, index) => sessionRowHtml(session, index)).join("")
        : '<p class="muted">Henüz ders günü eklenmedi. "+ Gün/saat ekle" ile başlayın.</p>';
    };
    renderSessions();

    app.$("#addGroupSession").addEventListener("click", () => {
      sessionState.push({ day: days[0], startTime: "", endTime: "" });
      renderSessions();
    });

    sessionsList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-remove-session]");
      if (!button) return;
      const index = Number(button.dataset.removeSession);
      sessionState.splice(index, 1);
      renderSessions();
    });

    sessionsList.addEventListener("change", (event) => {
      const field = event.target.dataset.sessionField;
      if (!field) return;
      const row = event.target.closest(".group-session-row");
      if (!row) return;
      const index = Number(row.dataset.sessionIndex);
      if (Number.isInteger(index) && sessionState[index]) {
        sessionState[index][field] = event.target.value;
      }
    });

    sessionsList.addEventListener("input", (event) => {
      const field = event.target.dataset.sessionField;
      if (!field) return;
      const row = event.target.closest(".group-session-row");
      if (!row) return;
      const index = Number(row.dataset.sessionIndex);
      if (Number.isInteger(index) && sessionState[index]) {
        sessionState[index][field] = event.target.value;
      }
    });

    app.$("#groupForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const instructorIds = data.getAll("instructorIds").map(String);
      const sessions = sessionState
        .map((session) => ({
          day: String(session.day || "").trim(),
          startTime: String(session.startTime || "").trim(),
          endTime: String(session.endTime || "").trim()
        }))
        .filter((session) => session.day);

      const invalid = sessions.find((session) => session.startTime && session.endTime && session.startTime >= session.endTime);
      if (invalid) {
        app.toast(`${invalid.day} için bitiş saati başlangıçtan sonra olmalı.`, "error");
        return;
      }

      const record = {
        id: group ? group.id : storage.generateId("grp"),
        name: String(data.get("name") || "").trim(),
        branchId: String(data.get("branchId") || ""),
        instructorIds,
        sessions,
        capacity: Number(data.get("capacity") || 0),
        ageRange: String(data.get("ageRange") || "").trim(),
        level: String(data.get("level") || "Başlangıç"),
        status: String(data.get("status") || "Aktif")
      };

      if (!record.name || !record.branchId || !record.sessions.length) {
        app.toast("Grup adı, branş ve en az bir ders günü/saati zorunludur.", "error");
        return;
      }

      const next = group ? groups.map((item) => (item.id === group.id ? record : item)) : [...groups, record];
      storage.setData(storage.KEYS.groups, next);
      app.closeModal();
      renderGroupsPage();
      app.toast("Grup kaydedildi.", "success");
      const _grpBranch = (storage.getData(storage.KEYS.branches, []).find(b => b.id === record.branchId) || {}).name || record.branchId;
      window.CaYaAudit?.log("groups", group ? "edit" : "add", `Grup ${group ? "güncellendi" : "eklendi"}: ${record.name} | Branş: ${_grpBranch} | Kapasite: ${record.capacity || "Sınırsız"} | Seviye: ${record.level} | Durum: ${record.status}`);
    });
  }

  function makeGroupPassive(groupId) {
    const groups = storage.getData(storage.KEYS.groups, []);
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    if (!confirm(`${group.name} grubu pasifleştirilsin mi?`)) return;

    storage.setData(
      storage.KEYS.groups,
      groups.map((item) => (item.id === groupId ? { ...item, status: "Pasif" } : item))
    );
    renderGroupsPage();
    app.toast("Grup pasifleştirildi.", "success");
    const _grpPassBranch = (storage.getData(storage.KEYS.branches, []).find(b => b.id === group.branchId) || {}).name || group.branchId;
    window.CaYaAudit?.log("groups", "passive", `Grup pasifleştirildi: ${group.name} | Branş: ${_grpPassBranch}`);
  }

  function makeGroupActive(groupId) {
    const groups = storage.getData(storage.KEYS.groups, []);
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    if (!confirm(`${group.name} grubu aktifleştirilsin mi?`)) return;

    storage.setData(
      storage.KEYS.groups,
      groups.map((item) => (item.id === groupId ? { ...item, status: "Aktif" } : item))
    );
    renderGroupsPage();
    app.toast("Grup aktifleştirildi.", "success");
    const _grpActBranch = (storage.getData(storage.KEYS.branches, []).find(b => b.id === group.branchId) || {}).name || group.branchId;
    window.CaYaAudit?.log("groups", "activate", `Grup aktifleştirildi: ${group.name} | Branş: ${_grpActBranch}`);
  }

  function getGroupMemberships(groupId) {
    const students = storage.getData(storage.KEYS.students, []);
    const studentMap = new Map(students.map((student) => [student.id, student]));
    return storage
      .getData(storage.KEYS.enrollments, [])
      .filter((enrollment) => enrollment.groupId === groupId && enrollment.status === "Aktif")
      .map((enrollment) => ({
        enrollment,
        student: studentMap.get(enrollment.studentId) || null
      }))
      // Match roster/count: only active students count as current group members.
      .filter((item) => item.student && item.student.status === "Aktif")
      .sort((a, b) => app.getStudentName(a.student).localeCompare(app.getStudentName(b.student), "tr"));
  }

  function groupMembersTableHtml(group) {
    const members = getGroupMemberships(group.id);
    const canRemove = app.access.canEdit("students") && app.access.canEdit("groups");
    if (!members.length) {
      return app.emptyState("Bu gruba kayıtlı aktif öğrenci yok.");
    }

    return `
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Öğrenci</th>
              <th>Telefon</th>
              <th>Başlangıç</th>
              <th>Bitiş</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${members
              .map(({ enrollment, student }) => `
                <tr>
                  <td>
                    <div class="student-line">
                      ${app.studentAvatar(student)}
                      <div>
                        <strong>${app.escapeHtml(app.getStudentName(student))}</strong>
                        <br /><small class="muted">${app.escapeHtml(student.status || "-")}</small>
                      </div>
                    </div>
                  </td>
                  <td>${app.escapeHtml(student.phone || "-")}</td>
                  <td>${app.formatDate(enrollment.startDate)}</td>
                  <td>${app.formatDate(enrollment.endDate)}</td>
                  <td>
                    ${canRemove
                      ? `<button type="button" class="btn btn-warning" data-group-member-action="remove" data-enrollment-id="${enrollment.id}" data-group-id="${group.id}">Gruptan çıkar</button>`
                      : '<span class="muted">-</span>'}
                  </td>
                </tr>
              `)
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function openGroupDetail(groupId) {
    const groups = storage.getData(storage.KEYS.groups, []);
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;

    const branches = storage.getData(storage.KEYS.branches, []);
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const teacherNames = app.groupTeacherNames(group, teachers);
    const sessions = app.groupSessions(group);
    const count = app.getGroupStudentCount(group.id);
    const canEnroll = app.access.canEdit("students") && app.access.canEdit("groups");

    app.openModal(`${group.name} · Grup detayı`, `
      <div class="detail-grid">
        <div class="detail-item"><span>Branş</span><strong>${app.escapeHtml(app.getBranchName(branches, group.branchId))}</strong></div>
        <div class="detail-item"><span>Durum</span><strong>${app.statusBadge(group.status)}</strong></div>
        <div class="detail-item"><span>Eğitmen(ler)</span><strong>${app.escapeHtml(teacherNames.join(", ") || "-")}</strong></div>
        <div class="detail-item"><span>Kapasite</span><strong>${count} / ${group.capacity || "-"}</strong></div>
        <div class="detail-item"><span>Seviye</span><strong>${app.escapeHtml(group.level || "-")}</strong></div>
        <div class="detail-item"><span>Yaş aralığı</span><strong>${app.escapeHtml(group.ageRange || "-")}</strong></div>
        <div class="detail-item span-2"><span>Program</span><strong>${sessions.length ? sessions.map((s) => `${s.day} ${s.startTime || "?"}-${s.endTime || "?"}`).join(" · ") : "Tanımsız"}</strong></div>
      </div>

      <div class="toolbar" style="margin: 16px 0 10px;">
        <h3 style="margin: 0;">Gruptaki öğrenciler</h3>
        ${canEnroll ? `<button type="button" class="btn btn-primary" id="groupDetailAddStudent" data-group-id="${group.id}">Öğrenci ekle</button>` : ""}
      </div>
      <div id="groupMembersHost">${groupMembersTableHtml(group)}</div>
    `);

    app.hydrateStudentPhotos(app.$("#modal-root"));

    app.$("#groupDetailAddStudent")?.addEventListener("click", () => {
      app.closeModal();
      openAddStudentForm(group.id);
    });

    app.$("#groupMembersHost")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-group-member-action='remove']");
      if (!button) return;
      removeStudentFromGroup(button.dataset.enrollmentId, button.dataset.groupId);
    });
  }

  function removeStudentFromGroup(enrollmentId, groupId) {
    if (!app.access.canEdit("students") || !app.access.canEdit("groups")) return;

    const enrollments = storage.getData(storage.KEYS.enrollments, []);
    const enrollment = enrollments.find((item) => item.id === enrollmentId);
    if (!enrollment) return;

    const students = storage.getData(storage.KEYS.students, []);
    const student = students.find((item) => item.id === enrollment.studentId);
    const groups = storage.getData(storage.KEYS.groups, []);
    const group = groups.find((item) => item.id === groupId) || groups.find((item) => item.id === enrollment.groupId);
    const studentName = student ? app.getStudentName(student) : enrollment.studentId;
    const groupName = group ? group.name : groupId;

    if (!confirm(`${studentName} öğrencisi "${groupName}" grubundan çıkarılsın mı?`)) return;

    const next = enrollments.map((item) =>
      item.id === enrollmentId
        ? {
            ...item,
            status: "Ayrıldı",
            endDate: storage.todayISO()
          }
        : item
    );
    storage.setData(storage.KEYS.enrollments, next);
    if (window.CaYaEngine) window.CaYaEngine.runAll();

    window.CaYaAudit?.log(
      "groups",
      "remove",
      `Öğrenci gruptan çıkarıldı: ${studentName} → ${groupName} | Bitiş: ${app.formatDate(storage.todayISO())}`
    );

    app.toast("Öğrenci gruptan çıkarıldı.", "success");
    renderGroups();
    if (group) openGroupDetail(group.id);
  }

  function openAddStudentForm(groupId) {
    if (!app.access.canEdit("students") || !app.access.canEdit("groups")) return;
    const groups = storage.getData(storage.KEYS.groups, []);
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;

    const allStudents = storage.getData(storage.KEYS.students, []);
    const branches = storage.getData(storage.KEYS.branches, []);
    const branch = branches.find((b) => b.id === group.branchId);
    const branchFee = Number(branch?.monthlyFee || 0);
    const enrollments = storage.getData(storage.KEYS.enrollments, []);
    const existingStudentIds = new Set(
      enrollments
        .filter((item) => item.groupId === group.id && item.status === "Aktif")
        .map((item) => item.studentId)
    );
    const eligible = allStudents.filter(
      (student) => student.status === "Aktif" && !existingStudentIds.has(student.id)
    );
    const count = app.getGroupStudentCount(group.id);
    const capacity = Number(group.capacity || 0);

    if (capacity && count >= capacity) {
      app.toast("Grup kapasitesi dolu. Önce kapasiteyi artırın.", "error");
      return;
    }

    const sessions = app.groupSessions(group);

    app.openModal(`${group.name} grubuna öğrenci ekle`, `
      <form id="addStudentToGroupForm" class="form-card">
        <div class="form-grid">
          <label class="span-2">Öğrenci
            <input type="hidden" name="studentId" id="groupStudentId" />
            <div class="student-picker-field">
              <button type="button" class="btn" id="groupStudentPickerButton">Listeden öğrenci seç</button>
              <div id="groupStudentSelection" class="student-picker-selection"></div>
            </div>
          </label>
          <label>Başlangıç tarihi<input type="date" name="startDate" value="${storage.todayISO()}" required /></label>
          <label>Bitiş tarihi<input type="date" name="endDate" value="${storage.addDays(30)}" required /></label>
          <label class="span-2">Bu öğrenci için aylık ücret
            <input name="customFee" type="number" min="0" step="1" placeholder="Branş varsayılanı: ${branchFee || 'tanımsız'}" />
          </label>
          <label class="span-2">Not<input name="note" placeholder="Kayıt notu" /></label>
        </div>
        <p class="muted" style="margin-top: 10px;">Grup programı: ${sessions.length ? sessions.map((s) => `${s.day} ${s.startTime}-${s.endTime}`).join(" · ") : "Tanımsız"}</p>
        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Gruba ekle</button>
        </div>
      </form>
    `, { size: "small" });

    if (!eligible.length) {
      app.$("#addStudentToGroupForm").innerHTML = `
        <p class="muted">Bu gruba eklenebilecek aktif öğrenci bulunamadı. Önce öğrenci ekleyin veya başka bir öğrencinin grup kaydını sonlandırın.</p>
        <div class="form-actions"><button type="button" class="btn" data-modal-close>Kapat</button></div>
      `;
      return;
    }

    const studentInput = app.$("#groupStudentId");
    const studentSelection = app.$("#groupStudentSelection");
    const studentLookup = new Map(eligible.map((student) => [student.id, student]));
    const syncSelectedStudent = (studentId) => {
      const student = studentLookup.get(studentId) || null;
      if (studentInput) studentInput.value = student ? student.id : "";
      if (studentSelection) {
        studentSelection.innerHTML = selectedStudentCardHtml(student, "Henüz öğrenci seçilmedi.");
        app.hydrateStudentPhotos(app.$("#modal-root"));
      }
    };

    app.$("#groupStudentPickerButton")?.addEventListener("click", () => {
      app.openStudentPicker({
        title: "Öğrenci seç",
        description: `${group.name} grubu için aktif öğrencileri alfabetik listeden seçin.`,
        students: eligible,
        selectedId: studentInput?.value || "",
        emptyMessage: "Bu gruba eklenebilecek öğrenci bulunamadı.",
        renderMeta: (student) => student.phone || student.email || "İletişim bilgisi yok",
        onSelect: (student) => {
          syncSelectedStudent(student.id);
          return true;
        }
      });
    });

    syncSelectedStudent("");

    app.$("#addStudentToGroupForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const studentId = String(data.get("studentId") || "");
      const customFeeRaw = String(data.get("customFee") || "").trim();
      if (!studentId) {
        app.toast("Öğrenci seçilmedi.", "error");
        return;
      }

      const enrollment = {
        id: storage.generateId("enr"),
        studentId,
        branchId: group.branchId,
        groupId: group.id,
        startDate: String(data.get("startDate") || storage.todayISO()),
        endDate: String(data.get("endDate") || ""),
        membershipType: "Aylık üyelik",
        status: "Aktif",
        note: String(data.get("note") || "").trim(),
        customFee: customFeeRaw === "" ? null : Number(customFeeRaw)
      };

      const next = [...storage.getData(storage.KEYS.enrollments, []), enrollment];
      storage.setData(storage.KEYS.enrollments, next);
      if (window.CaYaEngine) window.CaYaEngine.runAll();
      app.closeModal();
      renderGroupsPage();
      app.toast("Öğrenci gruba eklendi. Aylık ödeme planı otomatik oluşturuldu.", "success");
      const _addedSt = allStudents.find(s => s.id === studentId);
      window.CaYaAudit?.log("groups", "add", `Öğrenci gruba eklendi: ${_addedSt ? app.getStudentName(_addedSt) : studentId} → ${group.name} | Başlangıç: ${app.formatDate(enrollment.startDate)} | Bitiş: ${app.formatDate(enrollment.endDate)}`);
    });
  }

  app.registerPage("groups", renderGroupsPage);
})();
