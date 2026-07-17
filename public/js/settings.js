(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;

  const LOGO_MAX_BYTES = 5 * 1024 * 1024;
  let pendingLogo = null;

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Dosya okunamadı."));
      reader.readAsDataURL(file);
    });
  }

  function updateLogoPreview(src) {
    const img = app.$("#logoPreviewImg");
    if (img) img.src = src || "/assets/logo.svg";
  }

  const exportDefinitions = [
    { key: "students", label: "Öğrenciler", sheet: "Öğrenciler", rows: studentRows },
    { key: "branches", label: "Branşlar", sheet: "Branşlar", rows: branchRows },
    { key: "groups", label: "Gruplar", sheet: "Gruplar", rows: groupRows },
    { key: "schedule", label: "Ders programı", sheet: "Ders Programı", rows: scheduleRows },
    { key: "enrollments", label: "Branş kayıtları", sheet: "Branş Kayıtları", rows: enrollmentRows },
    { key: "attendance", label: "Yoklama", sheet: "Yoklama", rows: attendanceRows },
    { key: "payments", label: "Ödemeler", sheet: "Ödemeler", rows: paymentRows },
    { key: "paymentTransactions", label: "Ödeme hareketleri", sheet: "Ödeme Hareketleri", rows: paymentTransactionRows },
    { key: "teachers", label: "Öğretmenler", sheet: "Öğretmenler", rows: teacherRows },
    { key: "salaries", label: "Maaşlar", sheet: "Maaşlar", rows: salaryRows },
    { key: "salaryTransactions", label: "Maaş hareketleri", sheet: "Maaş Hareketleri", rows: salaryTransactionRows },
    { key: "notifications", label: "Bildirimler", sheet: "Bildirimler", rows: notificationRows },
    { key: "auditLog", label: "Denetim kaydı", sheet: "Denetim Kaydı", rows: auditRows },
    { key: "settings", label: "Ayarlar", sheet: "Ayarlar", rows: settingsRows }
  ];

  function renderSettingsPage() {
    const root = app.$("#page-content");
    if (!root) return;
    const settings = storage.getData(storage.KEYS.settings, {});

    pendingLogo = settings.logo || null;

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Ayarlar</h2>
          <p>Salon bilgileri, tema ve veri işlemleri.</p>
        </div>
      </section>

      <section class="grid two">
        <form id="settingsForm" class="form-card">
          <div class="form-heading">
            <h3>Salon bilgileri</h3>
            <span class="helper">Bu bilgiler panel üst barı, mesajlar ve raporlar için kullanılır.</span>
          </div>

          <div class="logo-uploader">
            <div class="logo-preview">
              <img id="logoPreviewImg" src="${app.escapeHtml(settings.logo || "/assets/logo.svg")}" alt="" onerror="this.onerror=null;this.src='/assets/logo.svg';" />
            </div>
            <div class="logo-uploader-info">
              <strong>Uygulama logosu</strong>
              <small class="helper">Sol menüde görünen logoyu kendi şirket/salon logonuzla değiştirin. PNG, JPG veya SVG. En fazla 5 MB. Tercihen kare oranlı.</small>
              <div class="logo-uploader-actions">
                <input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden />
                <button type="button" class="btn btn-primary btn-sm" id="logoUploadButton">
                  ${app.icon("add")}
                  <span>Logo yükle</span>
                </button>
                <button type="button" class="btn btn-sm" id="removeLogoButton">Varsayılana dön</button>
              </div>
            </div>
          </div>

          <div class="form-grid">
            <label>Salon adı<input name="gymName" value="${app.escapeHtml(settings.gymName || "CaYaSport Panel")}" required /></label>
            <label>Logo metni<input name="logoText" value="${app.escapeHtml(settings.logoText || "CYS")}" maxlength="8" /></label>
            <label>Telefon<input name="phone" value="${app.escapeHtml(settings.phone || "")}" /></label>
            <label>E-posta<input name="email" type="email" value="${app.escapeHtml(settings.email || "")}" /></label>
            <label class="span-2">Adres<textarea name="address">${app.escapeHtml(settings.address || "")}</textarea></label>
            <label>Varsayılan para birimi
              <select name="currency">
                <option value="TRY" ${settings.currency === "TRY" ? "selected" : ""}>TRY</option>
                <option value="EUR" ${settings.currency === "EUR" ? "selected" : ""}>EUR</option>
                <option value="USD" ${settings.currency === "USD" ? "selected" : ""}>USD</option>
              </select>
            </label>
            <label>Ödeme hatırlatma günü<input name="reminderDay" type="number" min="1" max="30" value="${Number(settings.reminderDay || 3)}" /></label>
            <label>Tema seçimi
              <select name="theme">
                <option value="light" ${(settings.theme || "light") === "light" ? "selected" : ""}>Açık</option>
                <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Koyu</option>
              </select>
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Ayarları kaydet</button>
          </div>
        </form>

        <div class="grid">
          <section class="card">
            <h3>Veri işlemleri</h3>
            <p class="muted">Bu hesabın panel verileri sunucuda şifreli saklanır. Sıfırlama işlemi öğrenci, branş, grup, ödeme ve yoklama kayıtlarını boşaltır.</p>
            <div class="actions">
              <button class="btn btn-danger" id="clearDataButton">Verileri sıfırla</button>
            </div>
          </section>

          <section class="table-panel">
            <div class="table-header">
              <h3>Veri özeti</h3>
              <span class="chip">Sunucu</span>
            </div>
            <div id="dataSummary" class="compact-list" style="padding: 16px;"></div>
          </section>
        </div>
      </section>

      <section class="table-panel" style="margin-top: 18px;">
        <div class="table-header">
          <h3>Veri dışa aktarma</h3>
          <span class="chip">Excel</span>
        </div>
        <div class="form-card">
          <div class="form-heading">
            <span class="helper">Seçilen her kategori Excel dosyasında ayrı sayfa olarak hazırlanır. Türkçe karakterler UTF-8 uyumlu yazılır.</span>
          </div>
          <div id="exportOptions" class="checkbox-group export-options">
            ${exportDefinitions
              .map((definition) => `
                <label class="checkbox-label">
                  <input type="checkbox" name="exportCategory" value="${definition.key}" checked />
                  ${app.escapeHtml(definition.label)}
                </label>
              `)
              .join("")}
          </div>
          <div class="form-actions">
            <button type="button" class="btn" id="selectAllExports">Tümünü seç</button>
            <button type="button" class="btn" id="clearExportSelection">Seçimi temizle</button>
            <button type="button" class="btn btn-primary" id="exportSelectedButton">Seçilenleri Excel indir</button>
            <button type="button" class="btn btn-primary" id="exportAllButton">Tüm verileri Excel indir</button>
          </div>
        </div>
      </section>
    `;

    app.$("#settingsForm").addEventListener("submit", saveSettings);
    app.$("#clearDataButton").addEventListener("click", clearData);
    app.$("#selectAllExports").addEventListener("click", () => setExportSelection(true));
    app.$("#clearExportSelection").addEventListener("click", () => setExportSelection(false));
    app.$("#exportSelectedButton").addEventListener("click", exportSelectedData);
    app.$("#exportAllButton").addEventListener("click", () => exportWorkbook(exportDefinitions.map((definition) => definition.key)));

    app.$("#logoUploadButton")?.addEventListener("click", () => {
      app.$("#logoFileInput")?.click();
    });

    app.$("#logoFileInput")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        app.toast("Sadece resim dosyası yükleyebilirsiniz.", "error");
        return;
      }
      if (file.size > LOGO_MAX_BYTES) {
        app.toast(`Logo en fazla ${Math.round(LOGO_MAX_BYTES / (1024 * 1024))} MB olabilir.`, "error");
        return;
      }

      try {
        const dataUrl = await fileToDataUrl(file);
        pendingLogo = dataUrl;
        updateLogoPreview(dataUrl);
        app.toast("Logo seçildi. Değişikliği uygulamak için kaydedin.", "success");
      } catch (error) {
        app.toast(error.message || "Logo yüklenemedi.", "error");
      }
    });

    app.$("#removeLogoButton")?.addEventListener("click", () => {
      pendingLogo = null;
      updateLogoPreview(null);
      app.toast("Logo varsayılana ayarlandı. Kaydetmeyi unutmayın.", "success");
    });

    renderDataSummary();
  }

  function saveSettings(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const previous = storage.getData(storage.KEYS.settings, {});
    const logoChanged = (previous.logo || null) !== (pendingLogo || null);
    const settings = {
      gymName: String(data.get("gymName") || "CaYaSport Panel").trim(),
      logoText: String(data.get("logoText") || "CYS").trim(),
      phone: String(data.get("phone") || "").trim(),
      email: String(data.get("email") || "").trim(),
      address: String(data.get("address") || "").trim(),
      currency: String(data.get("currency") || "TRY"),
      reminderDay: Number(data.get("reminderDay") || 3),
      theme: String(data.get("theme") || "light"),
      logo: pendingLogo || ""
    };

    storage.setData(storage.KEYS.settings, settings);
    app.applyTheme(settings.theme);
    app.renderShell();
    renderSettingsPage();
    app.toast("Ayarlar kaydedildi.", "success");
    const logoNote = logoChanged ? (settings.logo ? " | Logo güncellendi" : " | Logo varsayılana alındı") : "";
    window.CaYaAudit?.log("settings", "settings", `Ayarlar güncellendi: ${settings.gymName} | Telefon: ${settings.phone || "-"} | Para birimi: ${settings.currency} | Tema: ${settings.theme}${logoNote}`);
  }

  function renderDataSummary() {
    const rows = [
      ["Öğrenci", storage.getData(storage.KEYS.students, []).length],
      ["Branş", storage.getData(storage.KEYS.branches, []).length],
      ["Grup", storage.getData(storage.KEYS.groups, []).length],
      ["Branş kayıtları", storage.getData(storage.KEYS.enrollments, []).length],
      ["Yoklama", storage.getData(storage.KEYS.attendance, []).length],
      ["Ödeme", storage.getData(storage.KEYS.payments, []).length],
      ["Öğretmen", storage.getData(storage.KEYS.teachers, []).length],
      ["Maaş", storage.getData(storage.KEYS.teacherSalaries, []).length],
      ["Bildirim", storage.getData(storage.KEYS.notifications, []).length]
    ];

    app.$("#dataSummary").innerHTML = rows
      .map(([label, value]) => `
        <div class="list-item">
          <strong>${app.escapeHtml(label)}</strong>
          <span class="chip">${value}</span>
        </div>
      `)
      .join("");
  }

  async function clearData() {
    if (!confirm("Bu hesabın tüm panel verileri sıfırlansın mı? Bu işlem geri alınamaz.")) return;

    try {
      await storage.clearAllData();
      app.renderShell();
      renderSettingsPage();
      app.toast("Veriler sıfırlandı.", "success");
      window.CaYaAudit?.log("settings", "reset", "Tüm panel verileri sıfırlandı.");
    } catch (error) {
      app.toast(error.message || "Veriler sıfırlanamadı.", "error");
    }
  }

  function setExportSelection(checked) {
    app.$$("#exportOptions input[name='exportCategory']").forEach((input) => {
      input.checked = checked;
    });
  }

  function exportSelectedData() {
    const selectedKeys = app.$$("#exportOptions input[name='exportCategory']:checked").map((input) => input.value);
    exportWorkbook(selectedKeys);
  }

  function exportWorkbook(selectedKeys) {
    if (window.CaYaEngine && typeof window.CaYaEngine.runAll === "function") window.CaYaEngine.runAll();

    const selected = exportDefinitions.filter((definition) => selectedKeys.includes(definition.key));
    if (!selected.length) {
      app.toast("Dışa aktarmak için en az bir kategori seçin.", "error");
      return;
    }

    // Always lead with an overview sheet, then the selected data sheets.
    const sheets = [
      { name: "Özet", plain: true, rows: summaryRows(selected) },
      ...selected.map((definition) => ({ name: definition.sheet, rows: definition.rows() }))
    ];

    const workbook = buildXlsxWorkbook(sheets);
    const blob = new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const gymSlug = slugify(storage.getData(storage.KEYS.settings, {}).gymName || "cayasport") || "cayasport";
    const suffix = selected.length === exportDefinitions.length ? "tum-veriler" : selected.map((definition) => slugify(definition.label)).join("-");
    link.href = url;
    link.download = `${gymSlug}-${storage.todayISO()}-${suffix}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    app.toast("Excel dışa aktarma dosyası hazırlandı.", "success");
    window.CaYaAudit?.log("settings", "export", `Excel dışa aktarma alındı: ${selected.map((definition) => definition.label).join(", ")}`);
  }

  function table(headers, records) {
    return [
      headers,
      ...records.map((record) => headers.map((header) => record[header] ?? ""))
    ];
  }

  function allData() {
    const students = storage.getData(storage.KEYS.students, []);
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage.getData(storage.KEYS.groups, []);
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const enrollments = storage.getData(storage.KEYS.enrollments, []);
    const payments = storage.normalizePayments(storage.getData(storage.KEYS.payments, []));
    const salaries = window.CaYaEngine && typeof window.CaYaEngine.normalizeSalaries === "function"
      ? window.CaYaEngine.normalizeSalaries(storage.getData(storage.KEYS.teacherSalaries, []))
      : storage.getData(storage.KEYS.teacherSalaries, []);

    return {
      students,
      branches,
      groups,
      teachers,
      enrollments,
      attendance: storage.getData(storage.KEYS.attendance, []),
      payments,
      salaries,
      notifications: storage.getData(storage.KEYS.notifications, []),
      auditLog: storage.getData(storage.KEYS.auditLog, []),
      settings: storage.getData(storage.KEYS.settings, {}),
      studentMap: new Map(students.map((item) => [item.id, item])),
      branchMap: new Map(branches.map((item) => [item.id, item])),
      groupMap: new Map(groups.map((item) => [item.id, item])),
      teacherMap: new Map(teachers.map((item) => [item.id, item]))
    };
  }

  // Overview sheet: workspace, export time and key totals (finance lines hidden
  // when the user lacks the relevant permission).
  function summaryRows(selected) {
    const data = allData();
    const settings = data.settings || {};
    const money = (value) => app.formatCurrency(Number(value || 0));
    const students = data.students;
    const activeStudents = students.filter((item) => item.status === "Aktif").length;
    const payments = data.payments;
    const collected = payments.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);
    const remaining = payments.filter((p) => p.status !== "İptal").reduce((sum, p) => sum + Number(p.remainingAmount || 0), 0);
    const overdue = payments.filter((p) => p.status === "Gecikti");
    const overdueAmount = overdue.reduce((sum, p) => sum + Number(p.remainingAmount || 0), 0);
    const salaries = data.salaries;
    const salaryPaid = salaries.reduce((sum, x) => sum + Number(x.paidAmount || 0), 0);
    const salaryDue = salaries.filter((x) => x.status !== "İptal").reduce((sum, x) => sum + Number(x.remainingAmount || 0), 0);
    const canPay = !app.access || app.access.canView("payments");
    const canSal = !app.access || app.access.canView("salaries");

    const rows = [
      ["CaYaSport Panel — Veri Özeti", ""],
      ["Çalışma alanı", settings.gymName || "-"],
      ["Dışa aktarma tarihi", new Date().toLocaleString("tr-TR")],
      ["İçerilen sayfalar", (selected || []).map((d) => d.label).join(", ")],
      ["", ""],
      ["Öğrenciler", ""],
      ["Toplam öğrenci", students.length],
      ["Aktif öğrenci", activeStudents],
      ["Pasif / diğer", students.length - activeStudents],
      ["", ""],
      ["Yapı", ""],
      ["Branş sayısı", data.branches.length],
      ["Grup sayısı", data.groups.length],
      ["Öğretmen sayısı", data.teachers.length],
      ["Aktif branş kaydı", data.enrollments.filter((e) => e.status === "Aktif").length]
    ];
    if (canPay) {
      rows.push(["", ""], ["Ödemeler", ""],
        ["Tahsil edilen toplam", money(collected)],
        ["Açık bakiye (kalan)", money(remaining)],
        ["Gecikmiş tutar", money(overdueAmount)],
        ["Gecikmiş ödeme adedi", overdue.length]);
    }
    if (canSal) {
      rows.push(["", ""], ["Maaşlar", ""],
        ["Ödenen maaş toplam", money(salaryPaid)],
        ["Kalan maaş borcu", money(salaryDue)]);
    }
    return rows;
  }

  function studentRows() {
    const data = allData();
    const activeByStudent = new Map();
    data.enrollments.filter((e) => e.status === "Aktif").forEach((e) => {
      if (!activeByStudent.has(e.studentId)) activeByStudent.set(e.studentId, { branches: new Set(), groups: new Set() });
      const entry = activeByStudent.get(e.studentId);
      if (e.branchId) entry.branches.add(getBranchName(data, e.branchId));
      if (e.groupId) entry.groups.add(e.groupId);
    });
    return table(
      ["ID", "Ad", "Soyad", "Ad Soyad", "Telefon", "E-posta", "Durum", "Doğum Tarihi", "Cinsiyet", "Boy (cm)", "Kilo (kg)", "Rahatsızlık", "Kayıt Tarihi", "Kayıtlı Branşlar", "Aktif Grup Sayısı", "Veli Adı", "Veli Telefonu", "Anne Adı", "Anne Mesleği", "Anne GSM", "Baba Adı", "Baba Mesleği", "Baba GSM", "Acil Durum Kişisi", "Acil Durum Telefonu", "Adres", "Notlar", "Fotoğraf", "KVKK Onayı", "İletişim İzni", "Medya Paylaşım İzni"],
      data.students.map((student) => ({
        ID: student.id,
        Ad: student.firstName,
        Soyad: student.lastName,
        "Ad Soyad": app.getStudentName(student),
        Telefon: student.phone,
        "E-posta": student.email,
        Durum: student.status,
        "Doğum Tarihi": student.birthDate,
        Cinsiyet: student.gender,
        "Boy (cm)": student.height,
        "Kilo (kg)": student.weight,
        Rahatsızlık: student.healthCondition,
        "Kayıt Tarihi": student.registrationDate,
        "Kayıtlı Branşlar": Array.from(activeByStudent.get(student.id)?.branches || []).join(", "),
        "Aktif Grup Sayısı": (activeByStudent.get(student.id)?.groups.size) || 0,
        "Veli Adı": student.guardianName,
        "Veli Telefonu": student.guardianPhone,
        "Anne Adı": student.motherName,
        "Anne Mesleği": student.motherJob,
        "Anne GSM": student.motherPhone,
        "Baba Adı": student.fatherName,
        "Baba Mesleği": student.fatherJob,
        "Baba GSM": student.fatherPhone,
        "Acil Durum Kişisi": student.emergencyContact,
        "Acil Durum Telefonu": student.emergencyPhone,
        Adres: student.address,
        Notlar: student.notes,
        Fotoğraf: student.photo ? "Var" : "Yok",
        "KVKK Onayı": yesNo(student.kvkkConsent),
        "İletişim İzni": yesNo(student.communicationConsent),
        "Medya Paylaşım İzni": yesNo(student.mediaConsent)
      }))
    );
  }

  function branchRows() {
    const data = allData();
    return table(
      ["ID", "Branş", "Açıklama", "Aylık Ücret", "Ders Başı Ücret", "Kapasite", "Aktif Öğrenci", "Doluluk (%)", "Toplam Gelir", "Minimum Yaş", "Maksimum Yaş", "Durum", "Renk", "Notlar"],
      data.branches.map((branch) => {
        const count = app.getBranchStudentCount(branch.id);
        const capacity = Number(branch.capacity || 0);
        return {
          ID: branch.id,
          Branş: branch.name,
          Açıklama: branch.description,
          "Aylık Ücret": numberValue(branch.monthlyFee),
          "Ders Başı Ücret": numberValue(branch.lessonFee),
          Kapasite: numberValue(branch.capacity),
          "Aktif Öğrenci": count,
          "Doluluk (%)": capacity ? Math.round((count / capacity) * 100) : 0,
          "Toplam Gelir": numberValue(typeof app.getBranchRevenue === "function" ? app.getBranchRevenue(branch.id) : 0),
          "Minimum Yaş": branch.minAge,
          "Maksimum Yaş": branch.maxAge,
          Durum: branch.status,
          Renk: branch.color,
          Notlar: branch.notes
        };
      })
    );
  }

  function groupRows() {
    const data = allData();
    return table(
      ["ID", "Grup", "Branş", "Eğitmenler", "Seviye", "Yaş Aralığı", "Kapasite", "Aktif Öğrenci", "Durum", "Seanslar", "Notlar"],
      data.groups.map((group) => ({
        ID: group.id,
        Grup: group.name,
        Branş: getBranchName(data, group.branchId),
        Eğitmenler: teacherNames(data, group),
        Seviye: group.level,
        "Yaş Aralığı": group.ageRange,
        Kapasite: numberValue(group.capacity),
        "Aktif Öğrenci": app.getGroupStudentCount(group.id),
        Durum: group.status,
        Seanslar: app.groupSessions(group).map((session) => `${session.day} ${session.startTime || ""}-${session.endTime || ""}`).join(", "),
        Notlar: group.notes
      }))
    );
  }

  function scheduleRows() {
    const data = allData();
    const rows = data.groups.flatMap((group) =>
      app.groupSessions(group).map((session) => ({
        Gün: session.day,
        "Başlangıç": session.startTime,
        Bitiş: session.endTime,
        Grup: group.name,
        Branş: getBranchName(data, group.branchId),
        Eğitmenler: teacherNames(data, group),
        Seviye: group.level,
        "Yaş Aralığı": group.ageRange,
        Kapasite: numberValue(group.capacity),
        "Aktif Öğrenci": app.getGroupStudentCount(group.id),
        Durum: group.status
      }))
    );

    const dayOrder = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
    rows.sort((a, b) => {
      const dayDiff = dayOrder.indexOf(a.Gün) - dayOrder.indexOf(b.Gün);
      return dayDiff || String(a.Başlangıç || "").localeCompare(String(b.Başlangıç || ""), "tr");
    });

    return table(["Gün", "Başlangıç", "Bitiş", "Grup", "Branş", "Eğitmenler", "Seviye", "Yaş Aralığı", "Kapasite", "Aktif Öğrenci", "Durum"], rows);
  }

  function enrollmentRows() {
    const data = allData();
    return table(
      ["ID", "Öğrenci ID", "Öğrenci", "Branş", "Grup", "Üyelik Tipi", "Başlangıç", "Bitiş", "Durum", "Özel Ücret", "Not"],
      data.enrollments.map((enrollment) => ({
        ID: enrollment.id,
        "Öğrenci ID": enrollment.studentId,
        Öğrenci: app.getStudentName(data.studentMap.get(enrollment.studentId)),
        Branş: getBranchName(data, enrollment.branchId),
        Grup: getGroupName(data, enrollment.groupId),
        "Üyelik Tipi": enrollment.membershipType,
        Başlangıç: enrollment.startDate,
        Bitiş: enrollment.endDate,
        Durum: enrollment.status,
        "Özel Ücret": enrollment.customFee === null || enrollment.customFee === undefined ? "" : numberValue(enrollment.customFee),
        Not: enrollment.note
      }))
    );
  }

  function attendanceRows() {
    const data = allData();
    return table(
      ["ID", "Tarih", "Öğrenci ID", "Öğrenci", "Branş", "Grup", "Durum", "Not"],
      data.attendance.map((record) => ({
        ID: record.id,
        Tarih: record.date,
        "Öğrenci ID": record.studentId,
        Öğrenci: app.getStudentName(data.studentMap.get(record.studentId)),
        Branş: getBranchName(data, record.branchId),
        Grup: getGroupName(data, record.groupId),
        Durum: record.status,
        Not: record.note
      }))
    );
  }

  function paymentRows() {
    const data = allData();
    return table(
      ["ID", "Öğrenci ID", "Öğrenci", "Branş", "Dönem", "Açıklama", "Toplam", "Ödenen", "Kalan", "Son Ödeme", "Durum", "Kaynak", "İşlem Sayısı"],
      data.payments.map((payment) => ({
        ID: payment.id,
        "Öğrenci ID": payment.studentId,
        Öğrenci: app.getStudentName(data.studentMap.get(payment.studentId)),
        Branş: getBranchName(data, payment.branchId),
        Dönem: payment.period,
        Açıklama: payment.description,
        Toplam: numberValue(payment.totalAmount),
        Ödenen: numberValue(payment.paidAmount),
        Kalan: numberValue(payment.remainingAmount),
        "Son Ödeme": payment.dueDate,
        Durum: payment.status,
        Kaynak: payment.source,
        "İşlem Sayısı": (payment.transactions || []).length
      }))
    );
  }

  function paymentTransactionRows() {
    const data = allData();
    const rows = data.payments.flatMap((payment) =>
      (payment.transactions || []).map((transaction, index) => ({
        "Ödeme ID": payment.id,
        "İşlem No": index + 1,
        "Öğrenci": app.getStudentName(data.studentMap.get(payment.studentId)),
        "Branş": getBranchName(data, payment.branchId),
        "Dönem": payment.period,
        "Tarih": transaction.date,
        "Yöntem": transaction.method,
        "Tutar": numberValue(transaction.amount),
        "Not": transaction.note
      }))
    );

    return table(["Ödeme ID", "İşlem No", "Öğrenci", "Branş", "Dönem", "Tarih", "Yöntem", "Tutar", "Not"], rows);
  }

  function teacherRows() {
    const data = allData();
    return table(
      ["ID", "Ad", "Soyad", "Ad Soyad", "Telefon", "E-posta", "Branşlar", "Aylık Maaş", "Maaş Geçerlilik Tarihi", "Başlangıç", "Durum", "Notlar"],
      data.teachers.map((teacher) => ({
        ID: teacher.id,
        Ad: teacher.firstName,
        Soyad: teacher.lastName,
        "Ad Soyad": teacherName(teacher),
        Telefon: teacher.phone,
        "E-posta": teacher.email,
        Branşlar: (teacher.branchIds || []).map((id) => getBranchName(data, id)).join(", "),
        "Aylık Maaş": teacher.monthlySalary === null || teacher.monthlySalary === undefined ? "" : numberValue(teacher.monthlySalary),
        "Maaş Geçerlilik Tarihi": teacher.salaryEffectiveDate,
        Başlangıç: teacher.startDate,
        Durum: teacher.status,
        Notlar: teacher.notes
      }))
    );
  }

  function salaryRows() {
    const data = allData();
    return table(
      ["ID", "Öğretmen ID", "Öğretmen", "Dönem", "Açıklama", "Toplam", "Ödenen", "Kalan", "Vade", "Durum", "İşlem Sayısı"],
      data.salaries.map((salary) => ({
        ID: salary.id,
        "Öğretmen ID": salary.teacherId,
        Öğretmen: teacherName(data.teacherMap.get(salary.teacherId)),
        Dönem: salary.period,
        Açıklama: salary.description,
        Toplam: numberValue(salary.totalAmount),
        Ödenen: numberValue(salary.paidAmount),
        Kalan: numberValue(salary.remainingAmount),
        Vade: salary.dueDate,
        Durum: salary.status,
        "İşlem Sayısı": (salary.transactions || []).length
      }))
    );
  }

  function salaryTransactionRows() {
    const data = allData();
    const rows = data.salaries.flatMap((salary) =>
      (salary.transactions || []).map((transaction, index) => ({
        "Maaş ID": salary.id,
        "İşlem No": index + 1,
        "Öğretmen": teacherName(data.teacherMap.get(salary.teacherId)),
        "Dönem": salary.period,
        "Tarih": transaction.date,
        "Yöntem": transaction.method,
        "Tutar": numberValue(transaction.amount),
        "Not": transaction.note
      }))
    );

    return table(["Maaş ID", "İşlem No", "Öğretmen", "Dönem", "Tarih", "Yöntem", "Tutar", "Not"], rows);
  }

  function notificationRows() {
    const data = allData();
    return table(
      ["ID", "Başlık", "Öğrenci", "Branş", "Son Ödeme", "Kalan", "Kalan Gün", "Durum", "Oluşturulma"],
      data.notifications.map((notification) => ({
        ID: notification.id,
        Başlık: notification.title,
        Öğrenci: notification.studentName,
        Branş: notification.branchName,
        "Son Ödeme": notification.dueDate,
        Kalan: numberValue(notification.remainingAmount),
        "Kalan Gün": notification.daysRemaining,
        Durum: notification.status,
        Oluşturulma: notification.createdAt
      }))
    );
  }

  function auditRows() {
    const data = allData();
    return table(
      ["ID", "Tarih", "Kategori", "İşlem", "Açıklama"],
      data.auditLog.map((entry) => ({
        ID: entry.id,
        Tarih: entry.createdAt || entry.date,
        Kategori: entry.category,
        İşlem: entry.action,
        Açıklama: entry.description
      }))
    );
  }

  function settingsRows() {
    const data = allData();
    return table(
      ["Ayar", "Değer"],
      Object.entries(data.settings).map(([key, value]) => ({
        Ayar: key,
        Değer: Array.isArray(value) || (value && typeof value === "object") ? JSON.stringify(value) : value
      }))
    );
  }

  function buildXlsxWorkbook(sheets) {
    const workbookSheets = normalizeWorkbookSheets(sheets);
    const files = [
      { name: "[Content_Types].xml", content: contentTypesXml(workbookSheets.length) },
      { name: "_rels/.rels", content: rootRelsXml() },
      { name: "xl/workbook.xml", content: workbookXml(workbookSheets) },
      { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(workbookSheets.length) },
      { name: "xl/styles.xml", content: stylesXml() },
      ...workbookSheets.map((sheet, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        content: worksheetXml(sheet)
      }))
    ];

    return createZip(files.map((file) => ({ name: file.name, bytes: utf8Bytes(file.content) })));
  }

  function normalizeWorkbookSheets(sheets) {
    const used = new Set();
    return sheets.map((sheet, index) => {
      const fallback = `Sayfa ${index + 1}`;
      const base = safeSheetName(sheet.name || fallback);
      let name = base || fallback;
      let counter = 2;
      while (used.has(name.toLocaleLowerCase("tr-TR"))) {
        const suffix = ` ${counter}`;
        name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
        counter += 1;
      }
      used.add(name.toLocaleLowerCase("tr-TR"));
      return {
        name,
        plain: Boolean(sheet.plain),
        rows: Array.isArray(sheet.rows) && sheet.rows.length ? sheet.rows : [["Veri yok"]]
      };
    });
  }

  function contentTypesXml(sheetCount) {
    const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;
  }

  function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  }

  function workbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr date1904="false"/>
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`;
  }

  function workbookRelsXml(sheetCount) {
    const worksheetRels = Array.from({ length: sheetCount }, (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    ).join("\n  ");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${worksheetRels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="#,##0.## &quot;₺&quot;"/>
    <numFmt numFmtId="165" formatCode="dd.mm.yyyy"/>
    <numFmt numFmtId="166" formatCode="dd.mm.yyyy hh:mm"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF14323C"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF3F3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD9E2E7"/></left><right style="thin"><color rgb="FFD9E2E7"/></right><top style="thin"><color rgb="FFD9E2E7"/></top><bottom style="thin"><color rgb="FFD9E2E7"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }

  function worksheetXml(sheet) {
    const rows = sheet.rows;
    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 1);
    const rowCount = Math.max(rows.length, 1);
    const dimension = `A1:${cellRef(columnCount, rowCount)}`;
    const headerRow = rows[0] || [];
    const currencyCols = headerRow.map((header) => columnIsCurrency(header));

    const sheetViews = sheet.plain
      ? `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
    const autoFilter = sheet.plain ? "" : `\n  <autoFilter ref="${dimension}"/>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  ${sheetViews}
  <sheetFormatPr defaultRowHeight="15"/>
  ${buildColumns(rows)}
  <sheetData>
    ${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => buildCell(value, rowIndex === 0, rowIndex + 1, columnIndex + 1, currencyCols[columnIndex])).join("")}</row>`).join("\n    ")}
  </sheetData>${autoFilter}
