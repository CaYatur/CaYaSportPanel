(function () {
  "use strict";

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

  // Data is stored and encrypted on the SERVER. The client works with plaintext
  // received over the session-authenticated API; the server filters it down to
  // what the active user is allowed to see (owner sees everything).
  const STORAGE_KEYS = {
    students: "students",
    branches: "branches",
    groups: "groups",
    teachers: "teachers",
    enrollments: "enrollments",
    attendance: "attendance",
    payments: "payments",
    teacherSalaries: "teacherSalaries",
    settings: "settings",
    notifications: "notifications",
    auditLog: "auditLog"
  };

  const DEFAULT_DATA = {
    students: [],
    branches: [],
    groups: [],
    teachers: [],
    enrollments: [],
    attendance: [],
    payments: [],
    teacherSalaries: [],
    notifications: [],
    auditLog: [],
    settings: {
      gymName: "CaYaSport Panel",
      logoText: "CYS",
      phone: "",
      email: "",
      address: "",
      currency: "TRY",
      reminderDay: 3,
      theme: "light"
    }
  };

  const page = document.body?.dataset.page || "";
  const needsServerData = page !== "login" && page !== "index" && page !== "workspaces";
  const pendingWrites = new Map();
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  let cache = clone(DEFAULT_DATA);
  let readyError = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeServerData(data) {
    const source = data && typeof data === "object" ? data : {};
    const normalized = clone(DEFAULT_DATA);

    Object.keys(STORAGE_KEYS).forEach((key) => {
      if (Array.isArray(DEFAULT_DATA[key])) {
        normalized[key] = Array.isArray(source[key]) ? source[key] : [];
      } else if (key === "settings" && source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)) {
        normalized.settings = { ...normalized.settings, ...source.settings };
      }
    });

    return normalized;
  }

  function resolveKey(key) {
    const value = String(key || "");
    if (Object.values(STORAGE_KEYS).includes(value)) return value;
    const legacyPrefix = "cayasport_";
    if (value.startsWith(legacyPrefix)) {
      const resource = value.slice(legacyPrefix.length);
      if (Object.values(STORAGE_KEYS).includes(resource)) return resource;
    }
    return value;
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
      let message = "Sunucu isteği başarısız oldu.";
      let code = "";
      try {
        const body = await response.json();
        message = body.message || body.error || message;
        code = body.error || "";
      } catch (error) {
        try { message = await response.text(); } catch (e) { /* ignore */ }
      }
      // Active workspace no longer valid (e.g. revoked): back to the picker.
      if (response.status === 409 && code === "no_workspace") {
        window.location.replace(appUrl("workspaces.html"));
      }
      throw new Error(message);
    }

    return response.json();
  }

  async function loadServerData() {
    if (!needsServerData) return cache;
    try {
      cache = normalizeServerData(await requestJson("api/data"));
      return cache;
    } catch (error) {
      readyError = error;
      throw error;
    }
  }

  const ready = loadServerData();

  function notifyWriteError(error) {
    console.error("CaYaSport server sync error:", error);
    if (window.CaYaApp && typeof window.CaYaApp.toast === "function") {
      window.CaYaApp.toast(error.message || "Veri sunucuya kaydedilemedi.", "error");
    }
  }

  // Tell the app the cache no longer matches the screen (debounced) so it can
  // re-render the active page from server truth.
  let changeTimer = null;
  function notifyDataChanged() {
    if (changeTimer) return;
    changeTimer = setTimeout(() => {
      changeTimer = null;
      window.dispatchEvent(new CustomEvent("caya:datachanged"));
    }, 60);
  }

  // Pull the authoritative dataset back from the server (used to undo an
  // optimistic change the server rejected or trimmed).
  async function revertFromServer() {
    try {
      cache = normalizeServerData(await requestJson("api/data"));
      notifyDataChanged();
    } catch (error) {
      /* leave cache as-is; a later action will resync */
    }
  }

  // Persist a single resource. Writes are serialized per resource. The server
  // enforces permissions and (for scoped users) merges the change safely; we
  // reconcile the cache with whatever the server actually stored.
  function persistResource(resource, value) {
    const previous = pendingWrites.get(resource) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() =>
        requestJson(`api/data/${encodeURIComponent(resource)}`, {
          method: "PUT",
          body: JSON.stringify({ value })
        })
      )
      .then((response) => {
        // Adopt the server's authoritative value; if it differs from the
        // optimistic one (e.g. scoped merge dropped items), refresh the UI.
        if (response && Object.prototype.hasOwnProperty.call(response, "value")) {
          const before = JSON.stringify(cache[resource]);
          cache[resource] = response.value;
          if (JSON.stringify(cache[resource]) !== before) notifyDataChanged();
        }
        return response;
      })
      .catch((error) => {
        notifyWriteError(error);
        revertFromServer();
        throw error;
      });

    const tracked = next.catch(() => {}).finally(() => {
      if (pendingWrites.get(resource) === tracked) pendingWrites.delete(resource);
    });
    pendingWrites.set(resource, tracked);
    return next;
  }

  function getData(key, fallback) {
    const resource = resolveKey(key);
    if (Object.prototype.hasOwnProperty.call(cache, resource)) {
      return clone(cache[resource]);
    }
    return fallback === undefined ? [] : clone(fallback);
  }

  function setData(key, value) {
    const resource = resolveKey(key);
    if (!Object.prototype.hasOwnProperty.call(cache, resource)) return value;
    const nextValue = clone(value);
    if (JSON.stringify(cache[resource]) === JSON.stringify(nextValue)) return value;
    cache[resource] = nextValue;
    persistResource(resource, cache[resource]).catch(() => {});
    return value;
  }

  function updateData(key, value) {
    const current = getData(key, Array.isArray(value) ? [] : {});
    const next = typeof value === "function" ? value(current) : value;
    return setData(key, next);
  }

  function deleteData(key) {
    const resource = resolveKey(key);
    if (!Object.prototype.hasOwnProperty.call(cache, resource)) return;
    const empty = Array.isArray(DEFAULT_DATA[resource]) ? [] : clone(DEFAULT_DATA[resource]);
    setData(resource, empty);
  }

  function generateId(prefix) {
    const scope = prefix || "id";
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${scope}_${window.crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    }
    const stamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `${scope}_${stamp}_${random}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function normalizePayment(payment) {
    const totalAmount = Number(payment.totalAmount || 0);
    const paidAmount = Math.min(Number(payment.paidAmount || 0), totalAmount);
    const remainingAmount = Math.max(totalAmount - paidAmount, 0);
    const isPastDue = payment.dueDate && payment.dueDate < todayISO();
    let status = payment.status || "Bekliyor";

    if (status !== "İptal") {
      if (remainingAmount <= 0) {
        status = "Ödendi";
      } else if (isPastDue) {
        status = "Gecikti";
      } else if (paidAmount > 0) {
        status = "Kısmi ödendi";
      } else {
        status = "Bekliyor";
      }
    }

    return { ...payment, totalAmount, paidAmount, remainingAmount, status };
  }

  function normalizePayments(payments) {
    return (payments || []).map(normalizePayment);
  }

  async function clearAllData() {
    const data = await requestJson("api/data/reset", { method: "POST" });
    cache = normalizeServerData(data);
    return cache;
  }

  function flushWrites() {
    return Promise.allSettled([...Array.from(pendingWrites.values())]);
  }

  // Downscale/re-encode large photos in the browser before upload. Multi-megabyte
  // bodies were timing out at the reverse proxy (504 Gateway Timeout); a capped
  // JPEG keeps every upload small and fast so it clears proxy body-size/buffering
  // limits. Falls back to the original bytes if the canvas pipeline is missing or
  // fails for any reason — the server still sniffs and validates the real bytes.
  const PHOTO_MAX_EDGE = 1280;
  const PHOTO_ENCODE_QUALITY = 0.85;
  const PHOTO_DOWNSCALE_THRESHOLD = 900 * 1024;

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function releaseBitmap(bitmap) {
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
  }

  function loadBitmap(file) {
    if (typeof createImageBitmap === "function") {
      // "from-image" keeps EXIF orientation correct on supporting browsers.
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Resim çözümlenemedi.")); };
      img.src = url;
    });
  }

  async function prepareImageBytes(file) {
    const original = async () => new Uint8Array(await file.arrayBuffer());
    if (file.size <= PHOTO_DOWNSCALE_THRESHOLD) return original();
    if (typeof document === "undefined" || !document.createElement) return original();

    try {
      const bitmap = await loadBitmap(file);
      const width = bitmap.naturalWidth || bitmap.width;
      const height = bitmap.naturalHeight || bitmap.height;
      if (!width || !height) { releaseBitmap(bitmap); return original(); }

      const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) { releaseBitmap(bitmap); return original(); }
      // White backdrop so transparent PNGs don't turn black once flattened to JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      releaseBitmap(bitmap);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_ENCODE_QUALITY));
      if (!blob || blob.size === 0 || blob.size >= file.size) return original();
      return new Uint8Array(await blob.arrayBuffer());
    } catch (error) {
      return original();
    }
  }

  // Upload a student photo. Bytes are sent as-is; the server encrypts at rest and
  // serves them back decrypted, so the returned URL can be used directly in <img>.
  async function uploadStudentImage(studentId, file, options) {
    if (!file) return null;
    if (!PHOTO_TYPES.has(file.type)) throw new Error("Sadece JPG, PNG veya WebP resim yüklenebilir.");
    if (file.size > PHOTO_MAX_BYTES) throw new Error("Resim en fazla 5 MB olabilir.");

    const bytes = await prepareImageBytes(file);
    // Send as base64 inside a JSON body — the same transport the (working) logo
    // upload uses. The reverse proxy reliably forwards application/json POSTs but
    // was stalling raw application/octet-stream uploads (504 Gateway Timeout).
    const payload = JSON.stringify({ data: bytesToBase64(bytes) });
    const onProgress = options && typeof options.onProgress === "function" ? options.onProgress : null;

    const attemptUpload = (attempt) =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", appUrl(`api/student-images/${encodeURIComponent(studentId)}`));
        xhr.withCredentials = true;
        xhr.responseType = "json";
        xhr.timeout = 60000;
        xhr.setRequestHeader("Content-Type", "application/json");

        if (onProgress) {
          if (attempt === 1) onProgress(0);
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
          };
        }

        xhr.onerror = () => reject(new Error("Resim yüklenemedi."));
        xhr.onabort = () => reject(new Error("Resim yükleme iptal edildi."));
        xhr.ontimeout = () => reject(new Error("Sunucu zamanında yanıt vermedi. Lütfen tekrar deneyin."));
        xhr.onload = () => {
          if (xhr.status === 401) {
            window.location.replace(appUrl("login.html"));
            reject(new Error("Oturum bulunamadı."));
            return;
          }

          const body = xhr.response && typeof xhr.response === "object"
            ? xhr.response
            : (() => {
                try {
                  return JSON.parse(xhr.responseText || "null");
                } catch (error) {
                  return null;
                }
              })();

          if (xhr.status === 504) {
            reject(Object.assign(new Error("Sunucu yükleme isteğine zamanında yanıt vermedi. Lütfen tekrar deneyin."), { retryable: true }));
            return;
          }

          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error((body && (body.message || body.error)) || "Resim yüklenemedi."));
            return;
          }

          if (onProgress) onProgress(100);
          resolve({
            id: body.image.id,
            url: appUrl(body.image.url),
            type: file.type,
            name: file.name,
            size: bytes.length,
            uploadedAt: new Date().toISOString()
          });
        };

        xhr.send(payload);
      });

    try {
      return await attemptUpload(1);
    } catch (err) {
      if (err.retryable) {
        return attemptUpload(2);
      }
      throw err;
    }
  }

  // Server already serves decrypted bytes with the right content-type.
  function imageUrl(photo) {
    if (!photo || !photo.url) return "";
    try {
      const parsed = new URL(String(photo.url), window.location.href);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const imageRootIndex = parts.lastIndexOf("student-images");
      if (imageRootIndex === -1 || !parts[imageRootIndex + 1] || !parts[imageRootIndex + 2]) return "";
      const studentId = parts[imageRootIndex + 1];
      const imageId = parts[imageRootIndex + 2];
      return appUrl(`api/student-images/${encodeURIComponent(studentId)}/${encodeURIComponent(imageId)}`);
    } catch (error) {
      return "";
    }
  }

  async function deleteStudentImage(photo) {
    const url = imageUrl(photo);
    if (!url) return;
    const response = await fetch(url, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok && response.status !== 404) throw new Error("Resim silinemedi.");
  }

  window.CaYaStorage = {
    KEYS: STORAGE_KEYS,
    ready,
    get readyError() {
      return readyError;
    },
    getData,
    setData,
    updateData,
    deleteData,
    generateId,
    clearAllData,
    ensureSystemData: () => ready,
    defaultBranches: () => [],
    normalizePayment,
    normalizePayments,
    todayISO,
    addDays,
    flushWrites,
    uploadStudentImage,
    imageUrl,
    deleteStudentImage
  };
})();
