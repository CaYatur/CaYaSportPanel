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

  function syncPublicLinks() {
    const mappings = [
      ["a[href='./']", appUrl("")],
      ["a[href='login.html']", appUrl("login.html")],
      ["a[href='dashboard.html']", appUrl("dashboard.html")],
      ["a[href='workspaces.html']", appUrl("workspaces.html")],
      ["a[href='auth/cayadev']", appUrl("auth/cayadev")]
    ];

    mappings.forEach(([selector, href]) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.setAttribute("href", href);
      });
    });
  }

  syncPublicLinks();

  let authState = {
    authenticated: false,
    oauthConfigured: false,
    user: null
  };

  async function fetchSession() {
    const response = await fetch(appUrl("api/auth/session"), { credentials: "same-origin" });
    if (!response.ok) throw new Error("Oturum bilgisi alinamadi.");
    authState = await response.json();
    return authState;
  }

  const ready = fetchSession().catch((error) => {
    console.error("CaYaSport auth error:", error);
    return authState;
  });

  function getSession() {
    if (!authState.authenticated || !authState.user) return null;
    return {
      userId: authState.user.id,
      username: authState.user.username,
      role: authState.user.role,
      fullName: authState.user.displayName || authState.user.username,
      email: authState.user.email || "",
      avatar: authState.user.avatar || ""
    };
  }

  function login() {
    window.location.assign(appUrl("auth/cayadev"));
  }

  async function logout() {
    try {
      await fetch(appUrl("api/auth/logout"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" }
      });
    } finally {
      window.location.replace(appUrl("login.html"));
    }
  }

  function requireAuth() {
    const session = getSession();
    if (!session) {
      window.location.replace(appUrl("login.html"));
      return null;
    }
    return session;
  }

  function errorMessage(code) {
    const messages = {
      oauth_config: "CaYaDev OAuth ayarları eksik. CAYADEV_CLIENT_ID, CAYADEV_CLIENT_SECRET ve CAYADEV_REDIRECT_URI değerlerini tanımlayın.",
      oauth_state: "Oturum doğrulama süresi doldu. Tekrar giriş yapın.",
      oauth_missing_code: "CaYaDev girişi tamamlanamadı.",
      access_denied: "CaYaDev izni reddedildi.",
      server_error: "Giriş sırasında bir sunucu hatası oluştu. Tekrar deneyin."
    };
    return messages[code] || "Giriş tamamlanamadı. Tekrar deneyin.";
  }

  function renderLoginState() {
    const button = document.getElementById("oauthLoginButton");
    const message = document.getElementById("loginMessage");
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (button) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        if (!authState.oauthConfigured) {
          if (message) message.textContent = errorMessage("oauth_config");
          return;
        }
        login();
      });

      if (!authState.oauthConfigured) {
        button.setAttribute("aria-disabled", "true");
        button.classList.add("disabled");
      }
    }

    if (message) {
      message.textContent = error ? errorMessage(error) : "";
    }
  }

  function renderLandingState() {
    const session = getSession();
    const authedAction = document.querySelector("[data-authed-action]");
    const guestAction = document.querySelector("[data-guest-action]");
    if (session && authedAction) authedAction.removeAttribute("hidden");
    if (!session && guestAction) guestAction.removeAttribute("hidden");
  }

  async function redirectBySession() {
    await ready;
    const page = document.body.dataset.page;
    const session = getSession();

    if (page === "index") {
      renderLandingState();
      return;
    }

    if (page === "login" && session) {
      window.location.replace(appUrl("workspaces.html"));
      return;
    }

    if (page === "login") renderLoginState();
  }

  document.addEventListener("DOMContentLoaded", () => {
    redirectBySession().catch((error) => {
      console.error(error);
      const page = document.body.dataset.page;
      if (page !== "login" && page !== "index") {
        window.location.replace(appUrl("login.html"));
      }
    });
  });

  window.CaYaAuth = {
    ready,
    login,
    logout,
    getSession,
    requireAuth,
    isAuthenticated: () => Boolean(getSession())
  };
})();