</worksheet>`;
  }

  // Money columns (formatted as currency) are detected by header name.
  const CURRENCY_HEADERS = new Set([
    "Toplam", "Ödenen", "Kalan", "Tutar", "Aylık Ücret", "Ders Başı Ücret", "Özel Ücret", "Aylık Maaş", "Toplam Gelir", "Aylık Gelir"
  ]);

  function columnIsCurrency(header) {
    const text = String(header || "");
    return CURRENCY_HEADERS.has(text) || /ücret|maaş/i.test(text);
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

  // Excel serial date: days since 1899-12-30 (UTC to avoid timezone drift).
  function dateToSerial(year, month, day, hours, minutes) {
    const ms = Date.UTC(year, month - 1, day, hours || 0, minutes || 0);
    return (ms - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function buildColumns(rows) {
    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
      const longest = rows.reduce((max, row) => {
        const value = row[columnIndex];
        return Math.max(max, displayCellLength(value));
      }, 0);
      const width = Math.min(Math.max(longest + 2, 10), 48);
      return Number(width.toFixed(1));
    });

    return `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`;
  }

  function buildCell(value, isHeader, rowIndex, columnIndex, isCurrencyCol) {
    const ref = cellRef(columnIndex, rowIndex);
    if (isHeader) {
      return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(normalizeCellValue(value))}</t></is></c>`;
    }

    // Real dates/datetimes -> Excel serial with date formatting.
    if (typeof value === "string") {
      if (DATETIME_RE.test(value)) {
        const [d, t] = value.split("T");
        const [y, m, day] = d.split("-").map(Number);
        const [hh, mm] = t.split(":").map(Number);
        return `<c r="${ref}" s="4"><v>${dateToSerial(y, m, day, hh, mm)}</v></c>`;
      }
      if (DATE_RE.test(value)) {
        const [y, m, day] = value.split("-").map(Number);
        return `<c r="${ref}" s="3"><v>${dateToSerial(y, m, day)}</v></c>`;
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}"${isCurrencyCol ? ' s="2"' : ""}><v>${value}</v></c>`;
    }

    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(normalizeCellValue(value))}</t></is></c>`;
  }

  function cellRef(columnIndex, rowIndex) {
    return `${columnName(columnIndex)}${rowIndex}`;
  }

  function columnName(columnIndex) {
    let index = columnIndex;
    let name = "";
    while (index > 0) {
      const remainder = (index - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      index = Math.floor((index - 1) / 26);
    }
    return name;
  }

  function utf8Bytes(value) {
    return new TextEncoder().encode(value);
  }

  function createZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    files.forEach((file) => {
      const nameBytes = utf8Bytes(file.name);
      const bytes = file.bytes;
      const crc = crc32(bytes);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, dosTime, true);
      localView.setUint16(12, dosDate, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, bytes.length, true);
      localView.setUint32(22, bytes.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, dosTime, true);
      centralView.setUint16(14, dosDate, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, bytes.length, true);
      centralView.setUint32(24, bytes.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      localParts.push(localHeader, bytes);
      centralParts.push(centralHeader);
      offset += localHeader.length + bytes.length;
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, centralOffset, true);
    endView.setUint16(20, 0, true);

    return concatBytes([...localParts, ...centralParts, endRecord]);
  }

  function concatBytes(parts) {
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;
    parts.forEach((part) => {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = (crc >>> 8) ^ crcTable()[(crc ^ bytes[index]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  let cachedCrcTable = null;
  function crcTable() {
    if (cachedCrcTable) return cachedCrcTable;
    cachedCrcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      cachedCrcTable[index] = value >>> 0;
    }
    return cachedCrcTable;
  }

  function normalizeCellValue(value) {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }

  function displayCellLength(value) {
    const text = normalizeCellValue(value).replace(/\s+/g, " ").trim();
    return Array.from(text).reduce((length, char) => length + (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char) ? 2 : 1), 0);
  }

  function safeSheetName(name) {
    const cleaned = String(name || "Sayfa").replace(/[\\/?*[\]:]/g, " ").trim() || "Sayfa";
    return cleaned.slice(0, 31);
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function slugify(value) {
    return String(value || "veri")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "veri";
  }

  function numberValue(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function yesNo(value) {
    return value ? "Evet" : "Hayır";
  }

  function getBranchName(data, branchId) {
    return data.branchMap.get(branchId)?.name || "";
  }

  function getGroupName(data, groupId) {
    return data.groupMap.get(groupId)?.name || "";
  }

  function teacherName(teacher) {
    if (!teacher) return "";
    return `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || teacher.id || "";
  }

  function teacherNames(data, group) {
    const ids = Array.isArray(group?.instructorIds) ? group.instructorIds : [];
    if (ids.length) {
      return ids.map((id) => teacherName(data.teacherMap.get(id))).filter(Boolean).join(", ");
    }
    return group?.instructorName || "";
  }

  app.registerPage("settings", renderSettingsPage);
})();
