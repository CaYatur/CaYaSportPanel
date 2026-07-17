(function () {
  "use strict";

  const storage = window.CaYaStorage;
  const app = window.CaYaApp;
  const appUrl = window.CaYaAppUrl || ((value) => String(value || "").replace(/^\/+/, ""));

  const ROLE_LABELS = { yönetici: "Yönetici", eğitmen: "Eğitmen", görüntüleyici: "Görüntüleyici", özel: "Özel yetki" };
  const MODULE_LABELS = {
    students: "Öğrenciler",
    branches: "Branşlar",
    teachers: "Öğretmenler",
    groups: "Gruplar",
    attendance: "Yoklama",
    payments: "Ödemeler",
    salaries: "Maaşlar",
    reports: "Raporlar",
    audit: "Denetim Kaydı",
    settings: "Ayarlar"
  };
  const LEVEL_LABELS = { none: "Yok", view: "Görüntüle", edit: "Düzenle" };

  let serverMeta = { roles: ["yönetici", "eğitmen", "görüntüleyici"], modules: Object.keys(MODULE_LABELS), presets: {} };

  async function api(url, options) {
    const response = await fetch(appUrl(url), {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options && options.headers ? options.headers : {}) },
      ...options
    });
    if (response.status === 401) {
      window.location.replace(appUrl("login.html"));
      throw new Error("Oturum bulunamadı.");
    }
    if (!response.ok) {
      let message = "İstek başarısız oldu.";
      try {
        const body = await response.json();
        message = body.message || body.error || message;
      } catch (e) { /* ignore */ }
      throw new Error(message);
    }
    return response.json();
  }

  function branchName(branchId) {
    const branch = storage.getData(storage.KEYS.branches, []).find((b) => b.id === branchId);
    return branch ? branch.name : branchId;
  }

  function branchScopeSummary(scope) {
    if (scope === "all" || !Array.isArray(scope)) return "Tüm branşlar";
    if (!scope.length) return "Branş seçilmemiş";
    return scope.map(branchName).join(", ");
  }

  function permissionSummary(grant) {
    if (grant.role !== "özel") return ROLE_LABELS[grant.role] || grant.role;
    const perms = grant.permissions || {};
    const editable = Object.keys(perms).filter((m) => perms[m] === "edit").map((m) => MODULE_LABELS[m]);
    const viewable = Object.keys(perms).filter((m) => perms[m] === "view").map((m) => MODULE_LABELS[m]);
    const parts = [];
    if (editable.length) parts.push(`Düzenle: ${editable.join(", ")}`);
    if (viewable.length) parts.push(`Görüntüle: ${viewable.join(", ")}`);
    return parts.join(" · ") || "Yetki yok";
  }

  function grantCard(grant) {
    return `
      <article class="card grant-card" data-id="${app.escapeHtml(grant.id)}">
        <div class="grant-main">
          <span class="grant-email">${app.escapeHtml(grant.granteeEmail)}</span>
          ${grant.granteeLabel ? `<small class="muted">${app.escapeHtml(grant.granteeLabel)}</small>` : ""}
          <div class="grant-badges">
            <span class="badge info">${app.escapeHtml(ROLE_LABELS[grant.role] || grant.role)}</span>
            <span class="chip">${app.escapeHtml(branchScopeSummary(grant.branchScope))}</span>
          </div>
          <small class="muted">${app.escapeHtml(permissionSummary(grant))}</small>
        </div>
        <div class="actions">
          <button class="btn" data-action="edit" data-id="${app.escapeHtml(grant.id)}">Düzenle</button>
          <button class="btn btn-warning" data-action="delete" data-id="${app.escapeHtml(grant.id)}">Kaldır</button>
        </div>
      </article>
    `;
  }

  let grants = [];

  async function loadGrants() {
    const data = await api("api/workspaces/grants");
    grants = data.grants || [];
    serverMeta = { roles: data.roles || serverMeta.roles, modules: data.modules || serverMeta.modules, presets: data.presets || {} };
    renderList();
  }

  function renderList() {
    const host = app.$("#grantList");
    if (!host) return;
    host.innerHTML = grants.length
      ? grants.map(grantCard).join("")
      : app.emptyState("Henüz kimseye yetki verilmedi. “Yetki ver” ile başlayın.");
  }

  function renderPage() {
    const root = app.$("#page-content");
    if (!root) return;
    const ctx = app.access.context();
    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Yetkiler</h2>
          <p><strong>${app.escapeHtml((ctx && ctx.workspaceName) || "Bu çalışma alanı")}</strong> için başkalarına kapsamlı erişim verin. Yetkili kişi, kendi CaYaDev hesabıyla giriş yaptığında bu alanı görür.</p>
        </div>
        <button class="btn btn-primary" id="newGrantButton">Yetki ver</button>
      </section>

      <section class="grant-list" id="grantList"></section>
    `;

    app.$("#newGrantButton").addEventListener("click", () => openGrantForm());
    app.$("#grantList").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const grant = grants.find((g) => g.id === button.dataset.id);
      if (!grant) return;
      if (button.dataset.action === "edit") openGrantForm(grant);
      if (button.dataset.action === "delete") deleteGrant(grant);
    });

    loadGrants().catch((error) => {
      app.$("#grantList").innerHTML = app.emptyState(error.message || "Yetkiler yüklenemedi.");
    });
  }

  function moduleRow(module, level) {
    const options = ["none", "view", "edit"]
      .map((value) => `<option value="${value}" ${value === level ? "selected" : ""}>${LEVEL_LABELS[value]}</option>`)
      .join("");
    return `
      <div class="perm-row">
        <span>${app.escapeHtml(MODULE_LABELS[module] || module)}</span>
        <select data-perm="${module}">${options}</select>
      </div>
    `;
  }

  function grantFormHtml(grant) {
    const branches = storage.getData(storage.KEYS.branches, []);
    const editing = Boolean(grant);
    const role = grant ? grant.role : "görüntüleyici";
    const scope = grant ? grant.branchScope : "all";
    const scopeAll = scope === "all" || !Array.isArray(scope);
    const selectedBranches = Array.isArray(scope) ? scope : [];
    const perms = (grant && grant.permissions) || {};

    return `
      <form id="grantForm" class="form-card">
        <div class="form-grid">
          <label class="span-2">Yetkili e-postası (CaYaDev)
            <input name="granteeEmail" type="email" value="${app.escapeHtml(grant ? grant.granteeEmail : "")}" ${editing ? "readonly" : ""} placeholder="kisi@example.com" required />
          </label>
          <label class="span-2">Görünen ad <small class="muted">(isteğe bağlı)</small>
            <input name="granteeLabel" value="${app.escapeHtml(grant ? grant.granteeLabel || "" : "")}" placeholder="örn. Ahmet — Eğitmen" />
          </label>
          <label class="span-2">Rol
            <select name="role" id="grantRole">
              <option value="yönetici" ${role === "yönetici" ? "selected" : ""}>Yönetici (geniş yetki)</option>
              <option value="eğitmen" ${role === "eğitmen" ? "selected" : ""}>Eğitmen (öğrenci + yoklama)</option>
              <option value="görüntüleyici" ${role === "görüntüleyici" ? "selected" : ""}>Görüntüleyici (sadece görür)</option>
              <option value="özel" ${role === "özel" ? "selected" : ""}>Özel (modül modül ayarla)</option>
            </select>
          </label>
        </div>

        <div id="customPerms" style="${role === "özel" ? "" : "display:none;"}">
          <p class="muted" style="margin:6px 0;">Her modül için yetki düzeyi:</p>
          <div class="perm-grid">
            ${serverMeta.modules.map((module) => moduleRow(module, perms[module] || "none")).join("")}
          </div>
        </div>

        <div>
          <p class="muted" style="margin:10px 0 4px;">Branş kapsamı</p>
          <label class="checkbox-row"><input type="radio" name="scopeType" value="all" ${scopeAll ? "checked" : ""} /> Tüm branşlar</label>
          <label class="checkbox-row"><input type="radio" name="scopeType" value="specific" ${!scopeAll ? "checked" : ""} /> Belirli branşlar</label>
          <div class="branch-scope-grid" id="branchScopeGrid" style="${scopeAll ? "display:none;" : ""}">
            ${branches.length
              ? branches.map((branch) => `
                  <label class="checkbox-row"><input type="checkbox" name="branchId" value="${app.escapeHtml(branch.id)}" ${selectedBranches.includes(branch.id) ? "checked" : ""} /> ${app.escapeHtml(branch.name)}</label>
                `).join("")
              : '<small class="muted">Bu çalışma alanında henüz branş yok.</small>'}
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn" data-modal-close>Vazgeç</button>
          <button type="submit" class="btn btn-primary">${editing ? "Güncelle" : "Yetki ver"}</button>
        </div>
      </form>
    `;
  }

  function openGrantForm(grant) {
    app.openModal(grant ? "Yetkiyi düzenle" : "Yetki ver", grantFormHtml(grant));

    const form = app.$("#grantForm");
    const roleSelect = app.$("#grantRole");
    const customPerms = app.$("#customPerms");
    const branchGrid = app.$("#branchScopeGrid");

    roleSelect.addEventListener("change", () => {
      customPerms.style.display = roleSelect.value === "özel" ? "" : "none";
    });

    form.querySelectorAll('input[name="scopeType"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const specific = form.querySelector('input[name="scopeType"]:checked').value === "specific";
        branchGrid.style.display = specific ? "" : "none";
      });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const granteeEmail = String(data.get("granteeEmail") || "").trim();
      const role = String(data.get("role") || "görüntüleyici");
      const scopeType = String(data.get("scopeType") || "all");
      const branchScope = scopeType === "all" ? "all" : data.getAll("branchId").map(String);
      const permissions = {};
      if (role === "özel") {
        form.querySelectorAll("select[data-perm]").forEach((select) => {
          permissions[select.dataset.perm] = select.value;
        });
      }

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await api("api/workspaces/grants", {
          method: "POST",
          body: JSON.stringify({
            granteeEmail,
            granteeLabel: String(data.get("granteeLabel") || "").trim(),
            role,
            branchScope,
            permissions
          })
        });
        app.closeModal();
        app.toast("Yetki kaydedildi.", "success");
        await loadGrants();
        window.CaYaAudit?.log("permissions", grant ? "edit" : "add", `Yetki ${grant ? "güncellendi" : "verildi"}: ${granteeEmail} | Rol: ${role}`);
      } catch (error) {
        app.toast(error.message || "Yetki kaydedilemedi.", "error");
        submit.disabled = false;
      }
    });
  }

  async function deleteGrant(grant) {
    if (!confirm(`${grant.granteeEmail} kişisinin bu çalışma alanına erişimi kaldırılsın mı?`)) return;
    try {
      await api(`api/workspaces/grants/${encodeURIComponent(grant.id)}`, { method: "DELETE" });
      app.toast("Yetki kaldırıldı.", "success");
      await loadGrants();
      window.CaYaAudit?.log("permissions", "delete", `Yetki kaldırıldı: ${grant.granteeEmail}`);
    } catch (error) {
      app.toast(error.message || "Yetki kaldırılamadı.", "error");
    }
  }

  app.registerPage("permissions", renderPage);
})();
