(function () {
  "use strict";

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
  const MAX_DEFAULT = 10;

  const grid = document.getElementById("workspaceGrid");
  const countChip = document.getElementById("workspaceCount");
  const userPill = document.getElementById("workspaceUser");
  const modalRoot = document.getElementById("modal-root");
  const toastRoot = document.getElementById("toast-root");

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "long", day: "numeric" }).format(date);
  }

  function toast(message, type) {
    if (!toastRoot) return;
    const item = document.createElement("div");
    item.className = `toast ${type || ""}`;
    item.textContent = message;
    toastRoot.appendChild(item);
    setTimeout(() => item.remove(), 3400);
  }

  async function requestJson(url, options) {
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
      } catch (error) {
        /* ignore */
      }
      throw new Error(message);
    }

    return response.json();
  }

  function closeModal() {
    if (modalRoot) modalRoot.innerHTML = "";
  }

  // Lightweight name modal reusing the shared modal/form CSS.
  function openNameModal({ title, label, value, confirmLabel, onConfirm }) {
    if (!modalRoot) return;
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <section class="modal-box modal-small" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <header class="modal-header">
            <h3>${escapeHtml(title)}</h3>
            <button type="button" class="icon-btn" data-modal-close aria-label="Kapat" title="Kapat">✕</button>
          </header>
          <div class="modal-content">
            <form id="workspaceNameForm" class="form-card" style="padding:0;">
              <label>${escapeHtml(label)}
                <input name="name" maxlength="60" autocomplete="off" value="${escapeHtml(value || "")}" placeholder="örn. Merkez Şube" required />
              </label>
              <div class="form-actions">
                <button type="button" class="btn" data-modal-close>Vazgeç</button>
                <button type="submit" class="btn btn-primary">${escapeHtml(confirmLabel)}</button>
              </div>
            </form>
          </div>
        </section>
      </div>
    `;

    modalRoot.onclick = (event) => {
      if (event.target.closest("[data-modal-close]")) closeModal();
    };

    const form = document.getElementById("workspaceNameForm");
    const input = form.elements.name;
    input.focus();
    input.select();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = String(input.value || "").trim();
      if (!name) {
        toast("Bir isim girin.", "error");
        return;
      }
      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        await onConfirm(name);
        closeModal();
      } catch (error) {
        toast(error.message || "İşlem tamamlanamadı.", "error");
        submitButton.disabled = false;
      }
    });
  }

  function renderUser() {
    const session = auth.getSession();
    if (!session || !userPill) return;
    const name = session.fullName || session.username || "Kullanıcı";
    const avatar = session.avatar || appUrl("assets/logo.svg");
    userPill.title = name;
    userPill.innerHTML = `
      <span class="avatar"><img src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${appUrl("assets/logo.svg")}';" /></span>
      <span class="name">${escapeHtml(name)}</span>
    `;
  }

  const ROLE_LABELS = { yönetici: "Yönetici", eğitmen: "Eğitmen", görüntüleyici: "Görüntüleyici", özel: "Özel yetki" };
  const WS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';

  function isActive(ownerId, workspaceId) {
    return state.activeRef && String(state.activeRef.ownerId) === String(ownerId) && state.activeRef.workspaceId === workspaceId;
  }

  function ownedCard(workspace) {
    const active = isActive(state.ownerId, workspace.workspaceId);
    return `
      <article class="card workspace-card${active ? " is-active" : ""}" data-id="${escapeHtml(workspace.workspaceId)}">
        <div class="workspace-card-top">
          <span class="workspace-card-icon" aria-hidden="true">${WS_ICON}</span>
          ${active ? '<span class="badge success">Aktif</span>' : ""}
        </div>
        <h3 class="workspace-card-name">${escapeHtml(workspace.name)}</h3>
        <p class="workspace-card-date muted">Oluşturuldu: ${escapeHtml(formatDate(workspace.createdAt))}</p>
        <div class="workspace-card-actions">
          <button type="button" class="btn btn-primary" data-action="open-owned" data-id="${escapeHtml(workspace.workspaceId)}">Aç</button>
          <button type="button" class="btn" data-action="rename" data-id="${escapeHtml(workspace.workspaceId)}">Yeniden adlandır</button>
          <button type="button" class="btn btn-warning" data-action="delete" data-id="${escapeHtml(workspace.workspaceId)}">Sil</button>
        </div>
      </article>
    `;
  }

  function sharedCard(workspace) {
    const active = isActive(workspace.ownerId, workspace.workspaceId);
    const roleLabel = ROLE_LABELS[workspace.role] || workspace.role;
    return `
      <article class="card workspace-card${active ? " is-active" : ""}" data-owner="${escapeHtml(workspace.ownerId)}" data-owner-username="${escapeHtml(workspace.ownerUsername || "")}" data-id="${escapeHtml(workspace.workspaceId)}">
        <div class="workspace-card-top">
          <span class="workspace-card-icon" aria-hidden="true">${WS_ICON}</span>
          ${active ? '<span class="badge success">Aktif</span>' : `<span class="badge info">${escapeHtml(roleLabel)}</span>`}
        </div>
        <h3 class="workspace-card-name">${escapeHtml(workspace.name)}</h3>
        <p class="workspace-card-date muted">Sahip: ${escapeHtml(workspace.ownerName || "-")}</p>
        <div class="workspace-card-actions">
          <button type="button" class="btn btn-primary" data-action="open-shared" data-owner="${escapeHtml(workspace.ownerId)}" data-owner-username="${escapeHtml(workspace.ownerUsername || "")}" data-id="${escapeHtml(workspace.workspaceId)}">Aç</button>
        </div>
      </article>
    `;
  }

  function newCard(canCreate, max) {
    if (!canCreate) {
      return `
        <article class="card workspace-card workspace-card-new is-disabled">
          <span class="workspace-card-icon" aria-hidden="true">＋</span>
          <h3 class="workspace-card-name">Yeni çalışma alanı</h3>
          <p class="muted">En fazla ${max} çalışma alanı oluşturabilirsiniz.</p>
        </article>
      `;
    }
    return `
      <button type="button" class="card workspace-card workspace-card-new" data-action="create">
        <span class="workspace-card-icon" aria-hidden="true">＋</span>
        <h3 class="workspace-card-name">Yeni çalışma alanı</h3>
        <p class="muted">Yeni bir yer ekleyin ve ayrı ayrı yönetin.</p>
      </button>
    `;
  }

  let state = { owned: [], shared: [], activeRef: null, ownerId: "", max: MAX_DEFAULT };

  function render() {
    const total = state.owned.length;
    const canCreate = total < state.max;
    if (countChip) countChip.textContent = `${total} / ${state.max} kendi çalışma alanı`;

    const ownedHtml = state.owned.map(ownedCard).join("") + newCard(canCreate, state.max);
    const sharedHtml = state.shared.length
      ? `<h3 class="workspace-section-title">Sizinle paylaşılanlar</h3><div class="workspace-grid">${state.shared.map(sharedCard).join("")}</div>`
      : "";

    grid.innerHTML = ownedHtml;
    const sharedHost = document.getElementById("sharedHost");
    if (sharedHost) sharedHost.innerHTML = sharedHtml;
  }

  async function load() {
    const data = await requestJson("api/workspaces");
    state = {
      owned: Array.isArray(data.owned) ? data.owned : [],
      shared: Array.isArray(data.shared) ? data.shared : [],
      activeRef: data.activeRef || null,
      ownerId: String(data.ownerId || ""),
      max: data.max || MAX_DEFAULT
    };
    render();
  }

  async function selectWorkspace(ref) {
    await requestJson("api/workspaces/select", { method: "POST", body: JSON.stringify(ref) });
    window.location.assign(appUrl("dashboard.html"));
  }

  function createWorkspace() {
    openNameModal({
      title: "Yeni çalışma alanı",
      label: "Çalışma alanı adı",
      value: "",
      confirmLabel: "Oluştur",
      onConfirm: async (name) => {
        await requestJson("api/workspaces", { method: "POST", body: JSON.stringify({ name }) });
        toast("Çalışma alanı oluşturuldu.", "success");
        await load();
      }
    });
  }

  function renameWorkspace(id) {
    const workspace = state.owned.find((item) => item.workspaceId === id);
    if (!workspace) return;
    openNameModal({
      title: "Yeniden adlandır",
      label: "Yeni ad",
      value: workspace.name,
      confirmLabel: "Kaydet",
      onConfirm: async (name) => {
        await requestJson(`api/workspaces/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
        toast("Çalışma alanı yeniden adlandırıldı.", "success");
        await load();
      }
    });
  }

  async function deleteWorkspace(id) {
    const workspace = state.owned.find((item) => item.workspaceId === id);
    if (!workspace) return;
    if (state.owned.length <= 1) {
      toast("Son çalışma alanı silinemez.", "error");
      return;
    }
    if (!window.confirm(`"${workspace.name}" çalışma alanı ve içindeki tüm veriler kalıcı olarak silinsin mi? Verilen yetkiler de kaldırılır. Bu işlem geri alınamaz.`)) {
      return;
    }
    try {
      await requestJson(`api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast("Çalışma alanı silindi.", "success");
      await load();
    } catch (error) {
      toast(error.message || "Silme başarısız oldu.", "error");
    }
  }

  function handleGridClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    const action = trigger.dataset.action;
    const id = trigger.dataset.id;
    if (action === "create") return createWorkspace();
    if (action === "open-owned") return selectWorkspace({ ownerId: state.ownerId, workspaceId: id });
    if (action === "open-shared") return selectWorkspace({ ownerId: trigger.dataset.owner, ownerUsername: trigger.dataset.ownerUsername, workspaceId: id });
    if (action === "rename") return renameWorkspace(id);
    if (action === "delete") return deleteWorkspace(id);
  }

  function bindGrid() {
    grid.addEventListener("click", handleGridClick);
    const sharedHost = document.getElementById("sharedHost");
    if (sharedHost) sharedHost.addEventListener("click", handleGridClick);
  }

  async function init() {
    await auth.ready;
    if (!auth.isAuthenticated()) {
      window.location.replace(appUrl("login.html"));
      return;
    }
    renderUser();
    bindGrid();

    const logoutButton = document.getElementById("workspaceLogout");
    if (logoutButton) logoutButton.addEventListener("click", auth.logout);

    try {
      await load();
    } catch (error) {
      grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "Çalışma alanları yüklenemedi.")}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => {
      console.error(error);
      grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "Bir hata oluştu.")}</div>`;
    });
  });
})();
