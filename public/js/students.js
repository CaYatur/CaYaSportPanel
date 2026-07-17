(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;

  const studentStatuses = ["Aktif", "Pasif", "Dondurulmuş", "Borçlu", "Ayrıldı"];
  const genderOptions = ["Kadın", "Erkek"];
  const membershipTypes = ["Aylık üyelik", "3 aylık üyelik", "6 aylık üyelik", "Yıllık üyelik", "Ders paketi", "Özel ders", "Deneme dersi"];
  const weekDays = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

  function scheduleTotalHours(schedule) {
    return (schedule || []).reduce((sum, item) => {
      if (!item.startTime || !item.endTime) return sum;
      const [sh, sm] = String(item.startTime).split(":").map(Number);
      const [eh, em] = String(item.endTime).split(":").map(Number);
      const diff = (eh * 60 + em - sh * 60 - sm) / 60;
      return sum + (Number.isFinite(diff) && diff > 0 ? diff : 0);
    }, 0);
  }

  function scheduleSummary(schedule) {
    if (!schedule || !schedule.length) return "Program yok";
    return schedule
      .map((item) => `${item.day} ${item.startTime || "?"}-${item.endTime || "?"}`)
      .join(" · ");
  }

  function optionList(items, selectedValue) {
    return items.map((item) => `<option value="${app.escapeHtml(item)}" ${item === selectedValue ? "selected" : ""}>${app.escapeHtml(item)}</option>`).join("");
  }

  const duplicateCheckFields = [
    { key: "phone", label: "Öğrenci telefonu", type: "phone" },
    { key: "email", label: "E-posta", type: "email" },
    { key: "guardianPhone", label: "Veli telefonu", type: "phone" },
    { key: "motherPhone", label: "Anne GSM", type: "phone" },
    { key: "fatherPhone", label: "Baba GSM", type: "phone" },
    { key: "emergencyPhone", label: "Acil durum telefonu", type: "phone" }
  ];

  function normalizeComparableText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
  }

  function normalizePhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("90") && digits.length === 12) digits = digits.slice(2);
    if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
    return digits.length >= 7 ? digits : "";
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLocaleLowerCase("tr-TR");
  }

  function normalizeFieldValue(value, type) {
    if (type === "phone") return normalizePhone(value);
    if (type === "email") return normalizeEmail(value);
    return normalizeComparableText(value);
  }

  function uniqueStudentValues(students, keys) {
    const seen = new Set();
    const values = [];
    students.forEach((student) => {
      keys.forEach((key) => {
        const value = String(student[key] || "").replace(/\s+/g, " ").trim();
        const normalized = normalizeComparableText(value);
        if (!value || seen.has(normalized)) return;
        seen.add(normalized);
        values.push(value);
      });
    });
    return values.sort((a, b) => a.localeCompare(b, "tr"));
  }

  function dataList(id, values) {
    return `<datalist id="${id}">${values.map((value) => `<option value="${app.escapeHtml(value)}"></option>`).join("")}</datalist>`;
  }

  function inferGuardianRelation(student) {
    const guardianName = normalizeComparableText(student?.guardianName);
    const guardianPhone = normalizePhone(student?.guardianPhone);
    if (!guardianName && !guardianPhone) return "other";

    const motherMatches = (
      (guardianName && guardianName === normalizeComparableText(student?.motherName)) ||
      (guardianPhone && guardianPhone === normalizePhone(student?.motherPhone))
    );
    if (motherMatches) return "mother";

    const fatherMatches = (
      (guardianName && guardianName === normalizeComparableText(student?.fatherName)) ||
      (guardianPhone && guardianPhone === normalizePhone(student?.fatherPhone))
    );
    if (fatherMatches) return "father";

    return "other";
  }

  function contactNamesForPhone(student, phoneKey) {
    const namesByPhoneField = {
      guardianPhone: ["guardianName"],
      motherPhone: ["motherName"],
      fatherPhone: ["fatherName"],
      emergencyPhone: ["emergencyContact"],
      phone: ["guardianName", "motherName", "fatherName", "emergencyContact"]
    };
    return (namesByPhoneField[phoneKey] || [])
      .map((nameKey) => normalizeComparableText(student[nameKey]))
      .filter(Boolean);
  }

  function sameKnownContactOwner(left, leftPhoneKey, right, rightPhoneKey) {
    const leftNames = contactNamesForPhone(left, leftPhoneKey);
    const rightNames = new Set(contactNamesForPhone(right, rightPhoneKey));
    return leftNames.some((name) => rightNames.has(name));
  }

  function findDuplicateStudentData(record, currentStudentId, students) {
    const issues = [];
    const currentName = normalizeComparableText(`${record.firstName} ${record.lastName}`);
    const currentBirthDate = String(record.birthDate || "");

    if (currentName && currentBirthDate) {
      const sameIdentity = students.find((student) =>
        student.id !== currentStudentId &&
        normalizeComparableText(`${student.firstName} ${student.lastName}`) === currentName &&
        String(student.birthDate || "") === currentBirthDate
      );
      if (sameIdentity) {
        issues.push(`Aynı ad, soyad ve doğum tarihi ile kayıt var: ${app.getStudentName(sameIdentity)}.`);
      }
    }

    duplicateCheckFields.forEach((field) => {
      const value = normalizeFieldValue(record[field.key], field.type);
      if (!value) return;
      const sameStudent = students.find((student) => {
        if (student.id === currentStudentId) return false;
        return duplicateCheckFields.some((candidate) => {
          if (candidate.type !== field.type || normalizeFieldValue(student[candidate.key], candidate.type) !== value) return false;
          return field.type !== "phone" || !sameKnownContactOwner(record, field.key, student, candidate.key);
        });
      });
      if (sameStudent) {
        issues.push(`${field.label} başka bir kayıtta kullanılıyor: ${app.getStudentName(sameStudent)}.`);
      }
    });

    const usedInForm = new Map();
    duplicateCheckFields
      .filter((field) => field.type === "phone")
      .forEach((field) => {
        const value = normalizePhone(record[field.key]);
        if (!value) return;
        const existing = usedInForm.get(value);
        if (existing && !sameKnownContactOwner(record, field.key, record, existing.key)) {
          issues.push(`${field.label}, bu form içinde ${existing.label} ile aynı olamaz.`);
        } else {
          usedInForm.set(value, field);
        }
      });

    return [...new Set(issues)];
  }

  function getStudentEnrollments(studentId) {
    return storage.getData(storage.KEYS.enrollments, []).filter((item) => item.studentId === studentId);
  }

  function studentBranchChips(studentId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const enrollments = getStudentEnrollments(studentId).filter((item) => item.status === "Aktif");
    const unique = [...new Set(enrollments.map((item) => item.branchId))];
    if (!unique.length) return '<span class="muted">Kayıt yok</span>';
    return unique
      .map((branchId) => {
        const branch = branches.find((item) => item.id === branchId);
        if (!branch) return "";
        return `<span class="chip color-dot" style="--chip-color:${branch.color}">${app.escapeHtml(branch.name)}</span>`;
      })
      .join(" ");
  }

  function filteredStudents() {
    const search = (app.$("#studentSearch")?.value || "").toLocaleLowerCase("tr-TR");
    const status = app.$("#studentStatusFilter")?.value || "";
    const branchId = app.$("#studentBranchFilter")?.value || "";
    const groupId = app.$("#studentGroupFilter")?.value || "";
    const enrollments = storage.getData(storage.KEYS.enrollments, []);

    return storage.getData(storage.KEYS.students, []).filter((student) => {
      const haystack = [
        student.id,
        student.firstName,
        student.lastName,
        student.phone,
        student.email,
        student.guardianName,
        student.guardianPhone,
        student.motherName,
        student.motherPhone,
        student.fatherName,
        student.fatherPhone
      ].join(" ").toLocaleLowerCase("tr-TR");
      const matchesSearch = !search || haystack.includes(search);
      const matchesStatus = !status || student.status === status;
      const matchesBranch = !branchId || enrollments.some((enrollment) => enrollment.studentId === student.id && enrollment.branchId === branchId && enrollment.status === "Aktif");
      const matchesGroup = !groupId || enrollments.some((enrollment) => enrollment.studentId === student.id && enrollment.groupId === groupId && enrollment.status === "Aktif");
      return matchesSearch && matchesStatus && matchesBranch && matchesGroup;
    });
  }

  function studentGroupFilterOptions(branchId, selectedGroupId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage
      .getData(storage.KEYS.groups, [])
      .filter((group) => !branchId || group.branchId === branchId)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr"));

    return `
      <option value="">Tüm gruplar</option>
      ${groups
        .map((group) => {
          const branch = branches.find((item) => item.id === group.branchId);
          const label = branch ? `${group.name} (${branch.name})` : group.name;
          return `<option value="${app.escapeHtml(group.id)}" ${group.id === selectedGroupId ? "selected" : ""}>${app.escapeHtml(label)}</option>`;
        })
        .join("")}
    `;
  }

  function latestAttendanceForStudent(studentId) {
    const records = storage
      .getData(storage.KEYS.attendance, [])
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return records[0] || null;
  }

  function nextOpenPaymentForStudent(studentId) {
    return storage
      .normalizePayments(storage.getData(storage.KEYS.payments, []))
      .filter((payment) => payment.studentId === studentId && !payment.deleted && payment.status !== "İptal" && Number(payment.remainingAmount || 0) > 0)
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")))[0] || null;
  }

  function renderRows() {
    const tbody = app.$("#studentsTbody");
    if (!tbody) return;
    const rows = filteredStudents();
    const canPay = app.access.canView("payments");
    const canEdit = app.access.canEdit("students");
    const searchActive = Boolean((app.$("#studentSearch")?.value || "").trim());

    tbody.innerHTML = rows.length
      ? rows
          .map((student) => {
            const payment = app.paymentSummaryForStudent(student.id);
            const nextPayment = canPay ? nextOpenPaymentForStudent(student.id) : null;
            const lastAttendance = latestAttendanceForStudent(student.id);
            const attendanceRatio = app.attendanceRatio(student.id);
            return `
              <tr>
                <td>
                  <div class="student-line">
                    ${app.studentAvatar(student)}
                    <div>
                      <strong>${app.escapeHtml(app.getStudentName(student))}</strong>
                      <br />
                      <small class="muted">${app.escapeHtml(student.id)}</small>
                    </div>
                  </div>
                </td>
                <td>${app.escapeHtml(student.phone || "-")}<br /><small class="muted">${app.escapeHtml(student.email || "-")}</small></td>
                <td>${app.statusBadge(student.status)}</td>
                <td>${studentBranchChips(student.id)}</td>
                ${canPay ? `<td>
                  <strong>${app.formatCurrency(payment.remaining)}</strong>
                  <br />
                  <small class="muted">${payment.overdue} gecikme${nextPayment ? ` · sıra: ${app.formatDate(nextPayment.dueDate)}` : ""}</small>
                </td>` : ""}
                <td>
                  <strong>%${attendanceRatio}</strong>
                  <br />
                  <small class="muted">${lastAttendance ? `${app.formatDate(lastAttendance.date)} · ${app.escapeHtml(lastAttendance.status || "-")}` : "Yoklama yok"}</small>
                </td>
                <td>${app.formatDate(student.registrationDate)}</td>
                <td>
                  <div class="actions">
                    <button class="btn ${searchActive ? "btn-primary" : "btn-ghost"}" data-action="detail" data-id="${student.id}">${searchActive ? "Ödeme / Yoklama" : "Detay"}</button>
                    ${canEdit ? `<button class="btn" data-action="edit" data-id="${student.id}">Düzenle</button>` : ""}
                    ${canEdit ? (student.status === "Aktif"
                      ? `<button class="btn btn-warning" data-action="passive" data-id="${student.id}">Pasife al</button>`
                      : `<button class="btn btn-primary" data-action="activate" data-id="${student.id}">Aktife al</button>`) : ""
                    }
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="${app.access.canView("payments") ? 8 : 7}">${app.emptyState("Filtrelere uygun öğrenci bulunamadı.")}</td></tr>`;
    app.hydrateStudentPhotos(tbody);
  }

  function renderStudentsPage() {
    const root = app.$("#page-content");
    if (!root) return;
    const branches = storage.getData(storage.KEYS.branches, []);

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Öğrenci Yönetimi</h2>
          <p>Öğrenci bilgileri, branş kayıtları, ödeme ve devam geçmişi.</p>
        </div>
        <button class="btn btn-primary" id="newStudentButton">Yeni öğrenci</button>
      </section>

      <section class="toolbar">
        <div class="filters">
          <input id="studentSearch" type="search" placeholder="Ad, telefon, veli veya e-posta ara" />
          <select id="studentStatusFilter">
            <option value="">Tüm durumlar</option>
            ${studentStatuses.map((status) => `<option value="${status}">${status}</option>`).join("")}
          </select>
          <select id="studentBranchFilter">
            <option value="">Tüm branşlar</option>
            ${branches.map((branch) => `<option value="${branch.id}">${app.escapeHtml(branch.name)}</option>`).join("")}
          </select>
          <select id="studentGroupFilter">
            ${studentGroupFilterOptions("", "")}
          </select>
        </div>
      </section>

      <section class="table-panel">
        <div class="table-header">
          <h3>Öğrenci Listesi</h3>
          <span class="chip" id="studentCount"></span>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>İletişim</th>
                <th>Durum</th>
                <th>Kayıtlı branşlar</th>
                ${app.access.canView("payments") ? "<th>Ödeme durumu</th>" : ""}
                <th>Devam</th>
                <th>Kayıt tarihi</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody id="studentsTbody"></tbody>
          </table>
        </div>
      </section>
    `;

    app.$("#newStudentButton").addEventListener("click", () => openStudentForm());
    const updateStudentCount = () => {
      app.$("#studentCount").textContent = `${filteredStudents().length} kayıt`;
    };
    const refreshList = () => {
      renderRows();
      updateStudentCount();
    };
    const refreshGroupFilter = () => {
      const branchId = app.$("#studentBranchFilter")?.value || "";
      const groupSelect = app.$("#studentGroupFilter");
      if (!groupSelect) return;
      const currentGroupId = groupSelect.value || "";
      const groups = storage.getData(storage.KEYS.groups, []).filter((group) => !branchId || group.branchId === branchId);
      const selectedGroupId = groups.some((group) => group.id === currentGroupId) ? currentGroupId : "";
      groupSelect.innerHTML = studentGroupFilterOptions(branchId, selectedGroupId);
      groupSelect.value = selectedGroupId;
    };

    app.$("#studentBranchFilter").addEventListener("input", () => {
      refreshGroupFilter();
      refreshList();
    });

    ["#studentSearch", "#studentStatusFilter", "#studentGroupFilter"].forEach((selector) => {
      app.$(selector).addEventListener("input", () => {
        refreshList();
      });
    });

    app.$("#studentsTbody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "detail") openStudentDetail(id);
      if (button.dataset.action === "edit") openStudentForm(id);
      if (button.dataset.action === "passive") makeStudentPassive(id);
      if (button.dataset.action === "activate") makeStudentActive(id);
    });

    renderRows();
    updateStudentCount();
  }

  function studentFormHtml(student) {
    const students = storage.getData(storage.KEYS.students, []);
    const item = student || {
      status: "Aktif",
      registrationDate: storage.todayISO(),
      kvkkConsent: false,
      communicationConsent: false
    };
    const firstNameOptions = uniqueStudentValues(students, ["firstName"]);
    const lastNameOptions = uniqueStudentValues(students, ["lastName"]);
    const phoneOptions = uniqueStudentValues(students, ["phone", "guardianPhone", "motherPhone", "fatherPhone", "emergencyPhone"]);
    const emailOptions = uniqueStudentValues(students, ["email"]);
    const guardianNameOptions = uniqueStudentValues(students, ["guardianName", "motherName", "fatherName", "emergencyContact"]);
    const jobOptions = uniqueStudentValues(students, ["motherJob", "fatherJob"]);
    const guardianRelation = item.guardianRelation || inferGuardianRelation(item);

    return `
      <form id="studentForm" class="form-card">
        <div class="form-grid">
          <label>Ad<input name="firstName" list="studentFirstNameOptions" autocomplete="given-name" value="${app.escapeHtml(item.firstName || "")}" required /></label>
          <label>Soyad<input name="lastName" list="studentLastNameOptions" autocomplete="family-name" value="${app.escapeHtml(item.lastName || "")}" required /></label>
          <label>Telefon<input name="phone" type="tel" list="studentPhoneOptions" autocomplete="tel" value="${app.escapeHtml(item.phone || "")}" /></label>
          <label>E-posta<input name="email" type="email" list="studentEmailOptions" autocomplete="email" value="${app.escapeHtml(item.email || "")}" /></label>
          <label>Doğum tarihi<input name="birthDate" type="date" value="${app.escapeHtml(item.birthDate || "")}" /></label>
          <label>Cinsiyet<select name="gender"><option value="">Seçiniz</option>${optionList(genderOptions, item.gender)}</select></label>
          <label>Boy (cm) <small class="muted">(yaklaşık)</small><input name="height" type="number" min="0" step="1" value="${app.escapeHtml(item.height || "")}" placeholder="örn. 90" /></label>
          <label>Kilo (kg) <small class="muted">(yaklaşık)</small><input name="weight" type="number" min="0" step="0.1" value="${app.escapeHtml(item.weight || "")}" placeholder="örn. 14" /></label>
          <label class="span-2">Herhangi bir rahatsızlığı var mı? <small class="muted">(isteğe bağlı)</small><textarea name="healthCondition" placeholder="Varsa belirtin, yoksa boş bırakın">${app.escapeHtml(item.healthCondition || "")}</textarea></label>
          <label>Kayıt tarihi<input name="registrationDate" type="date" value="${app.escapeHtml(item.registrationDate || storage.todayISO())}" /></label>
          <label>Durum<select name="status">${optionList(studentStatuses, item.status)}</select></label>
          <div class="span-2 student-photo-field">
            <div id="studentPhotoPreview">${app.studentAvatar(item, "student-avatar-xl")}</div>
            <div class="student-photo-controls">
              <label>Öğrenci fotoğrafı<input id="studentPhotoFile" name="photoFile" type="file" accept="image/jpeg,image/png,image/webp" /></label>
              <div id="studentPhotoStatus" class="photo-upload-message muted">Dosya seçildiğinde yükleme hemen başlar. JPG, PNG veya WebP; en fazla 5 MB.</div>
              <div id="studentPhotoProgress" class="photo-upload-progress" hidden aria-hidden="true">
                <span id="studentPhotoProgressBar"></span>
                <strong id="studentPhotoProgressText">%0</strong>
              </div>
              <label id="removeStudentPhotoRow" class="checkbox-row" ${item.photo ? "" : "hidden"}><input id="removeStudentPhoto" type="checkbox" name="removePhoto" /> Fotoğraf kaldırılsın</label>
            </div>
          </div>
          <label class="span-2">Adres<textarea name="address">${app.escapeHtml(item.address || "")}</textarea></label>
          <label>Veli seçimi
            <select name="guardianRelation" id="guardianRelation">
              <option value="mother" ${guardianRelation === "mother" ? "selected" : ""}>Anne</option>
              <option value="father" ${guardianRelation === "father" ? "selected" : ""}>Baba</option>
              <option value="other" ${guardianRelation === "other" ? "selected" : ""}>Diğer</option>
            </select>
          </label>
          <label>Veli adı<input name="guardianName" list="studentGuardianNameOptions" value="${app.escapeHtml(item.guardianName || "")}" /></label>
          <label class="span-2">Veli telefonu<input name="guardianPhone" type="tel" list="studentPhoneOptions" value="${app.escapeHtml(item.guardianPhone || "")}" /></label>
          <div class="span-2 form-heading"><h3>Anne bilgileri <small class="muted">(isteğe bağlı)</small></h3></div>
          <label>Anne adı soyadı<input name="motherName" list="studentGuardianNameOptions" value="${app.escapeHtml(item.motherName || "")}" /></label>
          <label>Anne mesleği<input name="motherJob" list="studentJobOptions" value="${app.escapeHtml(item.motherJob || "")}" /></label>
          <label class="span-2">Anne GSM<input name="motherPhone" type="tel" list="studentPhoneOptions" value="${app.escapeHtml(item.motherPhone || "")}" /></label>
          <div class="span-2 form-heading"><h3>Baba bilgileri <small class="muted">(isteğe bağlı)</small></h3></div>
          <label>Baba adı soyadı<input name="fatherName" list="studentGuardianNameOptions" value="${app.escapeHtml(item.fatherName || "")}" /></label>
          <label>Baba mesleği<input name="fatherJob" list="studentJobOptions" value="${app.escapeHtml(item.fatherJob || "")}" /></label>
          <label class="span-2">Baba GSM<input name="fatherPhone" type="tel" list="studentPhoneOptions" value="${app.escapeHtml(item.fatherPhone || "")}" /></label>
          <label>Acil durum kişisi<input name="emergencyContact" list="studentGuardianNameOptions" value="${app.escapeHtml(item.emergencyContact || "")}" /></label>
          <label>Acil durum telefonu<input name="emergencyPhone" type="tel" list="studentPhoneOptions" value="${app.escapeHtml(item.emergencyPhone || "")}" /></label>
          <label class="span-2">Notlar<textarea name="notes">${app.escapeHtml(item.notes || "")}</textarea></label>
          <label class="checkbox-row"><input type="checkbox" name="kvkkConsent" ${item.kvkkConsent ? "checked" : ""} /> KVKK onayı alındı</label>
          <label class="checkbox-row"><input type="checkbox" name="communicationConsent" ${item.communicationConsent ? "checked" : ""} /> İletişim izni var</label>
          <label class="checkbox-row span-2"><input type="checkbox" name="mediaConsent" ${item.mediaConsent ? "checked" : ""} /> Fotoğraf ve videoların sosyal medya hesabında / etkinliklerde paylaşılmasına izin veriyorum</label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">Kaydet</button>
        </div>
        ${dataList("studentFirstNameOptions", firstNameOptions)}
        ${dataList("studentLastNameOptions", lastNameOptions)}
        ${dataList("studentPhoneOptions", phoneOptions)}
        ${dataList("studentEmailOptions", emailOptions)}
        ${dataList("studentGuardianNameOptions", guardianNameOptions)}
        ${dataList("studentJobOptions", jobOptions)}
      </form>
    `;
  }

  function openStudentForm(studentId) {
    const students = storage.getData(storage.KEYS.students, []);
    const student = students.find((item) => item.id === studentId);
    const draftStudentId = student ? student.id : storage.generateId("std");
    app.openModal(student ? "Öğrenci düzenle" : "Yeni öğrenci", studentFormHtml(student));

    const modalRoot = app.$("#modal-root");
    const form = app.$("#studentForm");
    const photoPreview = app.$("#studentPhotoPreview");
    const photoInput = app.$("#studentPhotoFile");
    const photoStatus = app.$("#studentPhotoStatus");
    const photoProgress = app.$("#studentPhotoProgress");
    const photoProgressBar = app.$("#studentPhotoProgressBar");
    const photoProgressText = app.$("#studentPhotoProgressText");
    const removePhotoInput = app.$("#removeStudentPhoto");
    const removePhotoRow = app.$("#removeStudentPhotoRow");
    const submitButton = form?.querySelector('button[type="submit"]');
    const guardianRelationSelect = form?.elements.guardianRelation;
    const guardianNameInput = form?.elements.guardianName;
    const guardianPhoneInput = form?.elements.guardianPhone;
    const motherNameInput = form?.elements.motherName;
    const motherPhoneInput = form?.elements.motherPhone;
    const fatherNameInput = form?.elements.fatherName;
    const fatherPhoneInput = form?.elements.fatherPhone;

    let pendingPhoto = null;
    let uploadPromise = null;
    let modalCommitted = false;

    const detachModalCleanup = () => {
      modalRoot?.removeEventListener("click", handleModalExitClick, true);
      document.removeEventListener("keydown", handleModalEscape, true);
    };

    const renderAvatar = (photo) => {
      if (!photoPreview || !form) return;
      photoPreview.innerHTML = app.studentAvatar({
        firstName: String(form.elements.firstName?.value || student?.firstName || ""),
        lastName: String(form.elements.lastName?.value || student?.lastName || ""),
        photo: photo || null
      }, "student-avatar-xl");
      app.hydrateStudentPhotos(photoPreview);
    };

    const setPhotoStatus = (message, tone) => {
      if (!photoStatus) return;
      photoStatus.className = `photo-upload-message ${tone || "muted"}`;
      photoStatus.textContent = message;
    };

    const setPhotoProgress = (percent, active, label) => {
      if (!photoProgress || !photoProgressBar || !photoProgressText) return;
      photoProgress.hidden = !active;
      photoProgress.setAttribute("aria-hidden", active ? "false" : "true");
      const normalizedPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
      photoProgressBar.style.width = `${active ? normalizedPercent : 0}%`;
      photoProgressText.textContent = active ? (label || `%${normalizedPercent}`) : "";
    };

    const syncGuardianFromRelation = () => {
      if (!guardianRelationSelect || !guardianNameInput || !guardianPhoneInput) return;
      const relation = guardianRelationSelect.value || "other";
      const linked = relation === "mother" || relation === "father";
      if (relation === "mother") {
        guardianNameInput.value = motherNameInput?.value || "";
        guardianPhoneInput.value = motherPhoneInput?.value || "";
      } else if (relation === "father") {
        guardianNameInput.value = fatherNameInput?.value || "";
        guardianPhoneInput.value = fatherPhoneInput?.value || "";
      }
      guardianNameInput.readOnly = linked;
      guardianPhoneInput.readOnly = linked;
    };

    const showRemovePhoto = (visible) => {
      if (removePhotoRow) removePhotoRow.hidden = !visible;
    };

    const deleteDraftPhoto = () => {
      if (!pendingPhoto || modalCommitted) return;
      const photo = pendingPhoto;
      pendingPhoto = null;
      storage.deleteStudentImage(photo).catch(() => {});
    };

    const handleModalExitClick = (event) => {
      const backdrop = modalRoot?.querySelector(".modal-backdrop");
      if (event.target === backdrop || event.target.closest("[data-modal-close]")) {
        detachModalCleanup();
        if (uploadPromise) {
          uploadPromise.then(() => deleteDraftPhoto()).catch(() => {});
        } else {
          deleteDraftPhoto();
        }
      }
    };

    const handleModalEscape = (event) => {
      if (event.key !== "Escape") return;
      detachModalCleanup();
      if (uploadPromise) {
        uploadPromise.then(() => deleteDraftPhoto()).catch(() => {});
      } else {
        deleteDraftPhoto();
      }
    };

    modalRoot?.addEventListener("click", handleModalExitClick, true);
    document.addEventListener("keydown", handleModalEscape, true);

    app.hydrateStudentPhotos(modalRoot);
    renderAvatar(student?.photo || null);
    showRemovePhoto(Boolean(student?.photo));
    setPhotoProgress(0, false);

    const uploadPhotoImmediately = async (file) => {
      if (!file) return;
      if (file.size > PHOTO_MAX_BYTES) {
        setPhotoStatus("Seçilen dosya 5 MB sınırını aşıyor. Daha küçük bir görsel seçin.", "error");
        setPhotoProgress(0, false);
        if (photoInput) photoInput.value = "";
        return;
      }

      if (removePhotoInput) removePhotoInput.checked = false;
      if (pendingPhoto) {
        storage.deleteStudentImage(pendingPhoto).catch(() => {});
        pendingPhoto = null;
      }

      setPhotoStatus(`"${file.name}" yükleniyor...`, "info");
      setPhotoProgress(0, true);
      if (submitButton) submitButton.disabled = true;
      if (photoInput) photoInput.disabled = true;

      uploadPromise = storage.uploadStudentImage(draftStudentId, file, {
        onProgress: (percent) => setPhotoProgress(percent, true)
      });

      try {
        pendingPhoto = await uploadPromise;
        renderAvatar(pendingPhoto);
        showRemovePhoto(true);
        setPhotoStatus("Yükleme tamamlandı. Kaydettiğinizde öğrenciye atanacak.", "success");
        setPhotoProgress(100, true, "Yükleme tamamlandı");
      } catch (error) {
        renderAvatar(student?.photo || null);
        setPhotoStatus(error.message || "Fotoğraf yüklenemedi.", "error");
        setPhotoProgress(0, false);
      } finally {
        uploadPromise = null;
        if (submitButton) submitButton.disabled = false;
        if (photoInput) {
          photoInput.disabled = false;
          photoInput.value = "";
        }
      }
    };

    photoInput?.addEventListener("change", () => {
      const file = photoInput.files?.[0] || null;
      if (!file) return;
      uploadPhotoImmediately(file);
    });

    guardianRelationSelect?.addEventListener("change", syncGuardianFromRelation);
    [motherNameInput, motherPhoneInput, fatherNameInput, fatherPhoneInput].forEach((input) => {
      input?.addEventListener("input", syncGuardianFromRelation);
    });
    syncGuardianFromRelation();

    removePhotoInput?.addEventListener("change", () => {
      if (!removePhotoInput.checked) {
        renderAvatar(pendingPhoto || student?.photo || null);
        setPhotoStatus(pendingPhoto ? "Yükleme tamamlandı. Kaydettiğinizde öğrenciye atanacak." : "Dosya seçildiğinde yükleme hemen başlar. JPG, PNG veya WebP; en fazla 5 MB.", pendingPhoto ? "success" : "muted");
        setPhotoProgress(pendingPhoto ? 100 : 0, Boolean(pendingPhoto), pendingPhoto ? "Yükleme tamamlandı" : "");
        return;
      }

      if (pendingPhoto) {
        storage.deleteStudentImage(pendingPhoto).catch(() => {});
        pendingPhoto = null;
      }
      renderAvatar(null);
      setPhotoStatus("Fotoğraf kaydettiğinizde kaldırılacak.", "warning");
      setPhotoProgress(0, false);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);

      if (uploadPromise) {
        setPhotoStatus("Fotoğraf yükleniyor. Lütfen yükleme tamamlanana kadar bekleyin.", "info");
        try {
          await uploadPromise;
        } catch (error) {
          return;
        }
      }

      const record = {
        id: draftStudentId,
        firstName: String(data.get("firstName") || "").trim(),
        lastName: String(data.get("lastName") || "").trim(),
        phone: String(data.get("phone") || "").trim(),
        email: String(data.get("email") || "").trim(),
        birthDate: String(data.get("birthDate") || ""),
        gender: String(data.get("gender") || ""),
        height: String(data.get("height") || "").trim(),
        weight: String(data.get("weight") || "").trim(),
        healthCondition: String(data.get("healthCondition") || "").trim(),
        address: String(data.get("address") || "").trim(),
        guardianRelation: String(data.get("guardianRelation") || "other"),
        guardianName: String(data.get("guardianName") || "").trim(),
        guardianPhone: String(data.get("guardianPhone") || "").trim(),
        motherName: String(data.get("motherName") || "").trim(),
        motherJob: String(data.get("motherJob") || "").trim(),
        motherPhone: String(data.get("motherPhone") || "").trim(),
        fatherName: String(data.get("fatherName") || "").trim(),
        fatherJob: String(data.get("fatherJob") || "").trim(),
        fatherPhone: String(data.get("fatherPhone") || "").trim(),
        emergencyContact: String(data.get("emergencyContact") || "").trim(),
        emergencyPhone: String(data.get("emergencyPhone") || "").trim(),
        registrationDate: String(data.get("registrationDate") || storage.todayISO()),
        status: String(data.get("status") || "Aktif"),
        notes: String(data.get("notes") || "").trim(),
        kvkkConsent: data.get("kvkkConsent") === "on",
        communicationConsent: data.get("communicationConsent") === "on",
        mediaConsent: data.get("mediaConsent") === "on",
        photo: student?.photo || null
      };

      if (!record.firstName || !record.lastName) {
        app.toast("Sadece ad ve soyad zorunludur.", "error");
        return;
      }

      const duplicateIssues = findDuplicateStudentData(record, student?.id || "", students);
      if (duplicateIssues.length) {
        app.toast(duplicateIssues[0], "error");
        return;
      }

      const removePhoto = data.get("removePhoto") === "on";
      try {
        if (removePhoto) {
          if (student?.photo) await storage.deleteStudentImage(student.photo).catch(() => {});
          record.photo = null;
        } else if (pendingPhoto) {
          if (student?.photo && student.photo.id !== pendingPhoto.id) storage.deleteStudentImage(student.photo).catch(() => {});
          record.photo = pendingPhoto;
        }
      } catch (error) {
        setPhotoStatus(error.message || "Fotoğraf yüklenemedi.", "error");
        return;
      }

      const next = student ? students.map((item) => (item.id === student.id ? record : item)) : [...students, record];
      modalCommitted = true;
      detachModalCleanup();
      storage.setData(storage.KEYS.students, next);
      app.closeModal();
      renderStudentsPage();
      app.toast(student ? "Öğrenci kaydı güncellendi." : "Öğrenci kaydı eklendi.", "success");
      window.CaYaAudit?.log("students", student ? "edit" : "add", `Öğrenci ${student ? "güncellendi" : "eklendi"}: ${record.firstName} ${record.lastName} | Telefon: ${record.phone || "-"} | Durum: ${record.status}${!student ? ` | Kayıt: ${app.formatDate(record.registrationDate)}` : ""}`);
    });
  }

  function makeStudentPassive(studentId) {
    const students = storage.getData(storage.KEYS.students, []);
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    if (!confirm(`${app.getStudentName(student)} pasif hale alınsın mı?`)) return;

    storage.setData(
      storage.KEYS.students,
      students.map((item) => (item.id === studentId ? { ...item, status: "Pasif" } : item))
    );
    renderStudentsPage();
    app.toast("Öğrenci pasif hale alındı.", "success");
    window.CaYaAudit?.log("students", "passive", `Öğrenci pasifleştirildi: ${student.firstName} ${student.lastName} | Telefon: ${student.phone || "-"}`);
  }

  function makeStudentActive(studentId) {
    const students = storage.getData(storage.KEYS.students, []);
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    if (!confirm(`${app.getStudentName(student)} aktif hale alınsın mı?`)) return;

    storage.setData(
      storage.KEYS.students,
      students.map((item) => (item.id === studentId ? { ...item, status: "Aktif" } : item))
    );
    renderStudentsPage();
    app.toast("Öğrenci aktif hale alındı.", "success");
    window.CaYaAudit?.log("students", "activate", `Öğrenci aktifleştirildi: ${student.firstName} ${student.lastName} | Telefon: ${student.phone || "-"}`);
  }

  function enrollmentFormHtml(student, editingEnrollment) {
    const allStoredBranches = storage.getData(storage.KEYS.branches, []);
    const allStoredGroups = storage.getData(storage.KEYS.groups, []);
    const editing = editingEnrollment || null;
    const selectedBranchId = editing?.branchId || "";
    const selectedGroupId = editing?.groupId || "";

    // When editing, always include the currently assigned branch/group even if inactive
    const activeBranches = allStoredBranches.filter((b) => b.status === "Aktif");
    const branches = (editing && selectedBranchId && !activeBranches.some((b) => b.id === selectedBranchId))
      ? [...activeBranches, allStoredBranches.find((b) => b.id === selectedBranchId)].filter(Boolean)
      : activeBranches;

    const activeGroups = allStoredGroups.filter((g) => g.status === "Aktif");
    const allGroups = (editing && selectedGroupId && !activeGroups.some((g) => g.id === selectedGroupId))
      ? [...activeGroups, allStoredGroups.find((g) => g.id === selectedGroupId)].filter(Boolean)
      : activeGroups;
    const selectedMembership = editing?.membershipType || "Aylık üyelik";
    const selectedStatus = editing?.status || "Aktif";
    const customFeeValue = editing && editing.customFee !== null && editing.customFee !== undefined ? editing.customFee : "";
    const startDateValue = editing?.startDate || storage.todayISO();
    const endDateValue = editing?.endDate || storage.addDays(30);
    const noteValue = editing?.note || "";

    const groupsByBranch = {};
    allGroups.forEach((group) => {
      if (!groupsByBranch[group.branchId]) groupsByBranch[group.branchId] = [];
      groupsByBranch[group.branchId].push(group);
    });

    return `
      <form id="enrollmentForm" class="form-card" data-edit-id="${editing ? editing.id : ""}">
        <div class="form-grid three">
          <label>Branş
            <select name="branchId" id="enrollmentBranch" required>
              <option value="">Seçiniz</option>
              ${branches.map((branch) => `<option value="${branch.id}" data-fee="${Number(branch.monthlyFee || 0)}" ${branch.id === selectedBranchId ? "selected" : ""}>${app.escapeHtml(branch.name)}${app.access.canView("payments") ? ` (${app.formatCurrency(branch.monthlyFee || 0)})` : ""}</option>`).join("")}
            </select>
          </label>
          <label>Grup <small class="muted">(zorunlu)</small>
            <select name="groupId" id="enrollmentGroup" required>
              <option value="">Önce branş seçin</option>
              ${allGroups.map((group) => `<option value="${group.id}" data-branch="${group.branchId}" ${group.id === selectedGroupId ? "selected" : ""}>${app.escapeHtml(group.name)}</option>`).join("")}
            </select>
          </label>
          <label>Üyelik tipi<select name="membershipType">${optionList(membershipTypes, selectedMembership)}</select></label>
          <label>Başlangıç<input type="date" name="startDate" value="${app.escapeHtml(startDateValue)}" required /></label>
          <label>Bitiş<input type="date" name="endDate" value="${app.escapeHtml(endDateValue)}" required /></label>
          <label>Durum<select name="status">${optionList(["Aktif", "Pasif", "Dondurulmuş"], selectedStatus)}</select></label>
          ${app.access.canView("payments") ? `<label class="span-2">
            <span>Bu öğrenci için aylık ücret <small class="muted">(boş bırakılırsa branş varsayılan ücreti kullanılır ve branş ücreti değişince otomatik güncellenir)</small></span>
            <input name="customFee" id="enrollmentCustomFee" type="number" min="0" step="1" placeholder="Branş varsayılanı" value="${app.escapeHtml(customFeeValue)}" />
          </label>` : ""}
          <label class="span-2">Not<input name="note" placeholder="Kayıt notu" value="${app.escapeHtml(noteValue)}" /></label>
        </div>

        <div id="enrollmentGroupPreview" style="margin-top: 14px;"></div>

        <div class="form-actions">
          ${editing ? `<button type="button" class="btn" id="cancelEditEnrollment">Yeni kayıt moduna dön</button>` : ""}
          <button class="btn btn-primary" type="submit">${editing ? "Kaydı güncelle" : "Branşa kaydet"}</button>
        </div>
      </form>
      <p class="muted">Öğrenci: ${app.escapeHtml(app.getStudentName(student))} ${editing ? `· <strong>Düzenleme modu: ${app.escapeHtml(editing.id)}</strong>` : ""}</p>
    `;
  }

  function renderGroupPreview(groupId) {
    const host = app.$("#enrollmentGroupPreview");
    if (!host) return;
    if (!groupId) {
      host.innerHTML = '<p class="muted">Grup seçildiğinde gün/saat bilgisi burada görünür. Gün ve saat grup üzerinden tanımlanır.</p>';
      return;
    }
    const group = storage.getData(storage.KEYS.groups, []).find((item) => item.id === groupId);
    if (!group) {
      host.innerHTML = '<p class="muted">Grup bulunamadı.</p>';
      return;
    }
    const sessions = app.groupSessions(group);
    const teacherNames = app.groupTeacherNames(group);
    host.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><span>Grup</span><strong>${app.escapeHtml(group.name)}</strong></div>
        <div class="detail-item"><span>Eğitmen(ler)</span><strong>${app.escapeHtml(teacherNames.join(", ") || "-")}</strong></div>
        <div class="detail-item"><span>Kapasite</span><strong>${app.getGroupStudentCount(group.id)} / ${group.capacity || "-"}</strong></div>
      </div>
      <div style="margin-top: 8px;">
        <strong>Ders programı:</strong>
        <div class="compact-list" style="padding: 0; margin-top: 6px;">
          ${
            sessions.length
              ? sessions.map((s) => `<div class="list-item"><div><strong>${app.escapeHtml(s.day)}</strong><small>${app.escapeHtml(s.startTime || "?")} - ${app.escapeHtml(s.endTime || "?")}</small></div></div>`).join("")
              : '<p class="muted">Bu grupta henüz ders günü tanımlanmamış.</p>'
          }
        </div>
      </div>
    `;
  }

  function renderEnrollmentList(studentId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage.getData(storage.KEYS.groups, []);
    const enrollments = getStudentEnrollments(studentId);
    if (!enrollments.length) return app.emptyState("Öğrencinin aktif veya geçmiş branş kaydı yok.");
    const canPay = app.access.canView("payments");

    return `
      <div class="table-scroll">
        <table>
          <thead><tr><th>Branş</th><th>Grup</th>${canPay ? "<th>Aylık ücret</th>" : ""}<th>Haftalık program</th><th>Üyelik</th><th>Tarih</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody>
            ${enrollments.map((item) => {
              const branch = branches.find((b) => b.id === item.branchId);
              const branchFee = Number(branch?.monthlyFee || 0);
              const customFee = item.customFee !== undefined && item.customFee !== null && item.customFee !== "" ? Number(item.customFee) : null;
              let feeLabel;
              if (customFee !== null) {
                feeLabel = `${app.formatCurrency(customFee)} <small class="muted">(özel - sabit)</small>`;
              } else if (branchFee > 0) {
                feeLabel = `${app.formatCurrency(branchFee)} <small class="muted">(branş varsayılanı - zam/indirimde güncellenir)</small>`;
              } else {
                feeLabel = `<span class="badge warning">Ücret tanımsız</span><br /><small class="muted">Branş ayarlarında ücret girin</small>`;
              }
              const group = groups.find((g) => g.id === item.groupId);
              const sessions = app.groupSessions(group);
              const sessionLabel = sessions.length
                ? sessions.map((s) => `${s.day} ${s.startTime || "?"}-${s.endTime || "?"}`).join(", ")
                : '<span class="muted">Grup programı tanımsız</span>';
              return `
                <tr>
                  <td>${app.escapeHtml(app.getBranchName(branches, item.branchId))}</td>
                  <td>${app.escapeHtml(app.getGroupName(groups, item.groupId))}</td>
                  ${canPay ? `<td>${feeLabel}</td>` : ""}
                  <td>${sessionLabel}</td>
                  <td>${app.escapeHtml(item.membershipType || "-")}</td>
                  <td>${app.formatDate(item.startDate)} - ${app.formatDate(item.endDate)}</td>
                  <td>${app.statusBadge(item.status)}</td>
                  <td>
                    <div class="actions">
                      ${app.access.canEdit("students") ? `
                      <button class="btn" type="button" data-enrollment-action="edit" data-enrollment-id="${item.id}">Düzenle</button>
                      <button class="btn btn-warning" type="button" data-enrollment-action="delete" data-enrollment-id="${item.id}">Sil</button>` : '<span class="muted">-</span>'}
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPaymentHistory(studentId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const payments = storage.normalizePayments(storage.getData(storage.KEYS.payments, [])).filter((item) => item.studentId === studentId && !item.deleted);
    if (!payments.length) return app.emptyState("Ödeme planı bulunamadı.");
    return `
      <div class="table-scroll">
        <table>
          <thead><tr><th>Branş</th><th>Toplam</th><th>Ödenen</th><th>Kalan</th><th>Son ödeme</th><th>Durum</th></tr></thead>
          <tbody>
            ${payments.map((payment) => `
              <tr>
                <td>${app.escapeHtml(app.getBranchName(branches, payment.branchId))}</td>
                <td>${app.formatCurrency(payment.totalAmount)}</td>
                <td>${app.formatCurrency(payment.paidAmount)}</td>
                <td>${app.formatCurrency(payment.remainingAmount)}</td>
                <td>${app.formatDate(payment.dueDate)}</td>
                <td>${app.statusBadge(payment.status)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderWeeklySchedule(studentId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage.getData(storage.KEYS.groups, []);
    const enrollments = getStudentEnrollments(studentId).filter((item) => item.status === "Aktif");
    const allSlots = [];
    enrollments.forEach((enrollment) => {
      const group = groups.find((g) => g.id === enrollment.groupId);
      if (!group) return;
      app.groupSessions(group).forEach((session) => {
        allSlots.push({ ...session, branchId: enrollment.branchId, groupName: group.name });
      });
    });

    if (!allSlots.length) {
      return app.emptyState("Bu öğrenci için haftalık program yok. Öğrenciyi bir gruba kaydedin — saatler gruptan otomatik gelir.");
    }

    const grouped = weekDays.map((day) => ({
      day,
      slots: allSlots
        .filter((slot) => slot.day === day)
        .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
    }));
    const totalHours = scheduleTotalHours(allSlots);

    return `
      <div class="detail-grid" style="margin-bottom: 12px;">
        <div class="detail-item"><span>Haftalık toplam</span><strong>${totalHours.toFixed(1)} saat</strong></div>
        <div class="detail-item"><span>Aktif kayıt</span><strong>${enrollments.length}</strong></div>
        <div class="detail-item"><span>Toplam seans</span><strong>${allSlots.length}</strong></div>
      </div>
      <div class="schedule-grid schedule-grid-wide">
        ${grouped
          .map((entry) => {
            const items = entry.slots
              .map((slot) => {
                const branch = branches.find((b) => b.id === slot.branchId);
                const color = branch?.color || "#dc2727";
                return `
                  <div class="schedule-item" style="border-left-color:${color}">
                    <strong>${app.escapeHtml(slot.startTime || "?")} - ${app.escapeHtml(slot.endTime || "?")}</strong>
                    <span>${app.escapeHtml(slot.groupName || "")}</span>
                    <small>${app.escapeHtml(branch ? branch.name : "Branş")}</small>
                  </div>
                `;
              })
              .join("");
            return `
              <div class="day-column">
                <h4>${entry.day}</h4>
                ${items || '<small class="muted">Ders yok</small>'}
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderAttendanceHistory(studentId) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage.getData(storage.KEYS.groups, []);
    const records = storage.getData(storage.KEYS.attendance, []).filter((item) => item.studentId === studentId).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!records.length) return app.emptyState("Yoklama geçmişi bulunamadı.");
    return `
      <div class="table-scroll">
        <table>
          <thead><tr><th>Tarih</th><th>Branş</th><th>Grup</th><th>Durum</th><th>Not</th></tr></thead>
          <tbody>
            ${records.map((record) => `
              <tr>
                <td>${app.formatDate(record.date)}</td>
                <td>${app.escapeHtml(app.getBranchName(branches, record.branchId))}</td>
                <td>${app.escapeHtml(app.getGroupName(groups, record.groupId))}</td>
                <td>${app.statusBadge(record.status)}</td>
                <td>${app.escapeHtml(record.note || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function studentFinanceAttendanceSummaryHtml(studentId) {
    const summary = app.paymentSummaryForStudent(studentId);
    const canPay = app.access.canView("payments");
    const nextPayment = canPay ? nextOpenPaymentForStudent(studentId) : null;
    const lastAttendance = latestAttendanceForStudent(studentId);
    const ratio = app.attendanceRatio(studentId);
    const recentAttendance = storage
      .getData(storage.KEYS.attendance, [])
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 3);

    return `
      <div class="grid two" style="margin: 14px 0;">
        ${canPay ? `
        <section class="table-panel">
          <div class="table-header">
            <h3>Ödeme bilgileri</h3>
            <span class="chip">${summary.overdue} gecikme</span>
          </div>
          <div class="detail-grid" style="padding: 12px;">
            <div class="detail-item"><span>Kalan borç</span><strong>${app.formatCurrency(summary.remaining)}</strong></div>
            <div class="detail-item"><span>Ödenen</span><strong>${app.formatCurrency(summary.paid)}</strong></div>
            <div class="detail-item"><span>Sıradaki vade</span><strong>${nextPayment ? app.formatDate(nextPayment.dueDate) : "-"}</strong></div>
            <div class="detail-item"><span>Sıradaki tutar</span><strong>${nextPayment ? app.formatCurrency(nextPayment.remainingAmount) : app.formatCurrency(0)}</strong></div>
          </div>
        </section>` : ""}
        <section class="table-panel">
          <div class="table-header">
            <h3>Yoklama bilgileri</h3>
            <span class="chip">%${ratio}</span>
          </div>
          <div class="detail-grid" style="padding: 12px;">
            <div class="detail-item"><span>Devam oranı</span><strong>%${ratio}</strong></div>
            <div class="detail-item"><span>Son yoklama</span><strong>${lastAttendance ? `${app.formatDate(lastAttendance.date)} · ${app.escapeHtml(lastAttendance.status || "-")}` : "Kayıt yok"}</strong></div>
          </div>
          ${recentAttendance.length ? `
          <div class="compact-list" style="padding: 0 12px 12px;">
            ${recentAttendance.map((record) => `
              <div class="list-item">
                <div>
                  <strong>${app.formatDate(record.date)}</strong>
                  <small>${app.escapeHtml(record.note || "Not yok")}</small>
                </div>
                ${app.statusBadge(record.status)}
              </div>
            `).join("")}
          </div>` : `<div style="padding: 0 12px 12px;">${app.emptyState("Yoklama kaydı yok.")}</div>`}
        </section>
      </div>
    `;
  }

  function detailHtml(student, editingEnrollment, options) {
    const summary = app.paymentSummaryForStudent(student.id);
    const canPay = app.access.canView("payments");
    const focus = options && options.focus ? options.focus : "";
    const defaultTab = focus === "payments" && canPay
      ? "payments"
      : focus === "attendance"
        ? "attendance"
        : "enrollments";
    const tabContent =
      defaultTab === "payments"
        ? renderPaymentHistory(student.id)
        : defaultTab === "attendance"
          ? renderAttendanceHistory(student.id)
          : renderEnrollmentList(student.id);

    return `
      <div class="student-profile-head">
        ${app.studentAvatar(student, "student-avatar-xl")}
        <div>
          <strong>${app.escapeHtml(app.getStudentName(student))}</strong>
          <small>${app.escapeHtml(student.id)} · ${app.escapeHtml(student.phone || "-")}</small>
        </div>
      </div>

      ${studentFinanceAttendanceSummaryHtml(student.id)}

      <div class="detail-grid">
        <div class="detail-item"><span>Ad Soyad</span><strong>${app.escapeHtml(app.getStudentName(student))}</strong></div>
        <div class="detail-item"><span>Durum</span><strong>${app.statusBadge(student.status)}</strong></div>
        <div class="detail-item"><span>Telefon</span><strong>${app.escapeHtml(student.phone || "-")}</strong></div>
        <div class="detail-item"><span>E-posta</span><strong>${app.escapeHtml(student.email || "-")}</strong></div>
        <div class="detail-item"><span>Boy / Kilo</span><strong>${student.height ? app.escapeHtml(student.height) + " cm" : "-"} / ${student.weight ? app.escapeHtml(student.weight) + " kg" : "-"}</strong></div>
        <div class="detail-item"><span>Rahatsızlık</span><strong>${app.escapeHtml(student.healthCondition || "-")}</strong></div>
        <div class="detail-item"><span>Veli</span><strong>${app.escapeHtml(student.guardianName || "-")} / ${app.escapeHtml(student.guardianPhone || "-")}</strong></div>
        <div class="detail-item"><span>Anne</span><strong>${app.escapeHtml(student.motherName || "-")}${student.motherJob ? " (" + app.escapeHtml(student.motherJob) + ")" : ""} / ${app.escapeHtml(student.motherPhone || "-")}</strong></div>
        <div class="detail-item"><span>Baba</span><strong>${app.escapeHtml(student.fatherName || "-")}${student.fatherJob ? " (" + app.escapeHtml(student.fatherJob) + ")" : ""} / ${app.escapeHtml(student.fatherPhone || "-")}</strong></div>
        <div class="detail-item"><span>Acil durum</span><strong>${app.escapeHtml(student.emergencyContact || "-")} / ${app.escapeHtml(student.emergencyPhone || "-")}</strong></div>
        ${canPay ? `<div class="detail-item"><span>Kalan borç</span><strong>${app.formatCurrency(summary.remaining)}</strong></div>` : ""}
        <div class="detail-item"><span>Devam oranı</span><strong>%${app.attendanceRatio(student.id)}</strong></div>
        <div class="detail-item"><span>KVKK</span><strong>${student.kvkkConsent ? "Onay var" : "Onay yok"}</strong></div>
        <div class="detail-item"><span>İletişim izni</span><strong>${student.communicationConsent ? "Var" : "Yok"}</strong></div>
        <div class="detail-item"><span>Medya paylaşım izni</span><strong>${student.mediaConsent ? "Var" : "Yok"}</strong></div>
      </div>

      <div class="tabs">
        <button class="btn tab-btn ${defaultTab === "enrollments" ? "active" : ""}" data-tab="enrollments">Branş kayıtları</button>
        <button class="btn tab-btn ${defaultTab === "schedule" ? "active" : ""}" data-tab="schedule">Haftalık program</button>
        ${canPay ? `<button class="btn tab-btn ${defaultTab === "payments" ? "active" : ""}" data-tab="payments">Ödemeler</button>` : ""}
        <button class="btn tab-btn ${defaultTab === "attendance" ? "active" : ""}" data-tab="attendance">Devam geçmişi</button>
      </div>
      <div id="studentDetailTab">${tabContent}</div>

      ${app.access.canEdit("students") ? `
      <h3>${editingEnrollment ? "Branş kaydını düzenle" : "Branşa / gruba kayıt"}</h3>
      <div id="enrollmentFormHost">${enrollmentFormHtml(student, editingEnrollment)}</div>` : ""}
    `;
  }

  function openStudentDetail(studentId, options) {
    const student = storage.getData(storage.KEYS.students, []).find((item) => item.id === studentId);
    if (!student) return;
    const searchActive = Boolean((app.$("#studentSearch")?.value || "").trim());
    const focus = options && options.focus
      ? options.focus
      : searchActive
        ? (app.access.canView("payments") ? "payments" : "attendance")
        : "";
    app.openModal("Öğrenci detayı", detailHtml(student, null, { focus }));
    app.hydrateStudentPhotos(app.$("#modal-root"));
    bindStudentDetail(student);
  }

  function rebindEnrollmentForm(student, editingEnrollment) {
    const host = app.$("#enrollmentFormHost");
    if (!host) return;
    host.innerHTML = enrollmentFormHtml(student, editingEnrollment);
    const headerText = host.parentElement?.querySelector("h3");
    if (headerText) headerText.textContent = editingEnrollment ? "Branş kaydını düzenle" : "Branşa / gruba kayıt";
    attachEnrollmentFormHandlers(student, editingEnrollment);
  }

  function attachEnrollmentFormHandlers(student, editingEnrollment) {
    const branchSelect = app.$("#enrollmentBranch");
    const groupSelect = app.$("#enrollmentGroup");
    const customFeeInput = app.$("#enrollmentCustomFee");
    if (!branchSelect || !groupSelect) return;

    const refreshGroupOptions = () => {
      const branchId = branchSelect.value;
      let firstVisible = "";
      Array.from(groupSelect.options).forEach((option) => {
        if (!option.value) {
          option.hidden = false;
          option.textContent = branchId ? "Grup seçin" : "Önce branş seçin";
          return;
        }
        option.hidden = option.dataset.branch !== branchId;
        if (!option.hidden && !firstVisible) firstVisible = option.value;
      });

      if (!branchId) {
        groupSelect.value = "";
      } else if (!Array.from(groupSelect.options).some((o) => !o.hidden && o.value === groupSelect.value)) {
        groupSelect.value = "";
      }
    };

    const refreshFeePlaceholder = () => {
      const selectedOption = branchSelect.selectedOptions[0];
      const branchFee = Number(selectedOption?.dataset.fee || 0);
      if (customFeeInput) {
        customFeeInput.placeholder = branchFee
          ? `Branş varsayılanı: ${branchFee}`
          : "Branş varsayılanı (henüz tanımsız)";
      }
    };

    branchSelect.addEventListener("change", () => {
      refreshGroupOptions();
      refreshFeePlaceholder();
      renderGroupPreview(groupSelect.value);
    });

    groupSelect.addEventListener("change", () => {
      const groupId = groupSelect.value;
      if (groupId) {
        const group = storage.getData(storage.KEYS.groups, []).find((item) => item.id === groupId);
        if (group && group.branchId && branchSelect.value !== group.branchId) {
          branchSelect.value = group.branchId;
          refreshFeePlaceholder();
        }
      }
      renderGroupPreview(groupId);
    });

    refreshGroupOptions();
    refreshFeePlaceholder();
    renderGroupPreview(groupSelect.value);

    app.$("#enrollmentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveEnrollment(student, editingEnrollment);
    });

    const cancelButton = app.$("#cancelEditEnrollment");
    if (cancelButton) {
      cancelButton.addEventListener("click", () => rebindEnrollmentForm(student, null));
    }
  }

  function bindStudentDetail(student) {
    const tabRoot = app.$("#studentDetailTab");
    app.$$(".tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        app.$$(".tab-btn").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        if (button.dataset.tab === "enrollments") tabRoot.innerHTML = renderEnrollmentList(student.id);
        if (button.dataset.tab === "schedule") tabRoot.innerHTML = renderWeeklySchedule(student.id);
        if (button.dataset.tab === "payments") tabRoot.innerHTML = renderPaymentHistory(student.id);
        if (button.dataset.tab === "attendance") tabRoot.innerHTML = renderAttendanceHistory(student.id);
      });
    });

    tabRoot.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-enrollment-action]");
      if (!button) return;
      const enrollmentId = button.dataset.enrollmentId;
      const action = button.dataset.enrollmentAction;
      const enrollment = storage.getData(storage.KEYS.enrollments, []).find((item) => item.id === enrollmentId);
      if (!enrollment) return;

      if (action === "edit") {
        rebindEnrollmentForm(student, enrollment);
        const host = app.$("#enrollmentFormHost");
        if (host && host.scrollIntoView) host.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (action === "delete") {
        if (!confirm("Bu branş kaydı silinsin mi? Bekleyen otomatik ödeme planları da silinecek.")) return;
        const next = storage.getData(storage.KEYS.enrollments, []).filter((item) => item.id !== enrollmentId);
        storage.setData(storage.KEYS.enrollments, next);
        if (window.CaYaEngine) window.CaYaEngine.runAll();
        tabRoot.innerHTML = renderEnrollmentList(student.id);
        app.toast("Branş kaydı silindi.", "success");
      }
    });

    attachEnrollmentFormHandlers(student, null);
  }

  function saveEnrollment(student, editingEnrollment) {
    const form = app.$("#enrollmentForm");
    const data = new FormData(form);
    const branchId = String(data.get("branchId") || "");
    const groupId = String(data.get("groupId") || "");
    const status = String(data.get("status") || "Aktif");
    const customFeeRaw = String(data.get("customFee") || "").trim();
    const enrollments = storage.getData(storage.KEYS.enrollments, []);
    const groups = storage.getData(storage.KEYS.groups, []);
    const group = groups.find((item) => item.id === groupId);
    const isEditing = Boolean(editingEnrollment);

    if (!branchId) {
      app.toast("Branş seçimi zorunludur.", "error");
      return;
    }
    if (!groupId || !group) {
      app.toast("Grup seçimi zorunludur. Önce ilgili branşta grup oluşturun.", "error");
      return;
    }
    if (group.branchId !== branchId) {
      app.toast("Seçilen grup bu branşa ait değil.", "error");
      return;
    }

    if (student.status !== "Aktif" && status === "Aktif") {
      app.toast("Pasif veya dondurulmuş öğrenci aktif gruba kaydedilemez.", "error");
      return;
    }

    const sameGroupActive = enrollments.find(
      (item) => item.studentId === student.id && item.groupId === groupId && item.status === "Aktif" && (!isEditing || item.id !== editingEnrollment.id)
    );
    if (sameGroupActive) {
      app.toast("Bu öğrenci zaten bu grupta aktif olarak kayıtlı.", "error");
      return;
    }

    const sameBranchActive = enrollments.find(
      (item) => item.studentId === student.id && item.branchId === branchId && item.status === "Aktif" && (!isEditing || item.id !== editingEnrollment.id) && item.groupId !== groupId
    );
    if (sameBranchActive && !confirm("Bu öğrenci aynı branşta başka bir grupta aktif. Yeni gruba da kaydetmek istediğinize emin misiniz?")) {
      return;
    }

    if (status === "Aktif") {
      const currentlyInGroup = isEditing && editingEnrollment.groupId === groupId && editingEnrollment.status === "Aktif";
      if (!currentlyInGroup) {
        const count = app.getGroupStudentCount(groupId);
        if (Number(group.capacity || 0) > 0 && count >= Number(group.capacity)) {
          app.toast("Grup kapasitesi dolu. Yeni kayıt yapılamaz.", "error");
          return;
        }
      }
    }

    const baseEnrollment = isEditing ? editingEnrollment : { id: storage.generateId("enr") };
    const enrollment = {
      ...baseEnrollment,
      id: baseEnrollment.id,
      studentId: student.id,
      branchId,
      groupId,
      startDate: String(data.get("startDate") || storage.todayISO()),
      endDate: String(data.get("endDate") || ""),
      membershipType: String(data.get("membershipType") || "Aylık üyelik"),
      status,
      note: String(data.get("note") || "").trim(),
      customFee: customFeeRaw === "" ? null : Number(customFeeRaw)
    };
    if (!isEditing && !enrollment.createdAt) enrollment.createdAt = storage.todayISO();
    delete enrollment.schedule;

    const next = isEditing
      ? enrollments.map((item) => (item.id === enrollment.id ? enrollment : item))
      : [...enrollments, enrollment];

    storage.setData(storage.KEYS.enrollments, next);
    if (window.CaYaEngine) window.CaYaEngine.runAll();

    rebindEnrollmentForm(student, null);
    // Keep tab UI in sync: saving an enrollment always refreshes the
    // enrollments list (even if the user opened detail focused on payments).
    app.$$(".tab-btn").forEach((item) => item.classList.remove("active"));
    const enrollmentsTab = app.$('.tab-btn[data-tab="enrollments"]');
    if (enrollmentsTab) enrollmentsTab.classList.add("active");
    const tabRoot = app.$("#studentDetailTab");
    if (tabRoot) tabRoot.innerHTML = renderEnrollmentList(student.id);
    app.toast(isEditing ? "Branş kaydı güncellendi." : "Öğrenci branşa kaydedildi. Aylık ödeme planı otomatik oluşturuldu.", "success");
    const _enrBranch = (storage.getData(storage.KEYS.branches, []).find(b => b.id === enrollment.branchId) || {}).name || enrollment.branchId;
    const _enrGroup = (storage.getData(storage.KEYS.groups, []).find(g => g.id === enrollment.groupId) || {}).name || enrollment.groupId;
    window.CaYaAudit?.log("students", isEditing ? "edit" : "add", `Branş kaydı ${isEditing ? "güncellendi" : "eklendi"}: ${student.firstName} ${student.lastName} | Branş: ${_enrBranch} | Grup: ${_enrGroup} | Başlangıç: ${app.formatDate(enrollment.startDate)}`);
  }

  app.registerPage("students", renderStudentsPage);
})();
