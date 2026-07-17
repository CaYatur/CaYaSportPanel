(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const auth = window.CaYaAuth;

  function createAppUrlResolver() {
    let baseHref;
    try {
      const scriptUrl = document.currentScript && document.currentScript.src
        ? new URL(document.currentScript.src, window.location.href)
        : null;
      baseHref = scriptUrl
        ? new URL(scriptUrl.pathname.replace(/\/js\/[^/]+$/, "/"), window.location.origin)
        : new URL("./", window.location.href);
    } catch (error) {
      baseHref = new URL("./", window.location.href);
    }

    return (value) => {
      const input = String(value || "").trim();
      if (!input) return baseHref.toString();
      if (/^[a-z][a-z0-9+.-]*:/i.test(input) || input.startsWith("//")) return input;
      return new URL(input.replace(/^\/+/, ""), baseHref).toString();
    };
  }

  const appUrl = window.CaYaAppUrl || createAppUrlResolver();
  window.CaYaAppUrl = appUrl;

  // SVG icon library — line icons (stroke = currentColor)
  const icons = {
    dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    students: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    branches: '<svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg>',
    teachers: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    groups: '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><circle cx="17" cy="7" r="3"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
    attendance: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>',
    payments: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>',
    unpaid: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    salaries: '<svg viewBox="0 0 24 24"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
    reports: '<svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>',
    audit: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    add: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    layers: '<svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
    permissions: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>'
  };

  function icon(name, extraClass) {
    const svg = icons[name];
    if (!svg) return "";
    const cls = `icon${extraClass ? " " + extraClass : ""}`;
    return `<span class="${cls}" aria-hidden="true">${svg}</span>`;
  }

  const pages = {
    dashboard: { title: "Dashboard", subtitle: "Genel durum ve uyarılar", href: appUrl("dashboard.html"), icon: "dashboard" },
    students: { title: "Öğrenciler", subtitle: "Öğrenci kayıt, durum ve detay yönetimi", href: appUrl("students.html"), icon: "students" },
    branches: { title: "Branşlar", subtitle: "Spor branşları ve ücret yönetimi", href: appUrl("branches.html"), icon: "branches" },
    teachers: { title: "Öğretmenler", subtitle: "Öğretmen kayıt ve branş atama yönetimi", href: appUrl("teachers.html"), icon: "teachers" },
    groups: { title: "Gruplar", subtitle: "Grup, seans ve ders programı yönetimi", href: appUrl("groups.html"), icon: "groups" },
    attendance: { title: "Yoklama", subtitle: "Devam-devamsızlık takibi", href: appUrl("attendance.html"), icon: "attendance" },
    payments: { title: "Ödemeler", subtitle: "Aylık ödeme planı, tahsilat ve gecikme takibi", href: appUrl("payments.html"), icon: "payments" },
    unpaid: { title: "Ödemeyenler", subtitle: "Borçlu ve gecikmiş ödemeler", href: appUrl("unpaid.html"), icon: "unpaid" },
    salaries: { title: "Maaşlar", subtitle: "Öğretmen maaş ödemeleri ve takibi", href: appUrl("salaries.html"), icon: "salaries" },
    reports: { title: "Raporlar", subtitle: "Öğrenci, gelir ve devam raporları", href: appUrl("reports.html"), icon: "reports" },
    audit: { title: "Denetim Kaydı", subtitle: "Tüm işlemlerin tarihli kayıtları", href: appUrl("audit.html"), icon: "audit" },
    settings: { title: "Ayarlar", subtitle: "Salon bilgileri, tema ve veri işlemleri", href: appUrl("settings.html"), icon: "settings" },
    permissions: { title: "Yetkiler", subtitle: "Bu çalışma alanına başkalarına yetki verin", href: appUrl("permissions.html"), icon: "permissions" }
  };

  // Which permission module gates each page. null = always available (dashboard);
  // "__owner__" = only the workspace owner. unpaid/reports map onto payments view.
  const PAGE_MODULE = {
    dashboard: null,
    students: "students",
    branches: "branches",
    teachers: "teachers",
    groups: "groups",
    attendance: "attendance",
    payments: "payments",
    unpaid: "payments",
    salaries: "salaries",
    reports: "reports",
    audit: "audit",
    settings: "settings",
    permissions: "__owner__"
  };

  const PERMISSION_MODULES = ["students", "branches", "teachers", "groups", "attendance", "payments", "salaries", "reports", "audit", "settings"];

  // Active workspace access context (role/permissions/branch scope), loaded once at boot.
  let accessContext = null;

  const access = {
    context: () => accessContext,
    isOwner: () => Boolean(accessContext && accessContext.isOwner),
    role: () => (accessContext && accessContext.role) || "owner",
    permissions: () => (accessContext && accessContext.permissions) || {},
    workspaceName: () => (accessContext && accessContext.workspaceName) || "",
    ownerName: () => (accessContext && accessContext.ownerName) || "",
    level: (module) => {
      if (!accessContext || accessContext.isOwner) return "edit";
      if (!module || !PERMISSION_MODULES.includes(module)) return "view";
      return accessContext.permissions[module] || "none";
    },
    canView: (module) => access.level(module) !== "none",
    canEdit: (module) => access.level(module) === "edit",
    pageAllowed: (pageKey) => {
      const module = PAGE_MODULE[pageKey];
      if (module === "__owner__") return access.isOwner();
      if (!module) return true;
      return access.canView(module);
    }
  };

  async function loadAccessContext() {
    try {
      const response = await fetch(appUrl("api/workspace-context"), { credentials: "same-origin" });
      if (response.ok) accessContext = await response.json();
    } catch (error) {
      accessContext = null;
    }
  }

  const statuses = {
    success: ["Aktif", "Ödendi", "Geldi"],
    danger: ["Borçlu", "Gecikti", "Gelmedi", "Kritik gecikme"],
    warning: ["Bekliyor", "Kısmi ödendi", "Geç kaldı", "Yaklaşan ödeme", "Bugün son ödeme günü"],
    info: ["Dondurulmuş", "İzinli", "Raporlu", "Telafi"],
    neutral: ["Pasif", "Ayrıldı", "İptal"]
  };
  const pageRenderers = new Map();
  let booted = false;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatCurrency(value) {
    const settings = storage.getData(storage.KEYS.settings, {});
    const currency = settings.currency || "TRY";
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("tr-TR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(`${value}T12:00:00`));
  }

  function getTodayName(dateValue) {
    const date = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
    return ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"][date.getDay()];
  }

  function daysBetween(fromDate, toDate) {
    const from = new Date(`${fromDate}T12:00:00`);
    const to = new Date(`${toDate}T12:00:00`);
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
  }

  function getBadgeType(status) {
    return Object.keys(statuses).find((type) => statuses[type].includes(status)) || "neutral";
  }

  function statusBadge(status) {
    const safeStatus = status || "-";
    return `<span class="badge ${getBadgeType(safeStatus)}">${escapeHtml(safeStatus)}</span>`;
  }

  function getStudentName(student) {
    if (!student) return "-";
    return `${student.firstName || ""} ${student.lastName || ""}`.trim() || "-";
  }

  function getStudentInitials(student) {
    const first = String(student?.firstName || "").trim();
    const last = String(student?.lastName || "").trim();
    const initials = `${first.charAt(0)}${last.charAt(0)}`.trim();
    return initials ? initials.toLocaleUpperCase("tr-TR") : "OG";
  }

  function studentAvatar(student, extraClass) {
    const photo = student?.photo || null;
    const photoUrl = storage.imageUrl(photo);
    const hasPhoto = Boolean(photoUrl);
    const classes = ["student-avatar", extraClass || "", hasPhoto ? "has-photo" : ""].filter(Boolean).join(" ");
    const attrs = hasPhoto ? ` data-photo-url="${escapeHtml(photoUrl)}"` : "";
    return `<span class="${classes}"${attrs}>${escapeHtml(getStudentInitials(student))}</span>`;
  }

  function hydrateStudentPhotos(root) {
    const scope = root || document;
    $$("[data-photo-url]", scope).forEach((element) => {
      if (element.dataset.photoState === "loaded" || element.dataset.photoState === "loading") return;
      const url = element.dataset.photoUrl;
      if (!url) return;
      element.dataset.photoState = "loading";
      // The server serves decrypted bytes; preload so initials stay if it fails.
      const probe = new Image();
      probe.onload = () => {
        element.style.backgroundImage = `url("${url}")`;
        element.textContent = "";
        element.classList.add("is-loaded");
        element.dataset.photoState = "loaded";
      };
      probe.onerror = () => {
        element.dataset.photoState = "error";
      };
      probe.src = url;
    });
  }

  function openStudentPicker(options) {
    const config = options && typeof options === "object" ? options : {};
    const students = (Array.isArray(config.students) ? config.students.slice() : []).sort((a, b) =>
      getStudentName(a).localeCompare(getStudentName(b), "tr")
    );
    const title = String(config.title || "Öğrenci seç");
    const description = String(config.description || "");
    const emptyMessage = String(config.emptyMessage || "Listelenecek öğrenci bulunamadı.");
    const selectLabel = String(config.selectLabel || "Seç");
    const selectedId = String(config.selectedId || "");
    const modalRoot = $("#modal-root");
    if (!modalRoot) return;

    const parentBackdrop = modalRoot.querySelector(".modal-backdrop");
    const overlay = document.createElement("div");
    overlay.className = `modal-backdrop${parentBackdrop ? " modal-backdrop-nested" : ""}`;
    overlay.innerHTML = `
      <section class="modal-box student-picker-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <header class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="icon-btn" data-student-picker-close aria-label="Kapat" title="Kapat">${icon("close")}</button>
        </header>
        <div class="modal-content">
          <div class="student-picker-shell">
            ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}
            <label>Arama<input id="studentPickerSearch" type="search" placeholder="Ad, soyad, telefon veya e-posta ara" /></label>
            <div id="studentPickerList" class="student-picker-grid"></div>
          </div>
        </div>
      </section>
    `;

    const closePicker = () => {
      if (parentBackdrop) {
        overlay.remove();
        return;
      }
      closeModal();
    };

    if (parentBackdrop) {
      parentBackdrop.querySelector(".modal-backdrop-nested")?.remove();
      parentBackdrop.appendChild(overlay);
    } else {
      modalRoot.innerHTML = "";
      modalRoot.appendChild(overlay);
    }

    const searchInput = $("#studentPickerSearch", overlay);
    const list = $("#studentPickerList", overlay);
    const renderMeta = typeof config.renderMeta === "function"
      ? config.renderMeta
      : (student) => student.phone || student.email || "İletişim bilgisi yok";

    const render = () => {
      const query = String(searchInput?.value || "").trim().toLocaleLowerCase("tr-TR");
      const filtered = students.filter((student) => {
        const haystack = [getStudentName(student), student.phone || "", student.email || ""]
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        return !query || haystack.includes(query);
      });

      list.innerHTML = filtered.length
        ? filtered
            .map((student) => `
              <button type="button" class="student-picker-card${student.id === selectedId ? " active" : ""}" data-student-picker-id="${escapeHtml(student.id)}">
                <div class="student-line">
                  ${studentAvatar(student)}
                  <div>
                    <strong>${escapeHtml(getStudentName(student))}</strong>
                    <small>${escapeHtml(renderMeta(student) || "İletişim bilgisi yok")}</small>
                  </div>
                </div>
                <span class="student-picker-card-action">${escapeHtml(selectLabel)}</span>
              </button>
            `)
            .join("")
        : emptyState(emptyMessage);

      hydrateStudentPhotos(overlay);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-student-picker-close]")) {
        closePicker();
      }
    });

    list.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-student-picker-id]");
      if (!button) return;
      const student = students.find((item) => item.id === button.dataset.studentPickerId);
      if (!student) return;
      const result = typeof config.onSelect === "function" ? await config.onSelect(student) : undefined;
      if (result !== false) closePicker();
    });

    if (searchInput) {
      searchInput.addEventListener("input", render);
      searchInput.focus();
      searchInput.select();
    }

    render();
  }

  function closeNestedModal() {
    const nested = $("#modal-root .modal-backdrop-nested");
    if (!nested) return false;
    nested.remove();
    return true;
  }

  function getBranchName(branches, branchId) {
    const branch = branches.find((item) => item.id === branchId);
    return branch ? branch.name : "-";
  }

  function getGroupName(groups, groupId) {
    const group = groups.find((item) => item.id === groupId);
    return group ? group.name : "-";
  }

  function groupSessions(group) {
    if (group && Array.isArray(group.sessions) && group.sessions.length) {
      return group.sessions.filter((session) => session && session.day).map((session) => ({
        day: session.day,
        startTime: session.startTime || "",
        endTime: session.endTime || ""
      }));
    }
    if (group && Array.isArray(group.days) && group.days.length) {
      return group.days.map((day) => ({
        day,
        startTime: group.startTime || "",
        endTime: group.endTime || ""
      }));
    }
    return [];
  }

  function groupDays(group) {
    const sessions = groupSessions(group);
    return [...new Set(sessions.map((session) => session.day))];
  }

  function groupSessionsForDay(group, day) {
    return groupSessions(group)
      .filter((session) => session.day === day)
      .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
  }

  function groupTeacherNames(group, teachers) {
    const list = teachers || storage.getData(storage.KEYS.teachers, []);
    const ids = Array.isArray(group?.instructorIds) ? group.instructorIds : [];
    if (ids.length) {
      return ids
        .map((id) => {
          const teacher = list.find((tc) => tc.id === id);
          return teacher ? `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() : "";
        })
        .filter(Boolean);
    }
    if (group?.instructorName) return [group.instructorName];
    return [];
  }

  function activeEnrollments() {
    return storage.getData(storage.KEYS.enrollments, []).filter((item) => item.status === "Aktif");
  }

  function getGroupStudentCount(groupId) {
    const students = storage.getData(storage.KEYS.students, []);
    const studentMap = new Map(students.map((student) => [student.id, student]));
    return activeEnrollments().filter((item) => {
      const student = studentMap.get(item.studentId);
      return item.groupId === groupId && student && student.status === "Aktif";
    }).length;
  }

  function getBranchStudentCount(branchId) {
    const students = storage.getData(storage.KEYS.students, []);
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const unique = new Set();
    activeEnrollments().forEach((item) => {
      const student = studentMap.get(item.studentId);
      if (item.branchId === branchId && student && student.status === "Aktif") unique.add(item.studentId);
    });
    return unique.size;
  }

  function getBranchRevenue(branchId) {
    return storage
      .normalizePayments(storage.getData(storage.KEYS.payments, []))
      .filter((payment) => payment.branchId === branchId && payment.status !== "İptal")
      .reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
  }

  function attendanceRatio(studentId) {
    const records = storage.getData(storage.KEYS.attendance, []).filter((item) => item.studentId === studentId);
    if (!records.length) return 0;
    const attended = records.filter((item) => ["Geldi", "Geç kaldı", "Telafi"].includes(item.status)).length;
    return Math.round((attended / records.length) * 100);
  }

  function paymentSummaryForStudent(studentId) {
    const payments = storage
      .normalizePayments(storage.getData(storage.KEYS.payments, []))
      .filter((payment) => payment.studentId === studentId && payment.status !== "İptal" && !payment.deleted);
    const remaining = payments.reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);
    const overdue = payments.filter((payment) => payment.status === "Gecikti").length;
    const paid = payments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
    return { payments, remaining, overdue, paid };
  }

  function currentMonthCollected(payments) {
    const now = new Date();
    return payments.reduce((total, payment) => {
      const transactionTotal = (payment.transactions || []).reduce((sum, transaction) => {
        const date = new Date(`${transaction.date}T12:00:00`);
        if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
          return sum + Number(transaction.amount || 0);
        }
        return sum;
      }, 0);
      return total + transactionTotal;
    }, 0);
  }

  function openModal(title, content, options) {
    const root = $("#modal-root");
    if (!root) return;
    const sizeClass = options && options.size === "small" ? " modal-small" : "";
    root.innerHTML = `
      <div class="modal-backdrop">
        <section class="modal-box${sizeClass}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <header class="modal-header">
            <h3>${escapeHtml(title)}</h3>
            <button type="button" class="icon-btn" data-modal-close aria-label="Kapat" title="Kapat">${icon("close")}</button>
          </header>
          <div class="modal-content">${content}</div>
        </section>
      </div>
    `;

    root.onclick = (event) => {
      if (event.target.closest("[data-modal-close]")) closeModal();
    };

    // Make any tables inside the modal mobile-friendly. Also re-enhance tables
    // that are rendered later (e.g. when switching student-detail tabs).
    enhanceTables(root);
    if (window.__cayaModalObserver) window.__cayaModalObserver.disconnect();
    const modalObserver = new MutationObserver(() => enhanceTables(root));
    modalObserver.observe(root, { childList: true, subtree: true });
    window.__cayaModalObserver = modalObserver;
  }

  function closeModal() {
    const root = $("#modal-root");
    if (window.__cayaModalObserver) {
      window.__cayaModalObserver.disconnect();
      window.__cayaModalObserver = null;
    }
    if (root) root.innerHTML = "";
  }

  function toast(message, type) {
    const root = $("#toast-root");
    if (!root) return;
    const item = document.createElement("div");
    item.className = `toast ${type || ""}`;
    item.textContent = message;
    root.appendChild(item);
    setTimeout(() => item.remove(), 3400);
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function applyTheme(theme) {
    const settings = storage.getData(storage.KEYS.settings, {});
    const selected = theme || settings.theme || "light";
    document.documentElement.dataset.theme = selected;
  }

  function getCurrentPage() {
    return document.body.dataset.page || "dashboard";
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function getSidebarPreference() {
    try {
      return localStorage.getItem("caya:sidebarCollapsed") === "1";
    } catch (e) {
      return false;
    }
  }

  function setSidebarPreference(value) {
    try {
      localStorage.setItem("caya:sidebarCollapsed", value ? "1" : "0");
    } catch (e) { /* ignore */ }
  }

  function openSidebar() {
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
  }

  function toggleSidebar() {
    if (isMobileViewport()) {
      document.body.classList.toggle("sidebar-open");
    } else {
      const collapsed = document.body.classList.toggle("sidebar-collapsed");
      setSidebarPreference(collapsed);
    }
  }

  function applyInitialSidebarState() {
    closeSidebar();
    if (!isMobileViewport() && getSidebarPreference()) {
      document.body.classList.add("sidebar-collapsed");
    } else if (isMobileViewport()) {
      document.body.classList.remove("sidebar-collapsed");
    }
  }

  function renderSidebar(pageKey, settings) {
    const sidebar = $("#sidebar");
    if (!sidebar) return;

    const nav = Object.entries(pages)
      .filter(([key]) => access.pageAllowed(key))
      .map(([key, page]) => `
        <a class="nav-link ${key === pageKey ? "active" : ""}" href="${page.href}" data-tooltip="${escapeHtml(page.title)}">
          ${icon(page.icon)}
          <span class="nav-link-label">${escapeHtml(page.title)}</span>
        </a>
      `)
      .join("");

    const logoSrc = settings.logo || appUrl("assets/logo.svg");
    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(settings.gymName || "CaYaSport Panel")}" class="sidebar-brand-logo"
             onerror="this.onerror=null;this.src='${appUrl("assets/logo.svg")}';" />
        <div class="sidebar-brand-text">
          <strong>${escapeHtml(settings.gymName || "CaYaSport Panel")}</strong>
          <span>${escapeHtml(settings.logoText || "CYS")} Yönetim</span>
        </div>
      </div>
      <nav class="sidebar-nav">${nav}</nav>
      <div class="sidebar-footer">
        ${icon("shield")}
        <small>Veriler CaYaDev hesabına bağlı olarak sunucuda şifreli saklanır.</small>
      </div>
    `;
  }

  function renderTopbar(pageKey, session) {
    const topbar = $("#topbar");
    if (!topbar) return;
    const page = pages[pageKey] || pages.dashboard;
    const notifications = window.CaYaNotifications ? window.CaYaNotifications.generatePaymentNotifications() : [];
    const count = notifications.length;
    const settings = storage.getData(storage.KEYS.settings, {});
    const currentTheme = settings.theme || "light";
    const themeIcon = currentTheme === "dark" ? "sun" : "moon";
    const themeLabel = currentTheme === "dark" ? "Aydınlık tema" : "Karanlık tema";
    const avatarSrc = session.avatar || appUrl("assets/logo.svg");

    topbar.innerHTML = `
      <div class="topbar-left">
        <button type="button" class="icon-btn" id="sidebarToggle" aria-label="Menüyü aç/kapat" title="Menü">${icon("menu")}</button>
        <div class="topbar-title">
          <h1>${escapeHtml(page.title)}</h1>
          <span>${escapeHtml(page.subtitle)}</span>
        </div>
        <a class="workspace-switch" id="workspaceSwitch" href="${appUrl("workspaces.html")}" title="Çalışma alanını değiştir">
          ${icon("layers")}
          <span class="workspace-switch-name" id="workspaceSwitchName">Çalışma alanı</span>
          ${icon("chevronDown")}
        </a>
      </div>
      <div class="topbar-right">
        <a class="icon-btn" id="notificationButton" href="${appUrl("payments.html")}" aria-label="Uyarılar" title="Uyarılar (${count})">
          ${icon("bell")}
          ${count > 0 ? `<span class="badge-dot">${count > 99 ? "99+" : count}</span>` : ""}
        </a>
        <button type="button" class="icon-btn" id="themeToggle" aria-label="${themeLabel}" title="${themeLabel}">${icon(themeIcon)}</button>
        <span class="user-pill" title="${escapeHtml(session.fullName || session.username)}">
          <span class="avatar"><img src="${escapeHtml(avatarSrc)}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${appUrl("assets/logo.svg")}';" /></span>
          <span class="name">${escapeHtml(session.fullName || session.username)}</span>
        </span>
        <button type="button" class="icon-btn" id="logoutButton" aria-label="Çıkış yap" title="Çıkış yap">${icon("logout")}</button>
      </div>
    `;

    $("#sidebarToggle")?.addEventListener("click", toggleSidebar);
    $("#themeToggle")?.addEventListener("click", () => {
      const current = storage.getData(storage.KEYS.settings, {});
      current.theme = (current.theme || "light") === "dark" ? "light" : "dark";
      storage.setData(storage.KEYS.settings, current);
      applyTheme(current.theme);
      renderTopbar(pageKey, session);
    });
    $("#logoutButton")?.addEventListener("click", auth.logout);
    updateWorkspaceSwitchName();
  }

  const ROLE_LABELS = { owner: "Sahip", yönetici: "Yönetici", eğitmen: "Eğitmen", görüntüleyici: "Görüntüleyici", özel: "Özel yetki" };

  // Reflect the active workspace + role in the topbar switcher from the loaded context.
  function updateWorkspaceSwitchName() {
    const label = $("#workspaceSwitchName");
    if (!label || !accessContext) return;
    const roleLabel = ROLE_LABELS[accessContext.role] || accessContext.role;
    const suffix = accessContext.isOwner ? "" : ` · ${roleLabel}`;
    label.textContent = `${accessContext.workspaceName || "Çalışma alanı"}${suffix}`;
    const chip = $("#workspaceSwitch");
    if (chip && !accessContext.isOwner) chip.title = `${accessContext.workspaceName} — ${accessContext.ownerName} (${roleLabel})`;
  }

  function renderShell() {
    const pageKey = getCurrentPage();
    const session = auth.requireAuth();
    if (!session) return false;

    const settings = storage.getData(storage.KEYS.settings, {});
    applyTheme(settings.theme);
    applyInitialSidebarState();
    renderSidebar(pageKey, settings);
    renderTopbar(pageKey, session);

    if (!$(".mobile-overlay")) {
      const overlay = document.createElement("button");
      overlay.type = "button";
      overlay.className = "mobile-overlay";
      overlay.setAttribute("aria-label", "Menüyü kapat");
      overlay.addEventListener("click", closeSidebar);
      document.body.appendChild(overlay);
    }

    $$(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        if (isMobileViewport()) closeSidebar();
      });
    });

    if (!window.__cayaResizeBound) {
      window.__cayaResizeBound = true;
      window.addEventListener("resize", () => {
        if (!isMobileViewport()) closeSidebar();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) {
          closeSidebar();
        }
      });
    }

    return true;
  }

  /**
   * Convert tables that have a thead with <th> into mobile-responsive
   * card layout by adding data-label attributes to each <td>.
   * The CSS handles the visual transformation under 720px.
   */
  function enhanceTables(root) {
    const scope = root || document;
    scope.querySelectorAll("table").forEach((table) => {
      if (table.dataset.cayaEnhanced === "1") return;
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
        th.textContent.trim().replace(/\s+/g, " ")
      );
      if (!headers.length) return;
      table.classList.add("responsive-table");
      table.querySelectorAll("tbody tr").forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (cell.tagName !== "TD") return;
          if (!cell.hasAttribute("data-label")) {
            cell.setAttribute("data-label", headers[index] || "");
          }
        });
      });
      table.dataset.cayaEnhanced = "1";
    });
  }

  // For view-only modules: hide the page-header "create" button and show a banner.
  // Reapplied on every page-content change so it survives in-page re-renders.
  function applyReadOnlyUi() {
    const module = PAGE_MODULE[getCurrentPage()];
    if (!module || module === "__owner__" || access.canEdit(module)) return;
    const content = $("#page-content");
    if (!content) return;
    const primary = content.querySelector(".page-header .btn-primary");
    if (primary) primary.style.display = "none";
    if (!$("#readonlyBanner")) {
      const banner = document.createElement("div");
      banner.id = "readonlyBanner";
      banner.className = "readonly-banner";
      banner.textContent = "Görüntüleme yetkisi: Bu bölümde değişiklik yapamazsınız.";
      content.insertBefore(banner, content.firstChild);
    }
  }

  /**
   * Observe page-content for dynamically rendered tables and auto-enhance.
   */
  function setupTableObserver() {
    const target = $("#page-content");
    if (!target || window.__cayaTableObserver) return;
    const observer = new MutationObserver(() => {
      enhanceTables(target);
      applyReadOnlyUi();
    });
    observer.observe(target, { childList: true, subtree: true });
    window.__cayaTableObserver = observer;
    enhanceTables(target);
    applyReadOnlyUi();
  }

  /**
   * @param {string} label
   * @param {string|number} value
   * @param {string} note
   * @param {{ tone?: string, icon?: string }} [options]
   */
  function renderStat(label, value, note, options) {
    const opts = typeof options === "string" ? { tone: options } : options || {};
    const tone = opts.tone || "neutral";
    const iconName = opts.icon || "dashboard";
    return `
      <section class="card stat-card" data-tone="${escapeHtml(tone)}">
        <div class="label">
          <span>${escapeHtml(label)}</span>
          <span class="label-icon">${icon(iconName)}</span>
        </div>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(note || "")}</small>
      </section>
    `;
  }

  function currentMonthSalaryPaid(salaries) {
    const now = new Date();
    return (salaries || []).reduce((total, salary) => {
      return total + (salary.transactions || []).reduce((sum, tx) => {
        const d = new Date(`${tx.date}T12:00:00`);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          return sum + Number(tx.amount || 0);
        }
        return sum;
      }, 0);
    }, 0);
  }

  function renderDashboard() {
    const root = $("#page-content");
    if (!root) return;

    const students = storage.getData(storage.KEYS.students, []);
    const branches = storage.getData(storage.KEYS.branches, []);
    const groups = storage.getData(storage.KEYS.groups, []);
    const enrollments = activeEnrollments();
    const payments = storage.normalizePayments(storage.getData(storage.KEYS.payments, []));
    const canPay = access.canView("payments");
    const canSal = access.canView("salaries");

    const activeStudents = students.filter((student) => student.status === "Aktif");
    const passiveStudents = students.filter((student) => student.status !== "Aktif");
    const today = storage.todayISO();
    const todayName = getTodayName();
    const todayGroups = groups.filter((group) => group.status === "Aktif" && groupDays(group).includes(todayName));
    const pendingTotal = payments
      .filter((payment) => ["Bekliyor", "Kısmi ödendi"].includes(payment.status))
      .reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);
    const overduePayments = payments.filter((payment) => payment.status === "Gecikti");
    const todayAttendance = storage.getData(storage.KEYS.attendance, []).filter((item) => item.date === today);
    const attendedToday = todayAttendance.filter((item) => item.status === "Geldi").length;

    const branchCounts = branches.map((branch) => ({
      branch,
      count: getBranchStudentCount(branch.id)
    }));
    const topBranch = branchCounts.sort((a, b) => b.count - a.count)[0];
    const notifications = window.CaYaNotifications.generatePaymentNotifications();
    const upcoming = notifications.filter((item) => item.daysRemaining >= 0).slice(0, 5);
    const overdue = notifications.filter((item) => item.daysRemaining < 0).slice(0, 5);

    const nextPending = payments
      .filter((p) => p.status !== "İptal" && Number(p.remainingAmount || 0) > 0)
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")))[0];
    const nextDays = nextPending && window.CaYaEngine ? window.CaYaEngine.daysFromToday(nextPending.dueDate) : null;
    let nextLabel = "-";
    let nextNote = "Bekleyen ödeme yok";
    if (nextPending) {
      nextLabel = formatDate(nextPending.dueDate);
      if (nextDays === null) nextNote = "Vade belirsiz";
      else if (nextDays > 0) nextNote = `${nextDays} gün kaldı`;
      else if (nextDays === 0) nextNote = "Bugün";
      else nextNote = `${Math.abs(nextDays)} gün gecikmiş`;
    }
    const recentStudents = [...students]
      .sort((a, b) => String(b.registrationDate || "").localeCompare(String(a.registrationDate || "")))
      .slice(0, 5);

    // Salary data for dashboard
    const teacherSalaries = window.CaYaEngine
      ? window.CaYaEngine.normalizeSalaries(storage.getData(storage.KEYS.teacherSalaries, []))
      : storage.getData(storage.KEYS.teacherSalaries, []);
    const teachers = storage.getData(storage.KEYS.teachers, []);
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthIncome = currentMonthCollected(payments);
    const thisMonthSalaryPaid = currentMonthSalaryPaid(teacherSalaries);
    const netIncome = thisMonthIncome - thisMonthSalaryPaid;
    const activeTeachers = teachers.filter((t) => t.status === "Aktif" && Number(t.monthlySalary || 0) > 0);
    const totalSalaryDue = teacherSalaries.filter((s) => s.status !== "İptal").reduce((sum, s) => sum + Number(s.remainingAmount || 0), 0);

    const teacherSalaryItems = activeTeachers.map((teacher) => {
      const ts = teacherSalaries.filter((s) => s.teacherId === teacher.id && s.status !== "İptal");
      const currentSalary = ts.find((s) => s.period === currentPeriod);
      const status = currentSalary ? currentSalary.status : "Bekliyor";
      const unpaidNext = ts
        .filter((s) => s.status !== "Ödendi" && Number(s.remainingAmount || 0) > 0)
        .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")))[0];

      let nextInfo = "-";
      if (unpaidNext) {
        const days = window.CaYaEngine?.daysFromToday(unpaidNext.dueDate);
        if (days === null) nextInfo = formatDate(unpaidNext.dueDate);
        else if (days > 0) nextInfo = `${formatDate(unpaidNext.dueDate)} · ${days} gün kaldı`;
        else if (days === 0) nextInfo = `${formatDate(unpaidNext.dueDate)} · Bugün`;
        else nextInfo = `${formatDate(unpaidNext.dueDate)} · ${Math.abs(days)} gün gecikti`;
      } else {
        const rawStart = teacher.startDate || teacher.salaryEffectiveDate;
        if (rawStart) {
          const startDay = new Date(`${rawStart}T12:00:00`).getDate();
          const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          const day = Math.min(startDay, lastDay);
          const nextISO = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const days = window.CaYaEngine?.daysFromToday(nextISO);
          nextInfo = `${formatDate(nextISO)} · ${days !== null ? days + " gün kaldı" : ""}`;
        }
      }

      const name = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || teacher.id;
      return `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <small>${formatCurrency(Number(teacher.monthlySalary || 0))}/ay · Sonraki: ${escapeHtml(nextInfo)}</small>
          </div>
          ${statusBadge(status)}
        </div>
      `;
    });

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Genel Bakış</h2>
          <p>${escapeHtml(todayName)} dersleri, ödemeler ve öğrenci durumu tek ekranda.</p>
        </div>
        <div class="actions">
          ${access.canEdit("students") ? `<a class="btn" href="${appUrl("students.html")}">${icon("add")}<span>Öğrenci ekle</span></a>` : ""}
          ${access.canView("payments") ? `<a class="btn btn-primary" href="${appUrl("payments.html")}">${icon("payments")}<span>Ödeme yönet</span></a>` : ""}
        </div>
      </section>

      <section class="grid stats">
        ${[
          renderStat("Toplam öğrenci", students.length, "Tüm durumlar", { tone: "info", icon: "students" }),
          renderStat("Aktif öğrenci", activeStudents.length, "Yoklama listesine dahil", { tone: "success", icon: "students" }),
          renderStat("Pasif / diğer", passiveStudents.length, "Pasif, dondurulmuş, ayrıldı", { tone: "neutral", icon: "students" }),
          renderStat("Toplam branş", branches.length, "Aktif/pasif branşlar", { tone: "info", icon: "branches" }),
          renderStat("Toplam grup", groups.length, "Seans ve grup sayısı", { tone: "info", icon: "groups" }),
          renderStat("Bugünkü ders", todayGroups.length, `${todayName} programı`, { tone: "info", icon: "attendance" }),
          canPay ? renderStat("Bu ay tahsilat", formatCurrency(currentMonthCollected(payments)), "İşlenen ödeme hareketleri", { tone: "success", icon: "payments" }) : "",
          canSal ? renderStat("Bu ay maaş gideri", formatCurrency(thisMonthSalaryPaid), "Bu ay ödenen öğretmen maaşları", { tone: "warning", icon: "salaries" }) : "",
          (canPay && canSal) ? renderStat("Bu ay net gelir", formatCurrency(netIncome), "Tahsilat − maaş gideri", { tone: netIncome >= 0 ? "success" : "danger", icon: "reports" }) : "",
          canSal ? renderStat("Toplam maaş borcu", formatCurrency(totalSalaryDue), "Ödenmemiş öğretmen maaşları", { tone: totalSalaryDue > 0 ? "danger" : "neutral", icon: "salaries" }) : "",
          canPay ? renderStat("Bekleyen ödeme", formatCurrency(pendingTotal), "Vadesi gelmemiş açık bakiye", { tone: "warning", icon: "payments" }) : "",
          canPay ? renderStat("Sıradaki ödeme", nextLabel, nextNote, { tone: "info", icon: "attendance" }) : "",
          canPay ? renderStat("Geciken ödeme", overduePayments.length, formatCurrency(overduePayments.reduce((sum, item) => sum + item.remainingAmount, 0)), { tone: overduePayments.length ? "danger" : "neutral", icon: "unpaid" }) : "",
          renderStat("Bugünkü yoklama", todayAttendance.length ? `${attendedToday}/${todayAttendance.length}` : "Alınmadı", "Geldi kayıtları / toplam kayıt", { tone: "info", icon: "attendance" }),
          renderStat("En yoğun branş", topBranch && topBranch.count ? topBranch.branch.name : "-", topBranch ? `${topBranch.count} aktif öğrenci` : "", { tone: "info", icon: "branches" }),
          renderStat("Aktif kayıt", enrollments.length, "Branş ve grup kayıtları", { tone: "success", icon: "check" })
        ].filter(Boolean).join("")}
      </section>

      <section class="grid two" style="margin-top: 18px;">
        <div class="table-panel">
          <div class="table-header">
            <h3>Son eklenen öğrenciler</h3>
            <a class="btn btn-ghost" href="${appUrl("students.html")}">Tümünü gör</a>
          </div>
          <div class="compact-list" style="padding: 16px;">
            ${recentStudents.length ? recentStudents.map((student) => `
              <div class="list-item">
                <div class="student-line">
                  ${studentAvatar(student)}
                  <div>
                  <strong>${escapeHtml(getStudentName(student))}</strong>
                  <small>${formatDate(student.registrationDate)} · ${escapeHtml(student.phone || "-")}</small>
                  </div>
                </div>
                ${statusBadge(student.status)}
              </div>
            `).join("") : emptyState("Henüz öğrenci kaydı yok.")}
          </div>
        </div>

        ${canSal ? `
        <div class="table-panel">
          <div class="table-header">
            <h3>Öğretmen Maaş Durumları</h3>
            <a class="btn btn-ghost" href="${appUrl("salaries.html")}">Tümünü gör</a>
          </div>
          <div class="compact-list" style="padding: 16px;">
            ${activeTeachers.length ? teacherSalaryItems.join("") : emptyState("Maaşlı aktif öğretmen yok.")}
          </div>
        </div>` : ""}
      </section>

      ${canPay ? `
      <section class="grid two" style="margin-top: 12px;">
        <div class="table-panel">
          <div class="table-header">
            <h3>Yaklaşan ödemeler</h3>
            <span class="chip">${upcoming.length}</span>
          </div>
          <div class="compact-list" style="padding: 16px;">
            ${upcoming.length ? upcoming.map((item) => `
              <div class="list-item">
                <div>
                  <strong>${escapeHtml(item.studentName)}</strong>
                  <small>${escapeHtml(item.branchName)} · ${formatDate(item.dueDate)} · ${formatCurrency(item.remainingAmount)}</small>
                </div>
                ${statusBadge(item.title)}
              </div>
            `).join("") : emptyState("Yaklaşan ödeme uyarısı yok.")}
          </div>
        </div>

        <div class="table-panel">
          <div class="table-header">
            <h3>Geciken ödemeler</h3>
            <span class="chip">${overdue.length}</span>
          </div>
          <div class="compact-list" style="padding: 16px;">
            ${overdue.length ? overdue.map((item) => `
              <div class="list-item">
                <div>
                  <strong>${escapeHtml(item.studentName)}</strong>
                  <small>${escapeHtml(item.branchName)} · ${Math.abs(item.daysRemaining)} gün gecikti · ${formatCurrency(item.remainingAmount)}</small>
                </div>
                ${statusBadge(item.title)}
              </div>
            `).join("") : emptyState("Geciken ödeme uyarısı yok.")}
          </div>
        </div>
      </section>` : ""}
    `;
    hydrateStudentPhotos(root);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (closeNestedModal()) return;
    closeModal();
  });

  function registerPage(page, renderer) {
    pageRenderers.set(page, renderer);
    if (booted && getCurrentPage() === page) renderer();
  }

  async function bootApp() {
    const page = getCurrentPage();
    if (page === "login" || page === "index") return;

    await auth.ready;
    if (!auth.isAuthenticated()) {
      window.location.replace(appUrl("login.html"));
      return;
    }

    await storage.ready;
    await loadAccessContext();
    // Only the owner regenerates payment/salary plans (avoids permission errors
    // for scoped users and keeps generated data owned by the account).
    if (access.isOwner() && window.CaYaEngine && typeof window.CaYaEngine.runAll === "function") {
      window.CaYaEngine.runAll();
    }
    if (!renderShell()) return;
    booted = true;
    setupTableObserver();

    if (!access.pageAllowed(page)) {
      const root = $("#page-content");
      if (root) {
        root.innerHTML = `<section class="page-header"><div><h2>Erişim yok</h2><p>Bu bölümü görüntüleme yetkiniz bulunmuyor. Çalışma alanı sahibinden yetki isteyebilirsiniz.</p></div></section>`;
      }
      return;
    }

    const renderer = page === "dashboard" ? renderDashboard : pageRenderers.get(page);
    if (renderer) renderer();
    enhanceTables();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootApp().catch((error) => {
      console.error(error);
      const root = $("#page-content");
      if (root) root.innerHTML = emptyState(error.message || "Sayfa yüklenemedi.");
    });
  });

  // When the server reconciles/rejects a write, re-render the active page so the
  // screen reflects what was actually stored (no phantom rows from rejected edits).
  window.addEventListener("caya:datachanged", () => {
    if (!booted) return;
    const page = getCurrentPage();
    if (!access.pageAllowed(page)) return;
    const renderer = page === "dashboard" ? renderDashboard : pageRenderers.get(page);
    if (renderer) renderer();
  });

  window.CaYaApp = {
    $,
    $$,
    pages,
    icons,
    icon,
    access,
    renderShell,
    renderDashboard,
    registerPage,
    bootApp,
    openModal,
    closeModal,
    toast,
    emptyState,
    escapeHtml,
    formatCurrency,
    formatDate,
    getTodayName,
    daysBetween,
    statusBadge,
    getStudentName,
    studentAvatar,
    hydrateStudentPhotos,
    openStudentPicker,
    getBranchName,
    getGroupName,
    getGroupStudentCount,
    getBranchStudentCount,
    getBranchRevenue,
    attendanceRatio,
    paymentSummaryForStudent,
    activeEnrollments,
    applyTheme,
    enhanceTables,
    groupSessions,
    groupDays,
    groupSessionsForDay,
    groupTeacherNames
  };
})();
