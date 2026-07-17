(function () {
  "use strict";

  const MAX_ENTRIES = 500;

  const CATEGORIES = {
    students:   { label: "Öğrenci",   color: "blue"    },
    teachers:   { label: "Öğretmen",  color: "teal"    },
    payments:   { label: "Ödeme",     color: "green"   },
    salaries:   { label: "Maaş",      color: "purple"  },
    branches:   { label: "Branş",     color: "amber"   },
    groups:     { label: "Grup",      color: "cyan"    },
    attendance: { label: "Yoklama",   color: "indigo"  },
    settings:   { label: "Ayarlar",   color: "gray"    },
    system:     { label: "Sistem",    color: "neutral" }
  };

  const ACTION_COLORS = {
    add:        "success",
    edit:       "info",
    delete:     "danger",
    cancel:     "danger",
    reopen:     "warning",
    payment:    "success",
    passive:    "warning",
    attendance: "info",
    settings:   "neutral",
    reset:      "danger"
  };

  function log(category, action, description) {
    const storage = window.CaYaStorage;
    if (!storage) return;
    try {
      const session = window.CaYaAuth && typeof window.CaYaAuth.getSession === "function" ? window.CaYaAuth.getSession() : null;
      const entries = storage.getData(storage.KEYS.auditLog, []);
      entries.unshift({
        id: storage.generateId("audit"),
        timestamp: new Date().toISOString(),
        category: category || "system",
        action: action || "action",
        description: String(description || ""),
        // Shown immediately; the server re-stamps this authoritatively on save.
        actor: session ? (session.fullName || session.username || "") : "",
        actorEmail: session ? (session.email || "") : ""
      });
      if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
      storage.setData(storage.KEYS.auditLog, entries);
    } catch (_) {}
  }

  /* ── Page renderer ── */

  function renderAuditPage() {
    const app = window.CaYaApp;
    const storage = window.CaYaStorage;
    const root = app.$("#page-content");
    if (!root) return;

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Denetim Kaydı</h2>
          <p>Tüm kullanıcı işlemlerinin tarih ve saat damgalı kayıtları.</p>
        </div>
        <button class="btn btn-ghost" id="clearAuditBtn">Kayıtları Temizle</button>
      </section>

      <section class="toolbar">
        <div class="filters">
          <input id="auditSearch" type="search" placeholder="İşlem, açıklama veya kullanıcı ara" />
          <select id="auditCategoryFilter">
            <option value="">Tüm kategoriler</option>
            ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${app.escapeHtml(c.label)}</option>`).join("")}
          </select>
        </div>
      </section>

      <div class="table-panel" style="margin-top: 12px;">
        <div class="table-header">
          <h3>İşlem Geçmişi</h3>
          <span class="chip" id="auditCount"></span>
        </div>
        <div id="auditList" class="audit-list"></div>
      </div>
    `;

    app.$("#auditSearch")?.addEventListener("input", renderEntries);
    app.$("#auditCategoryFilter")?.addEventListener("change", renderEntries);
    app.$("#clearAuditBtn")?.addEventListener("click", () => {
      if (!confirm("Tüm denetim kayıtları silinsin mi? Bu işlem geri alınamaz.")) return;
      storage.setData(storage.KEYS.auditLog, []);
      renderEntries();
      app.toast("Denetim kayıtları temizlendi.", "success");
    });

    renderEntries();
  }

  function renderEntries() {
    const app = window.CaYaApp;
    const storage = window.CaYaStorage;
    const listEl = app.$("#auditList");
    const countEl = app.$("#auditCount");
    if (!listEl) return;

    const search = (app.$("#auditSearch")?.value || "").toLocaleLowerCase("tr-TR");
    const catFilter = app.$("#auditCategoryFilter")?.value || "";

    let entries = storage.getData(storage.KEYS.auditLog, []);
    // Sort newest-first; entries from different users arrive in any order.
    entries = entries.slice().sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
    if (catFilter) entries = entries.filter((e) => e.category === catFilter);
    if (search) entries = entries.filter((e) =>
      (e.description || "").toLocaleLowerCase("tr-TR").includes(search) ||
      (e.actor || "").toLocaleLowerCase("tr-TR").includes(search) ||
      (e.actorEmail || "").toLocaleLowerCase("tr-TR").includes(search)
    );

    if (countEl) countEl.textContent = `${entries.length} kayıt`;

    if (!entries.length) {
      listEl.innerHTML = `<div class="empty-state" style="padding: 32px 16px;">Henüz denetim kaydı yok.</div>`;
      return;
    }

    listEl.innerHTML = entries.map((entry) => {
      const cat = CATEGORIES[entry.category] || { label: entry.category, color: "neutral" };
      const actionColor = ACTION_COLORS[entry.action] || "neutral";
      const date = new Date(entry.timestamp);
      const dateStr = new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
      const timeStr = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);

      return `
        <div class="audit-entry audit-left-${cat.color}">
          <div class="audit-time">
            <span class="audit-date">${app.escapeHtml(dateStr)}</span>
            <span class="audit-clock">${app.escapeHtml(timeStr)}</span>
          </div>
          <div class="audit-body">
            <span class="audit-cat-badge audit-cat-${cat.color}">${app.escapeHtml(cat.label)}</span>
            <span class="audit-action-dot audit-action-${actionColor}"></span>
            <span class="audit-desc">${app.escapeHtml(entry.description)}</span>
            ${entry.actor ? `<span class="audit-actor" title="${app.escapeHtml(entry.actorEmail || "")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${app.escapeHtml(entry.actor)}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  window.CaYaAudit = { log };
  window.CaYaApp && window.CaYaApp.registerPage("audit", renderAuditPage);

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.CaYaApp) return;
    window.CaYaApp.registerPage("audit", renderAuditPage);
  });
})();
