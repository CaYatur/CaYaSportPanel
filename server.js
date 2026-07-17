const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");

loadEnvFile();

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "public");
const dataPath = path.join(__dirname, "data");
const accountsPath = path.join(dataPath, "accounts");
const ACCOUNT_DATA_FILE = "data.json";
const ENCRYPTED_DATA_FORMAT = "cayasport-client-encrypted-v1";
const IMAGE_UPLOAD_LIMIT = "8mb";
const WORKSPACES_REGISTRY_FILE = "workspaces.json";
const WORKSPACES_DIR = "ws";
const MAX_WORKSPACES = 10;
const DEFAULT_WORKSPACE_NAME = "Ana Çalışma Alanı";
const SCHEDULE_DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const SESSION_COOKIE = "cayasport_sid";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

const CAYADEV_AUTHORIZE_URL = process.env.CAYADEV_AUTHORIZE_URL || "https://cayadev.com/oauth/authorize";
const CAYADEV_TOKEN_URL = process.env.CAYADEV_TOKEN_URL || "https://cayadev.com/oauth/token";
const CAYADEV_USERINFO_URL = process.env.CAYADEV_USERINFO_URL || "https://cayadev.com/oauth/userinfo";
const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH || "");

const protectedPages = new Set([
  "/dashboard.html",
  "/students.html",
  "/branches.html",
  "/groups.html",
  "/attendance.html",
  "/payments.html",
  "/unpaid.html",
  "/reports.html",
  "/settings.html",
  "/teachers.html",
  "/salaries.html",
  "/audit.html",
  "/permissions.html"
]);

const defaultData = Object.freeze({
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
});

const resourceKeys = Object.keys(defaultData);
const arrayResources = new Set(resourceKeys.filter((key) => Array.isArray(defaultData[key])));
const sessions = new Map();
const oauthStates = new Map();
const rateBuckets = new Map();
const accountLocks = new Map();

fs.mkdirSync(accountsPath, { recursive: true });

/* ===========================================================================
 * At-rest encryption (server-managed)
 * Data is stored encrypted on disk with a server master key (AES-256-GCM).
 * The server decrypts to filter per-user, so it must hold the key. The key is
 * taken from DATA_ENCRYPTION_KEY (base64, 32 bytes) or generated once into
 * data/.master.key. Legacy client-encrypted blobs are decryptable here too
 * (their key was derived from the non-secret owner id) so we can migrate them.
 * ========================================================================= */
const SERVER_DATA_FORMAT = "cayasport-server-encrypted-v1";
const CLIENT_DATA_FORMAT = ENCRYPTED_DATA_FORMAT;
const MASTER_KEY_FILE = path.join(dataPath, ".master.key");
const CLIENT_KDF_PREFIX = "CaYaSportPanel:auto-data-key:v2:";

function loadOrCreateMasterKey() {
  const fromEnv = process.env.DATA_ENCRYPTION_KEY;
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, "base64");
    if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY base64 ile 32 byte olmalı.");
    return buf;
  }
  try {
    const raw = fs.readFileSync(MASTER_KEY_FILE, "utf8").trim();
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(MASTER_KEY_FILE, key.toString("base64"), { mode: 0o600 });
  return key;
}

const MASTER_KEY = loadOrCreateMasterKey();

function isServerEnvelope(value) {
  return Boolean(value && typeof value === "object" && value.format === SERVER_DATA_FORMAT);
}

function isClientEnvelope(value) {
  return Boolean(value && typeof value === "object" && value.format === CLIENT_DATA_FORMAT && value.encryption && value.ciphertext);
}

function serverEncryptObject(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    format: SERVER_DATA_FORMAT,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function serverDecryptObject(envelope) {
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

// Derive the legacy client data key: PBKDF2-SHA256 over (prefix + owner id) and
// the envelope salt. The same key encrypted both the data blob and the images.
function deriveClientDataKey(rawOwnerId, saltB64, iterations) {
  const salt = Buffer.from(String(saltB64 || ""), "base64");
  if (!salt.length) throw new Error("Geçersiz şifreleme tuzu.");
  return crypto.pbkdf2Sync(`${CLIENT_KDF_PREFIX}${rawOwnerId}`, salt, Number(iterations) || 250000, 32, "sha256");
}

// Decrypt a legacy client-side envelope (Web Crypto AES-GCM, tag appended to ciphertext).
function decryptClientEnvelopeWithKey(envelope, key) {
  const iv = Buffer.from(String((envelope.encryption || {}).iv || ""), "base64");
  const data = Buffer.from(String(envelope.ciphertext || ""), "base64");
  if (!iv.length || data.length < 16) throw new Error("Geçersiz istemci şifre zarfı.");
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
}

// Encrypt/decrypt raw image bytes at rest with the master key.
// On-disk layout: [12-byte IV][16-byte GCM tag][ciphertext].
function serverEncryptBytes(bytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function serverDecryptBytes(buffer) {
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

// Security headers — applied to every response before any route handler.
app.use((req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Powered-By");
  res.removeHeader("X-Frame-Options");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  // HSTS: only emit when the connection is (or is proxied over) HTTPS so that
  // plain-HTTP dev environments are not accidentally broken.
  if (getRequestProtocol(req) === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Bodies are JSON. Base64-encoded images (logo in settings, student photos)
// inflate ~33%, so a 5 MB image becomes ~6.8 MB on the wire — keep headroom.
app.use(express.json({ limit: "12mb" }));

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const index = trimmed.indexOf("=");
    if (index === -1) return;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) return;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeWithDefaultData(data) {
  const merged = clone(defaultData);
  const source = data && typeof data === "object" ? data : {};

  arrayResources.forEach((key) => {
    merged[key] = Array.isArray(source[key]) ? source[key] : [];
  });

  if (source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)) {
    merged.settings = {
      ...merged.settings,
      ...source.settings
    };
  }

  return merged;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (options.secure) parts.push("Secure");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join("; ");
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure: isSecureCookie() }));
}

function isSecureCookie() {
  return process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function getSession(req) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (!sid) return null;

  const session = sessions.get(sid);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sid);
    return null;
  }

  return { sid, ...session };
}

function createSession(res, user) {
  const sid = randomToken();
  const now = Date.now();
  const session = {
    user,
    accountId: user.id,
    activeWorkspaceRef: null,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  };

  sessions.set(sid, session);
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, sid, {
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: isSecureCookie()
  }));

  return session;
}

function destroySession(req, res) {
  const sid = parseCookies(req)[SESSION_COOKIE];
  if (sid) sessions.delete(sid);
  clearSessionCookie(res);
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "unauthorized" });
    }
    return redirectWithinApp(req, res, "/login.html");
  }

  req.session = session;
  return next();
}

function getActiveWorkspaceRef(req) {
  const stored = req.session && req.session.sid ? sessions.get(req.session.sid) : null;
  return stored ? stored.activeWorkspaceRef || null : null;
}

function setActiveWorkspaceRef(req, ref) {
  const stored = req.session && req.session.sid ? sessions.get(req.session.sid) : null;
  if (stored) stored.activeWorkspaceRef = ref;
}

// Requires a selected, still-valid workspace (owned or shared). Resolves the live
// access context (role/permissions/branch scope) into req.ws on every request, so
// permission changes and revocations take effect immediately. Browser requests
// without one go to the picker; API requests get a 409 the client handles.
async function requireWorkspace(req, res, next) {
  try {
    const context = await resolveWorkspaceContext(req);
    if (!context) {
      if (req.path.startsWith("/api/")) {
        return res.status(409).json({ error: "no_workspace", message: "Önce bir çalışma alanı seçin." });
      }
      return redirectWithinApp(req, res, "/workspaces.html");
    }
    req.ws = context;
    return next();
  } catch (error) {
    return next(error);
  }
}

function getClientKey(req) {
  const session = getSession(req);
  return session ? `session:${session.sid}` : `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
}

function rateLimit({ name, windowMs, max, key }) {
  return (req, res, next) => {
    const bucketKey = `${name}:${key ? key(req) : getClientKey(req)}`;
    const now = Date.now();
    let bucket = rateBuckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(bucketKey, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      return res.status(429).json({
        error: "rate_limit_exceeded",
        message: "İstek limiti aşıldı. Biraz sonra tekrar deneyin."
      });
    }

    return next();
  };
}

const authLimiter = rateLimit({ name: "auth", windowMs: 15 * ONE_MINUTE, max: 200, key: (req) => req.ip || "unknown" });
const apiLimiter = rateLimit({ name: "api", windowMs: ONE_MINUTE, max: 1500 });
const mutationLimiter = rateLimit({ name: "mutation", windowMs: ONE_MINUTE, max: 900 });

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizePathSegment(value, fallback = "item", maxLength = 80) {
  const safe = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);

  return safe || fallback;
}

function accountSource(accountRef) {
  return accountRef && typeof accountRef === "object" ? accountRef : { id: accountRef };
}

function accountId(accountRef) {
  const source = accountSource(accountRef);
  return sanitizePathSegment(source.id, "account", 64);
}

function accountDirectoryName(accountRef) {
  const source = accountSource(accountRef);
  const username = sanitizePathSegment(source.username || source.email || source.displayName || "user", "user", 64);
  return `${username}-${accountId(source)}`.slice(0, 140);
}

function accountDirPath(accountRef) {
  return path.join(accountsPath, accountDirectoryName(accountRef));
}

function accountDataFilePath(accountRef) {
  return path.join(accountDirPath(accountRef), ACCOUNT_DATA_FILE);
}

function legacyAccountFilePath(accountRef) {
  return path.join(accountsPath, `${accountId(accountRef)}.json`);
}

function accountImagesPath(accountRef) {
  return path.join(accountDirPath(accountRef), "images");
}

/* ---------------------------------------------------------------------------
 * Workspaces ("Çalışma Alanı"): each account can hold up to MAX_WORKSPACES
 * isolated datasets. Layout:
 *   data/accounts/<user>-<id>/
 *     workspaces.json          -> registry: { workspaces: [{id,name,createdAt}] }
 *     ws/<workspaceId>/data.json
 *     ws/<workspaceId>/images/<studentId>/<imageId>.bin
 * A "scope" bundles the account + the active workspace id.
 * ------------------------------------------------------------------------- */
function workspacesRegistryPath(accountRef) {
  return path.join(accountDirPath(accountRef), WORKSPACES_REGISTRY_FILE);
}

function workspaceDirPath(accountRef, workspaceId) {
  const safe = sanitizePathSegment(workspaceId, "ws", 64);
  return path.join(accountDirPath(accountRef), WORKSPACES_DIR, safe);
}

// All data/image paths are keyed by the workspace OWNER (so a grantee reads the
// owner's files), not by the logged-in user.
function workspaceDataFilePath(ownerRef, workspaceId) {
  return path.join(workspaceDirPath(ownerRef, workspaceId), ACCOUNT_DATA_FILE);
}

function workspaceImagesPath(ownerRef, workspaceId) {
  return path.join(workspaceDirPath(ownerRef, workspaceId), "images");
}

function workspaceImageFilePath(ownerRef, workspaceId, studentId, imageId) {
  const safeStudentId = sanitizePathSegment(studentId, "student", 96);
  const safeImageId = sanitizePathSegment(imageId, "image", 96);
  return path.join(workspaceImagesPath(ownerRef, workspaceId), safeStudentId, `${safeImageId}.bin`);
}

function accountMetaPath(accountRef) {
  return path.join(accountDirPath(accountRef), "account.json");
}

// Persist who owns this account dir (raw id needed to decrypt legacy data; email
// for resolving grants). Written on every login.
async function writeAccountMeta(user) {
  const meta = {
    id: String(user.id || ""),
    username: String(user.username || ""),
    email: String(user.email || "").trim().toLowerCase(),
    displayName: String(user.displayName || user.username || ""),
    updatedAt: new Date().toISOString()
  };
  await fs.promises.mkdir(accountDirPath(user), { recursive: true });
  await writeJsonFileAtomic(accountMetaPath(user), meta);
  return meta;
}

async function readAccountMeta(accountRef) {
  try {
    return JSON.parse(await fs.promises.readFile(accountMetaPath(accountRef), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Raw owner id for legacy-blob decryption: prefer the ref's own id, then stored
// meta, then the (sanitized) directory suffix as a last resort.
async function resolveRawOwnerId(ownerRef) {
  if (ownerRef && ownerRef.id) return String(ownerRef.id);
  const meta = await readAccountMeta(ownerRef);
  if (meta && meta.id) return String(meta.id);
  return accountId(ownerRef);
}

function generateWorkspaceId() {
  return `ws_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`;
}

function sanitizeWorkspaceName(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 60);
}

async function readWorkspaceRegistry(accountRef) {
  const filePath = workspacesRegistryPath(accountRef);
  try {
    const parsed = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    if (!parsed || !Array.isArray(parsed.workspaces)) return null;
    const workspaces = parsed.workspaces
      .filter((item) => item && typeof item === "object" && item.id)
      .map((item) => ({
        id: sanitizePathSegment(item.id, "ws", 64),
        name: sanitizeWorkspaceName(item.name) || "Çalışma Alanı",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
      }));
    return workspaces.length ? { workspaces } : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeWorkspaceRegistry(accountRef, registry) {
  const normalized = {
    workspaces: (registry.workspaces || []).slice(0, MAX_WORKSPACES).map((item) => ({
      id: item.id,
      name: sanitizeWorkspaceName(item.name) || "Çalışma Alanı",
      createdAt: item.createdAt || new Date().toISOString()
    }))
  };
  await writeJsonFileAtomic(workspacesRegistryPath(accountRef), normalized);
  return normalized;
}

// Ensures the account has a workspace registry, migrating any pre-existing
// single-dataset account into the first workspace on first access.
async function ensureWorkspaces(accountRef) {
  const existing = await readWorkspaceRegistry(accountRef);
  if (existing) return existing;

  // Normalize any legacy layout (renamed dir / <id>.json) into <accountDir>/data.json
  await ensureAccountDataFile(accountRef);

  const workspaceId = generateWorkspaceId();
  const workspaceDir = workspaceDirPath(accountRef, workspaceId);
  await fs.promises.mkdir(workspaceDir, { recursive: true });

  const legacyDataFile = accountDataFilePath(accountRef);
  if (fs.existsSync(legacyDataFile)) {
    await fs.promises.rename(legacyDataFile, path.join(workspaceDir, ACCOUNT_DATA_FILE)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  const legacyImagesDir = accountImagesPath(accountRef);
  if (fs.existsSync(legacyImagesDir)) {
    await fs.promises.rename(legacyImagesDir, path.join(workspaceDir, "images")).catch((error) => {
      if (error.code !== "ENOENT" && error.code !== "EEXIST") throw error;
    });
  }

  return writeWorkspaceRegistry(accountRef, {
    workspaces: [{ id: workspaceId, name: DEFAULT_WORKSPACE_NAME, createdAt: new Date().toISOString() }]
  });
}

async function findExistingAccountDirById(accountRef) {
  const suffix = `-${accountId(accountRef)}`;
  const entries = await fs.promises.readdir(accountsPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  const match = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(suffix));
  return match ? path.join(accountsPath, match.name) : "";
}

async function resolveOwnerRefById(ownerId) {
  const safeId = sanitizePathSegment(ownerId, "", 64);
  if (!safeId) return null;

  const ownerDir = await findExistingAccountDirById({ id: safeId });
  if (!ownerDir) return null;

  let meta = null;
  try {
    meta = JSON.parse(await fs.promises.readFile(path.join(ownerDir, "account.json"), "utf8"));
  } catch (error) {
    meta = null;
  }

  const dirName = path.basename(ownerDir);
  const suffix = `-${safeId}`;
  const fallbackUsername = dirName.endsWith(suffix) ? dirName.slice(0, -suffix.length) : "user";

  return {
    id: meta && meta.id ? String(meta.id) : safeId,
    username: meta && meta.username ? String(meta.username) : fallbackUsername || "user"
  };
}

async function ensureAccountDataFile(accountRef) {
  const filePath = accountDataFilePath(accountRef);
  if (fs.existsSync(filePath)) return filePath;

  const existingDir = await findExistingAccountDirById(accountRef);
  if (existingDir && existingDir !== accountDirPath(accountRef)) {
    await fs.promises.rename(existingDir, accountDirPath(accountRef)).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    if (fs.existsSync(filePath)) return filePath;
  }

  const legacyPath = legacyAccountFilePath(accountRef);
  if (fs.existsSync(legacyPath)) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.rename(legacyPath, filePath);
  }

  return filePath;
}

async function writeJsonFileAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.promises.rename(tmpPath, filePath);
}

// Write workspace data as a server-encrypted (at-rest) envelope.
async function writeWorkspaceData(ownerRef, workspaceId, data) {
  const normalized = mergeWithDefaultData(data);
  await writeJsonFileAtomic(workspaceDataFilePath(ownerRef, workspaceId), serverEncryptObject(normalized));
  return normalized;
}

// Read workspace data as plaintext, transparently migrating legacy formats:
//  - server envelope  -> decrypt with master key
//  - client envelope  -> decrypt with derived owner key, back up original
//                        as data.json.client-bak, migrate images, re-encrypt
//  - plain JSON        -> wrap into server envelope on next write
async function readWorkspaceData(ownerRef, workspaceId, rawOwnerIdHint) {
  const filePath = workspaceDataFilePath(ownerRef, workspaceId);
  let parsed;
  try {
    parsed = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return mergeWithDefaultData({});
  }

  if (isServerEnvelope(parsed)) {
    return mergeWithDefaultData(serverDecryptObject(parsed));
  }

  if (isClientEnvelope(parsed)) {
    const rawOwnerId = rawOwnerIdHint || (await resolveRawOwnerId(ownerRef));
    // The data key (PBKDF2 over owner id + this envelope's salt) also decrypts
    // the legacy images, which were encrypted with the same key + a per-image iv.
    const dataKey = deriveClientDataKey(rawOwnerId, parsed.encryption.salt, parsed.encryption.iterations);
    const plain = mergeWithDefaultData(decryptClientEnvelopeWithKey(parsed, dataKey));
    await fs.promises.copyFile(filePath, `${filePath}.client-bak`).catch(() => {});
    await migrateWorkspaceImages(ownerRef, workspaceId, plain, dataKey).catch((error) => {
      console.error("Görsel migrasyonu başarısız:", error.message);
    });
    await writeWorkspaceData(ownerRef, workspaceId, plain);
    return plain;
  }

  // Plain unencrypted JSON (e.g. very old/manually placed) — adopt as-is.
  return mergeWithDefaultData(parsed);
}

// Re-encrypt legacy client-encrypted student images with the master key and drop
// the per-photo client iv so the server can serve decrypted bytes to any
// authorized user. Best-effort: a failed image won't block data migration.
async function migrateWorkspaceImages(ownerRef, workspaceId, data, dataKey) {
  const students = Array.isArray(data.students) ? data.students : [];
  for (const student of students) {
    const photo = student && student.photo;
    if (!photo || !photo.url || !photo.iv) continue;
    const ids = String(photo.url).split("/").filter(Boolean);
    const imageId = ids[ids.length - 1];
    const studentId = ids[ids.length - 2];
    const filePath = workspaceImageFilePath(ownerRef, workspaceId, studentId, imageId);
    try {
      const stored = await fs.promises.readFile(filePath);
      const iv = Buffer.from(String(photo.iv || ""), "base64");
      const tag = stored.subarray(stored.length - 16);
      const ciphertext = stored.subarray(0, stored.length - 16);
      const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey, iv);
      decipher.setAuthTag(tag);
      const plainBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      await fs.promises.writeFile(filePath, serverEncryptBytes(plainBytes));
      delete student.photo.iv; // now server-managed
    } catch (error) {
      // Leave the photo entry untouched; image can be re-uploaded if needed.
    }
  }
}

/* ===========================================================================
 * Authorization: grants, roles, permissions, scope resolution & filtering
 * ========================================================================= */
const PERMISSION_MODULES = ["students", "branches", "teachers", "groups", "attendance", "payments", "salaries", "reports", "audit", "settings"];
const PERMISSION_LEVELS = ["none", "view", "edit"];

// Owner-only modules can never be granted at "edit" to others (kept owner-managed).
const ROLE_PRESETS = {
  yönetici: { students: "edit", branches: "edit", teachers: "edit", groups: "edit", attendance: "edit", payments: "edit", salaries: "edit", reports: "view", audit: "view", settings: "view" },
  eğitmen: { students: "edit", branches: "view", teachers: "view", groups: "view", attendance: "edit", payments: "none", salaries: "none", reports: "none", audit: "none", settings: "none" },
  görüntüleyici: { students: "view", branches: "view", teachers: "view", groups: "view", attendance: "view", payments: "view", salaries: "none", reports: "view", audit: "none", settings: "none" }
};

function fullPermissions() {
  return PERMISSION_MODULES.reduce((acc, module) => ({ ...acc, [module]: "edit" }), {});
}

function normalizePermissions(role, customPermissions) {
  if (role && ROLE_PRESETS[role]) {
    return { ...ROLE_PRESETS[role] };
  }
  const source = customPermissions && typeof customPermissions === "object" ? customPermissions : {};
  return PERMISSION_MODULES.reduce((acc, module) => {
    const level = String(source[module] || "none");
    acc[module] = PERMISSION_LEVELS.includes(level) ? level : "none";
    return acc;
  }, {});
}

function normalizeBranchScope(value) {
  if (value === "all" || value == null) return "all";
  if (!Array.isArray(value)) return "all";
  const ids = value
    .map((id) => sanitizePathSegment(id, "", 64))
    .filter(Boolean)
    .slice(0, 200);
  return Array.from(new Set(ids));
}

function grantsPath(ownerRef) {
  return path.join(accountDirPath(ownerRef), "grants.json");
}

async function readGrants(ownerRef) {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(grantsPath(ownerRef), "utf8"));
    return Array.isArray(parsed.grants) ? { grants: parsed.grants } : { grants: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { grants: [] };
    throw error;
  }
}

async function writeGrants(ownerRef, grants) {
  await writeJsonFileAtomic(grantsPath(ownerRef), { grants: grants.grants || [] });
  return grants;
}

function generateGrantId() {
  return `grant_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function publicGrant(grant) {
  return {
    id: grant.id,
    granteeEmail: grant.granteeEmail,
    granteeLabel: grant.granteeLabel || "",
    workspaceId: grant.workspaceId,
    role: grant.role,
    branchScope: grant.branchScope,
    permissions: grant.permissions,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt
  };
}

// Scan every account for grants addressed to this grantee email.
async function listSharedWorkspaces(granteeEmail) {
  const email = normalizeEmail(granteeEmail);
  if (!email) return [];
  const entries = await fs.promises.readdir(accountsPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  const shared = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const ownerDir = path.join(accountsPath, entry.name);
    let grantsFile;
    try {
      grantsFile = JSON.parse(await fs.promises.readFile(path.join(ownerDir, "grants.json"), "utf8"));
    } catch (error) {
      continue;
    }
    const myGrants = (grantsFile.grants || []).filter((g) => normalizeEmail(g.granteeEmail) === email);
    if (!myGrants.length) continue;

    const meta = JSON.parse(await fs.promises.readFile(path.join(ownerDir, "account.json"), "utf8").catch(() => "null")) || null;
    if (!meta || !meta.id) continue;
    const ownerRef = { id: meta.id, username: meta.username };
    const registry = await readWorkspaceRegistry(ownerRef);
    for (const grant of myGrants) {
      const ws = registry && registry.workspaces.find((w) => w.id === grant.workspaceId);
      if (!ws) continue;
      shared.push({
        ownerId: String(meta.id),
        ownerUsername: meta.username || "",
        ownerName: meta.displayName || meta.username || "Sahip",
        workspaceId: ws.id,
        name: ws.name,
        role: grant.role
      });
    }
  }
  return shared;
}

// Resolve the full access context for the session's active workspace ref.
// Returns null if the ref is missing or no longer valid (revoked / deleted).
async function resolveWorkspaceContext(req) {
  const stored = req.session && req.session.sid ? sessions.get(req.session.sid) : null;
  const ref = stored ? stored.activeWorkspaceRef : null;
  if (!ref || !ref.workspaceId) return null;

  const self = req.session.user;
  const selfId = String(self.id);

  if (String(ref.ownerId) === selfId) {
    const registry = await ensureWorkspaces(self);
    const ws = registry.workspaces.find((w) => w.id === ref.workspaceId);
    if (!ws) return null;
    return {
      ownerRef: self,
      ownerId: selfId,
      rawOwnerId: selfId,
      workspaceId: ws.id,
      workspaceName: ws.name,
      ownerName: self.displayName || self.username,
      isOwner: true,
      role: "owner",
      branchScope: "all",
      permissions: fullPermissions()
    };
  }

  const ownerRef = { id: ref.ownerId, username: ref.ownerUsername };
  const grantsFile = await readGrants(ownerRef);
  const email = normalizeEmail(self.email);
  const grant = (grantsFile.grants || []).find((g) => normalizeEmail(g.granteeEmail) === email && g.workspaceId === ref.workspaceId);
  if (!grant || !email) return null;

  const registry = await readWorkspaceRegistry(ownerRef);
  const ws = registry && registry.workspaces.find((w) => w.id === ref.workspaceId);
  if (!ws) return null;
  const meta = await readAccountMeta(ownerRef);

  return {
    ownerRef,
    ownerId: String(ref.ownerId),
    rawOwnerId: meta && meta.id ? String(meta.id) : String(ref.ownerId),
    workspaceId: ws.id,
    workspaceName: ws.name,
    ownerName: (meta && meta.displayName) || ref.ownerUsername || "Sahip",
    isOwner: false,
    role: grant.role,
    branchScope: normalizeBranchScope(grant.branchScope),
    permissions: normalizePermissions(grant.role === "özel" ? "özel" : grant.role, grant.permissions)
  };
}

const RESOURCE_MODULE = {
  students: "students",
  enrollments: "students",
  branches: "branches",
  groups: "groups",
  teachers: "teachers",
  attendance: "attendance",
  payments: "payments",
  teacherSalaries: "salaries",
  notifications: "payments",
  auditLog: "audit",
  settings: "settings"
};

function allowedBranchSet(ctx) {
  if (ctx.branchScope === "all" || !Array.isArray(ctx.branchScope)) return null;
  return new Set(ctx.branchScope);
}

// Produce the subset of data a scoped (non-owner) user is allowed to read.
function filterDataForScope(data, ctx) {
  const out = mergeWithDefaultData(data);
  const branchSet = allowedBranchSet(ctx);
  const level = (module) => (ctx.permissions || {})[module] || "none";

  if (branchSet) {
    out.branches = (out.branches || []).filter((b) => branchSet.has(b.id));
    out.groups = (out.groups || []).filter((g) => branchSet.has(g.branchId));
    out.enrollments = (out.enrollments || []).filter((e) => branchSet.has(e.branchId));
    out.attendance = (out.attendance || []).filter((a) => branchSet.has(a.branchId));
    out.payments = (out.payments || []).filter((p) => branchSet.has(p.branchId));
    out.teachers = (out.teachers || []).filter((t) => (t.branchIds || []).some((id) => branchSet.has(id)));
    const allowedStudentIds = new Set(out.enrollments.map((e) => e.studentId));
    out.students = (out.students || []).filter((s) => allowedStudentIds.has(s.id));
    const allowedTeacherIds = new Set(out.teachers.map((t) => t.id));
    out.teacherSalaries = (out.teacherSalaries || []).filter((s) => allowedTeacherIds.has(s.teacherId));
  }

  // Module gate: a "none" module returns nothing for its resources.
  ["students", "enrollments", "branches", "groups", "teachers", "attendance", "payments", "teacherSalaries", "notifications", "auditLog"].forEach((key) => {
    if (level(RESOURCE_MODULE[key]) === "none") out[key] = [];
  });
  // settings are always readable (needed for currency/theme/branding); editing is gated separately.
  return out;
}

// Compute the new value of one resource when a scoped user writes it, preserving
// out-of-scope data the user can't see and rejecting privilege escalation.
function mergeResourceForScope(resource, current, submitted, ctx) {
  // Audit log: append-only for scoped users (never drop the owner's entries).
  if (resource === "auditLog") {
    const stored = Array.isArray(current.auditLog) ? current.auditLog : [];
    const incoming = Array.isArray(submitted) ? submitted : [];
    const seen = new Set(stored.map((e) => e && e.id).filter(Boolean));
    const appended = incoming.filter((e) => e && (!e.id || !seen.has(e.id)));
    return [...stored, ...appended].slice(-5000);
  }
  // Notifications are client-derived; scoped users don't persist them.
  if (resource === "notifications") {
    return Array.isArray(current.notifications) ? current.notifications : [];
  }

  // Settings are workspace-global. Without settings:edit this is a no-op (e.g. a
  // scoped user toggling the theme) rather than an error.
  if (resource === "settings") {
    if (((ctx.permissions || {}).settings || "none") !== "edit") return current.settings;
    return submitted && typeof submitted === "object" && !Array.isArray(submitted) ? submitted : current.settings;
  }

  const module = RESOURCE_MODULE[resource];
  if (((ctx.permissions || {})[module] || "none") !== "edit") {
    throw requestError("Bu işlem için düzenleme yetkiniz yok.", 403);
  }

  const branchSet = allowedBranchSet(ctx);
  if (!branchSet) return submitted; // full branch access within an editable module

  const stored = Array.isArray(current[resource]) ? current[resource] : [];
  const incoming = Array.isArray(submitted) ? submitted : [];

  const directBranch = {
    branches: (x) => x.id,
    groups: (x) => x.branchId,
    enrollments: (x) => x.branchId,
    attendance: (x) => x.branchId,
    payments: (x) => x.branchId
  };

  if (directBranch[resource]) {
    const inScope = (x) => branchSet.has(directBranch[resource](x));
    return [...stored.filter((x) => !inScope(x)), ...incoming.filter(inScope)];
  }

  if (resource === "teachers") {
    const inScope = (t) => (t.branchIds || []).some((id) => branchSet.has(id));
    return [...stored.filter((t) => !inScope(t)), ...incoming.filter(inScope)];
  }

  if (resource === "teacherSalaries") {
    const allowedTeacherIds = new Set((current.teachers || []).filter((t) => (t.branchIds || []).some((id) => branchSet.has(id))).map((t) => t.id));
    const inScope = (s) => allowedTeacherIds.has(s.teacherId);
    return [...stored.filter((s) => !inScope(s)), ...incoming.filter(inScope)];
  }

  if (resource === "students") {
    const allowedStudentIds = new Set((current.enrollments || []).filter((e) => branchSet.has(e.branchId)).map((e) => e.studentId));
    const storedIds = new Set(stored.map((s) => s.id));
    const inScope = (s) => allowedStudentIds.has(s.id);
    // Keep out-of-scope students; accept edits to in-scope and brand-new students.
    return [...stored.filter((s) => !inScope(s)), ...incoming.filter((s) => inScope(s) || !storedIds.has(s.id))];
  }

  return submitted;
}

function workspaceLockKey(ctx) {
  return `${accountDirectoryName(ctx.ownerRef)}::ws::${sanitizePathSegment(ctx.workspaceId, "ws", 64)}`;
}

function auditActorName(user) {
  return String(user.displayName || user.username || user.email || "Kullanıcı");
}

// Append new audit entries, stamping each with the acting user (server-authoritative,
// so a scoped user cannot forge who performed an action). Existing entries (by id)
// are kept untouched; capped to the most recent 5000.
function appendAuditEntries(stored, incoming, user) {
  const base = Array.isArray(stored) ? stored : [];
  const seen = new Set(base.map((entry) => entry && entry.id).filter(Boolean));
  const actor = auditActorName(user);
  const actorEmail = normalizeEmail(user.email);
  const appended = (Array.isArray(incoming) ? incoming : [])
    .filter((entry) => entry && (!entry.id || !seen.has(entry.id)))
    .map((entry) => ({ ...entry, actor, actorEmail }));
  return [...base, ...appended].slice(-5000);
}

const LEVEL_ORDER = { none: 0, view: 1, edit: 2 };

// Throw 403 unless the context grants at least `needed` on `module`.
function ensureModuleLevel(ctx, module, needed) {
  const have = ctx.isOwner ? 2 : LEVEL_ORDER[(ctx.permissions || {})[module] || "none"] || 0;
  if (have < (LEVEL_ORDER[needed] || 0)) throw requestError("Bu işlem için yetkiniz yok.", 403);
}

function sniffImageMime(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "application/octet-stream";
}

// Generic per-key serialization (data writes per workspace, registry writes per account).
function withLock(lockKey, work) {
  const previous = accountLocks.get(lockKey) || Promise.resolve();
  const next = previous.then(work, work);
  const tracked = next.catch(() => {}).finally(() => {
    if (accountLocks.get(lockKey) === tracked) accountLocks.delete(lockKey);
  });
  accountLocks.set(lockKey, tracked);
  return next;
}

function registryLockKey(accountRef) {
  return `${accountDirectoryName(accountRef)}::registry`;
}

function validateResource(resource, value) {
  if (!resourceKeys.includes(resource)) {
    const error = new Error("Unknown resource");
    error.statusCode = 404;
    throw error;
  }

  if (arrayResources.has(resource) && !Array.isArray(value)) {
    const error = new Error("Resource must be an array");
    error.statusCode = 400;
    throw error;
  }

  if (resource === "settings" && (!value || typeof value !== "object" || Array.isArray(value))) {
    const error = new Error("Settings must be an object");
    error.statusCode = 400;
    throw error;
  }
}

function constantTimeEquals(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createPublicScheduleToken(ownerId, workspaceId, branchId) {
  const scope = [
    sanitizePathSegment(ownerId, "owner", 64),
    sanitizePathSegment(workspaceId, "ws", 64),
    sanitizePathSegment(branchId, "branch", 64)
  ].join(":");
  return crypto.createHmac("sha256", MASTER_KEY).update(`public-schedule:${scope}`).digest("base64url").slice(0, 24);
}

function groupSessionsFromData(group) {
  if (group && Array.isArray(group.sessions) && group.sessions.length) {
    return group.sessions
      .filter((session) => session && session.day)
      .map((session) => ({
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

function groupTeacherNamesFromData(group, teachers) {
  const list = Array.isArray(teachers) ? teachers : [];
  const ids = Array.isArray(group && group.instructorIds) ? group.instructorIds : [];
  if (ids.length) {
    return ids
      .map((id) => {
        const teacher = list.find((item) => item.id === id);
        return teacher ? `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() : "";
      })
      .filter(Boolean);
  }
  if (group && group.instructorName) return [String(group.instructorName)];
  return [];
}

function buildPublicSchedulePayload(data, workspace, branchId) {
  const normalized = mergeWithDefaultData(data);
  const allBranches = branchId === "all";

  const activeBranches = (normalized.branches || []).filter((b) => b && b.id);
  if (!allBranches) {
    const branch = activeBranches.find((item) => item.id === branchId);
    if (!branch) return null;
  }

  const targetBranches = allBranches ? activeBranches : activeBranches.filter((b) => b.id === branchId);
  const targetBranchIds = new Set(targetBranches.map((b) => b.id));

  const activeStudentIds = new Set(
    (normalized.students || []).filter((student) => student.status === "Aktif").map((student) => student.id)
  );
  const groupStudentCounts = new Map();
  const totalStudentIds = new Set();

  (normalized.enrollments || []).forEach((enrollment) => {
    if (!enrollment || enrollment.status !== "Aktif" || !activeStudentIds.has(enrollment.studentId)) return;
    if (targetBranchIds.has(enrollment.branchId)) totalStudentIds.add(enrollment.studentId);
    if (enrollment.groupId) groupStudentCounts.set(enrollment.groupId, (groupStudentCounts.get(enrollment.groupId) || 0) + 1);
  });

  const groups = (normalized.groups || []).filter((group) => targetBranchIds.has(group.branchId) && group.status === "Aktif");
  const branchById = new Map(targetBranches.map((b) => [b.id, b]));

  const days = SCHEDULE_DAYS.map((day) => {
    const items = groups
      .flatMap((group) =>
        groupSessionsFromData(group)
          .filter((session) => session.day === day)
          .map((session) => {
            const count = groupStudentCounts.get(group.id) || 0;
            const capacity = Number(group.capacity || 0);
            const grpBranch = branchById.get(group.branchId);
            return {
              groupId: group.id,
              groupName: String(group.name || "Grup"),
              startTime: String(session.startTime || ""),
              endTime: String(session.endTime || ""),
              teacherNames: groupTeacherNamesFromData(group, normalized.teachers),
              level: String(group.level || ""),
              ageRange: String(group.ageRange || ""),
              currentCount: count,
              capacity: capacity > 0 ? capacity : null,
              branchId: group.branchId,
              branchName: grpBranch ? String(grpBranch.name || "") : "",
              branchColor: grpBranch ? String(grpBranch.color || "#dc2727") : "#dc2727"
            };
          })
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.branchName.localeCompare(b.branchName));

    return { day, items };
  });

  const singleBranch = allBranches ? null : targetBranches[0];

  return {
    workspaceName: String((workspace && workspace.name) || DEFAULT_WORKSPACE_NAME),
    isAllBranches: allBranches,
    branch: singleBranch
      ? { id: singleBranch.id, name: String(singleBranch.name || "Branş"), color: String(singleBranch.color || "#dc2727") }
      : null,
    branches: targetBranches.map((b) => ({ id: b.id, name: String(b.name || "Branş"), color: String(b.color || "#dc2727") })),
    totals: {
      groups: groups.length,
      students: totalStudentIds.size,
      sessions: days.reduce((sum, entry) => sum + entry.items.length, 0)
    },
    days
  };
}

// Return the protocol Express resolved (trusting proxy headers when TRUST_PROXY
// is enabled) or fall back to reading X-Forwarded-Proto directly so that the
// OAuth redirect_uri is always https:// when the proxy terminates TLS, even if
// TRUST_PROXY was not set.
function getRequestProtocol(req) {
  if (req.protocol && req.protocol !== "http") return req.protocol;
  const forwarded = req.headers["x-forwarded-proto"];
  if (forwarded) return String(forwarded).split(",")[0].trim().toLowerCase();
  return req.protocol || "http";
}

function normalizeBasePath(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function getRequestBasePath(req) {
  const forwarded = req.headers["x-forwarded-prefix"];
  if (forwarded) return normalizeBasePath(String(forwarded).split(",")[0]);
  return APP_BASE_PATH;
}

function toRelativeAppUrl(fromPath, targetUrl) {
  const value = String(targetUrl || "").trim();
  if (!value) return ".";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return value;

  const match = value.match(/^([^?#]*)(.*)$/);
  const targetPath = match && match[1] ? match[1] : "/";
  const suffix = match ? match[2] : "";
  const sourcePath = String(fromPath || "/");
  const normalizedSource = sourcePath.startsWith("/") ? sourcePath : `/${sourcePath}`;
  const sourceDir = normalizedSource.endsWith("/") ? normalizedSource : path.posix.dirname(normalizedSource);
  const normalizedTarget = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  const relativePath = path.posix.relative(sourceDir || "/", normalizedTarget) || ".";

  return `${relativePath}${suffix}`;
}

function redirectWithinApp(req, res, targetUrl) {
  return res.redirect(toRelativeAppUrl(req.path || "/", targetUrl));
}

function buildAbsoluteAppUrl(req, targetUrl) {
  const value = String(targetUrl || "").trim();
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return `${getRequestProtocol(req)}://${req.get("host")}${getRequestBasePath(req)}${normalized}`;
}

function getOAuthConfig(req) {
  return {
    clientId: process.env.CAYADEV_CLIENT_ID || "",
    clientSecret: process.env.CAYADEV_CLIENT_SECRET || "",
    redirectUri:
      process.env.CAYADEV_REDIRECT_URI ||
      `${getRequestProtocol(req)}://${req.get("host")}${getRequestBasePath(req)}/auth/cayadev/callback`,
    scope: process.env.CAYADEV_SCOPE || "profile:read email:read avatar:read"
  };
}

function isOAuthConfigured(req) {
  const config = getOAuthConfig(req);
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

function normalizeOAuthUser(profile) {
  const id = String(profile.sub || profile.id || "").trim();
  if (!id) {
    const error = new Error("OAuth profile does not include sub");
    error.statusCode = 502;
    throw error;
  }

  return {
    id,
    username: String(profile.username || profile.email || id),
    displayName: String(profile.display_name || profile.displayName || profile.username || profile.email || "CaYaDev kullanıcısı"),
    email: profile.email ? String(profile.email) : "",
    avatar: profile.avatar ? String(profile.avatar) : "",
    role: "owner"
  };
}

async function exchangeCodeForUser(req, code) {
  const config = getOAuthConfig(req);
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });

  const tokenResponse = await fetch(CAYADEV_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    const error = new Error(`OAuth token request failed: ${tokenResponse.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const tokens = await tokenResponse.json();
  if (!tokens.access_token) {
    const error = new Error("OAuth token response does not include access_token");
    error.statusCode = 502;
    throw error;
  }

  const userResponse = await fetch(CAYADEV_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  if (!userResponse.ok) {
    const detail = await userResponse.text();
    const error = new Error(`OAuth userinfo request failed: ${userResponse.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  return normalizeOAuthUser(await userResponse.json());
}

function cleanupMemoryStores() {
  const now = Date.now();
  for (const [sid, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(sid);
  }
  for (const [state, item] of oauthStates.entries()) {
    if (item.expiresAt <= now) oauthStates.delete(state);
  }
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

setInterval(cleanupMemoryStores, 5 * ONE_MINUTE).unref();

const staticFileOptions = {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    } else if (filePath.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css; charset=utf-8");
    }
    // Force browsers and intermediaries to re-fetch source assets so stale or
    // proxy-transformed script bytes cannot survive across deployments.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, no-transform");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
};
app.use("/css", express.static(path.join(publicPath, "css"), staticFileOptions));
app.use("/js", express.static(path.join(publicPath, "js"), staticFileOptions));
app.use("/assets", express.static(path.join(publicPath, "assets"), staticFileOptions));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/login.html", authLimiter, (req, res) => {
  if (getSession(req) && !req.query.error) return redirectWithinApp(req, res, "/workspaces.html");
  return res.sendFile(path.join(publicPath, "login.html"));
});

app.get("/auth/cayadev", authLimiter, (req, res) => {
  const config = getOAuthConfig(req);
  if (!isOAuthConfigured(req)) return redirectWithinApp(req, res, "/login.html?error=oauth_config");

  const state = randomToken(24);
  oauthStates.set(state, {
    ip: req.ip,
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS
  });

  const url = new URL(CAYADEV_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);

  return res.redirect(url.toString());
});

app.get("/auth/cayadev/callback", authLimiter, async (req, res, next) => {
  const error = req.query.error ? String(req.query.error) : "";
  const code = req.query.code ? String(req.query.code) : "";
  const state = req.query.state ? String(req.query.state) : "";

  if (error) return redirectWithinApp(req, res, `/login.html?error=${encodeURIComponent(error)}`);
  if (!code || !state) return redirectWithinApp(req, res, "/login.html?error=oauth_missing_code");

  const stateRecord = oauthStates.get(state);
  oauthStates.delete(state);
  if (!stateRecord || stateRecord.expiresAt <= Date.now()) {
    return redirectWithinApp(req, res, "/login.html?error=oauth_state");
  }

  if (!isOAuthConfigured(req)) return redirectWithinApp(req, res, "/login.html?error=oauth_config");

  try {
    const user = await exchangeCodeForUser(req, code);
    await writeAccountMeta(user);
    await ensureWorkspaces(user);
    createSession(res, user);
    return redirectWithinApp(req, res, "/workspaces.html");
  } catch (callbackError) {
    console.error(callbackError);
    return next(callbackError);
  }
});

app.get("/api/auth/session", authLimiter, (req, res) => {
  const session = getSession(req);
  res.json({
    authenticated: Boolean(session),
    oauthConfigured: isOAuthConfigured(req),
    user: session ? session.user : null
  });
});

app.post("/api/auth/logout", apiLimiter, (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

app.get("/api/data", apiLimiter, requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const data = await readWorkspaceData(req.ws.ownerRef, req.ws.workspaceId, req.ws.rawOwnerId);
    res.json(req.ws.isOwner ? data : filterDataForScope(data, req.ws));
  } catch (error) {
    next(error);
  }
});

app.put("/api/data/:resource", apiLimiter, mutationLimiter, requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const resource = String(req.params.resource || "");
    const value = req.body && Object.prototype.hasOwnProperty.call(req.body, "value") ? req.body.value : req.body;
    validateResource(resource, value);

    const data = await withLock(workspaceLockKey(req.ws), async () => {
      const current = await readWorkspaceData(req.ws.ownerRef, req.ws.workspaceId, req.ws.rawOwnerId);
      if (resource === "auditLog") {
        // Audit is append-only and the server stamps WHO acted (anti-spoof).
        // The owner may clear it by sending an empty array.
        const incoming = Array.isArray(value) ? value : [];
        current.auditLog = req.ws.isOwner && incoming.length === 0
          ? []
          : appendAuditEntries(current.auditLog, incoming, req.session.user);
      } else {
        current[resource] = req.ws.isOwner ? value : mergeResourceForScope(resource, current, value, req.ws);
      }
      return writeWorkspaceData(req.ws.ownerRef, req.ws.workspaceId, current);
    });

    res.json({ ok: true, value: req.ws.isOwner ? data[resource] : filterDataForScope(data, req.ws)[resource] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/data/reset", apiLimiter, mutationLimiter, requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    if (!req.ws.isOwner) throw requestError("Yalnızca çalışma alanı sahibi verileri sıfırlayabilir.", 403);
    const data = await withLock(workspaceLockKey(req.ws), () =>
      writeWorkspaceData(req.ws.ownerRef, req.ws.workspaceId, clone(defaultData))
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Active workspace access context for the client (role, permissions, branch scope).
app.get("/api/workspace-context", apiLimiter, requireAuth, requireWorkspace, (req, res) => {
  res.json({
    workspaceId: req.ws.workspaceId,
    workspaceName: req.ws.workspaceName,
    ownerName: req.ws.ownerName,
    isOwner: req.ws.isOwner,
    role: req.ws.role,
    permissions: req.ws.permissions,
    branchScope: req.ws.branchScope
  });
});

app.get("/api/public-schedules/:branchId", apiLimiter, requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    ensureModuleLevel(req.ws, "groups", "view");
    ensureModuleLevel(req.ws, "branches", "view");

    const rawBranchId = String(req.params.branchId || "").trim();
    const branchId = rawBranchId === "all" ? "all" : sanitizePathSegment(rawBranchId, "", 64);
    if (!branchId) throw requestError("Geçersiz branş.");

    const source = await readWorkspaceData(req.ws.ownerRef, req.ws.workspaceId, req.ws.rawOwnerId);
    const scoped = req.ws.isOwner ? source : filterDataForScope(source, req.ws);

    let branchName = "Tüm Branşlar";
    if (branchId !== "all") {
      const branch = (scoped.branches || []).find((item) => item.id === branchId);
      if (!branch) throw requestError("Branş bulunamadı.", 404);
      branchName = branch.name || "Branş";
    }

    const ownerId = String(req.ws.ownerId || "");
    const shareId = createPublicScheduleToken(ownerId, req.ws.workspaceId, branchId);
    const sharePath = `/schedule/${encodeURIComponent(ownerId)}/${encodeURIComponent(req.ws.workspaceId)}/${encodeURIComponent(branchId)}/${encodeURIComponent(shareId)}`;

    res.json({
      ok: true,
      branchId,
      branchName,
      shareId,
      path: sharePath,
      url: buildAbsoluteAppUrl(req, sharePath)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/schedule/:ownerId/:workspaceId/:branchId/:shareId/data", apiLimiter, async (req, res, next) => {
  try {
    const ownerId = sanitizePathSegment(req.params.ownerId, "", 64);
    const workspaceId = sanitizePathSegment(req.params.workspaceId, "", 64);
    const branchId = sanitizePathSegment(req.params.branchId, "", 64);
    const shareId = String(req.params.shareId || "").trim();
    if (!ownerId || !workspaceId || !branchId || !shareId) throw requestError("Geçersiz paylaşım bağlantısı.", 404);

    const expected = createPublicScheduleToken(ownerId, workspaceId, branchId);
    if (!constantTimeEquals(shareId, expected)) throw requestError("Paylaşım bağlantısı bulunamadı.", 404);

    const ownerRef = await resolveOwnerRefById(ownerId);
    if (!ownerRef) throw requestError("Paylaşım bağlantısı bulunamadı.", 404);

    const registry = await readWorkspaceRegistry(ownerRef);
    const workspace = registry && registry.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw requestError("Çalışma alanı bulunamadı.", 404);

    const rawOwnerId = await resolveRawOwnerId(ownerRef);
    const data = await readWorkspaceData(ownerRef, workspaceId, rawOwnerId);
    const payload = buildPublicSchedulePayload(data, workspace, branchId);
    if (!payload) throw requestError("Program bulunamadı.", 404);

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/schedule/:ownerId/:workspaceId/:branchId/:shareId", (req, res) => {
  res.sendFile(path.join(publicPath, "public-schedule.html"));
});

/* ----------------------------- Workspaces API ---------------------------- */
app.get("/api/workspaces", apiLimiter, requireAuth, async (req, res, next) => {
  try {
    const registry = await ensureWorkspaces(req.session.user);
    const owned = registry.workspaces.map((ws) => ({ workspaceId: ws.id, name: ws.name, createdAt: ws.createdAt }));
    const shared = await listSharedWorkspaces(req.session.user.email);
    const activeRef = getActiveWorkspaceRef(req);
    res.json({
      owned,
      shared: shared.filter((item) => String(item.ownerId) !== String(req.session.user.id)),
      activeRef: activeRef ? { ownerId: activeRef.ownerId, workspaceId: activeRef.workspaceId } : null,
      ownerId: String(req.session.user.id),
      max: MAX_WORKSPACES
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/workspaces", apiLimiter, mutationLimiter, requireAuth, async (req, res, next) => {
  try {
    const name = sanitizeWorkspaceName(req.body && req.body.name);
    if (!name) throw requestError("Çalışma alanı adı gerekli.");

    const workspace = await withLock(registryLockKey(req.session.user), async () => {
      const registry = await ensureWorkspaces(req.session.user);
      if (registry.workspaces.length >= MAX_WORKSPACES) {
        throw requestError(`En fazla ${MAX_WORKSPACES} çalışma alanı oluşturabilirsiniz.`, 409);
      }
      const created = { id: generateWorkspaceId(), name, createdAt: new Date().toISOString() };
      await writeWorkspaceRegistry(req.session.user, { workspaces: [...registry.workspaces, created] });
      await fs.promises.mkdir(workspaceDirPath(req.session.user, created.id), { recursive: true });
      return created;
    });

    res.json({ ok: true, workspace });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/workspaces/:id", apiLimiter, mutationLimiter, requireAuth, async (req, res, next) => {
  try {
    const id = sanitizePathSegment(req.params.id, "", 64);
    const name = sanitizeWorkspaceName(req.body && req.body.name);
    if (!name) throw requestError("Çalışma alanı adı gerekli.");

    const workspace = await withLock(registryLockKey(req.session.user), async () => {
      const registry = await ensureWorkspaces(req.session.user);
      const target = registry.workspaces.find((item) => item.id === id);
      if (!target) throw requestError("Çalışma alanı bulunamadı.", 404);
      target.name = name;
      await writeWorkspaceRegistry(req.session.user, registry);
      return target;
    });

    res.json({ ok: true, workspace });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/workspaces/:id", apiLimiter, mutationLimiter, requireAuth, async (req, res, next) => {
  try {
    const id = sanitizePathSegment(req.params.id, "", 64);
    await withLock(registryLockKey(req.session.user), async () => {
      const registry = await ensureWorkspaces(req.session.user);
      if (registry.workspaces.length <= 1) throw requestError("Son çalışma alanı silinemez.", 409);
      if (!registry.workspaces.some((item) => item.id === id)) throw requestError("Çalışma alanı bulunamadı.", 404);
      await writeWorkspaceRegistry(req.session.user, { workspaces: registry.workspaces.filter((item) => item.id !== id) });
      await fs.promises.rm(workspaceDirPath(req.session.user, id), { recursive: true, force: true }).catch(() => {});
      // Drop any grants tied to the removed workspace.
      const grantsFile = await readGrants(req.session.user);
      const remaining = (grantsFile.grants || []).filter((g) => g.workspaceId !== id);
      if (remaining.length !== (grantsFile.grants || []).length) await writeGrants(req.session.user, { grants: remaining });
    });

    const activeRef = getActiveWorkspaceRef(req);
    if (activeRef && activeRef.ownerId === String(req.session.user.id) && activeRef.workspaceId === id) setActiveWorkspaceRef(req, null);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Select an owned or shared workspace as the active one for this session.
app.post("/api/workspaces/select", apiLimiter, mutationLimiter, requireAuth, async (req, res, next) => {
  try {
    const ownerId = String((req.body && req.body.ownerId) || "");
    const ownerUsername = String((req.body && req.body.ownerUsername) || "");
    const workspaceId = sanitizePathSegment(req.body && req.body.workspaceId, "", 64);
    if (!ownerId || !workspaceId) throw requestError("Geçersiz çalışma alanı.");

    if (ownerId === String(req.session.user.id)) {
      const registry = await ensureWorkspaces(req.session.user);
      if (!registry.workspaces.some((w) => w.id === workspaceId)) throw requestError("Çalışma alanı bulunamadı.", 404);
    } else {
      const ownerRef = { id: ownerId, username: ownerUsername };
      const grantsFile = await readGrants(ownerRef);
      const email = normalizeEmail(req.session.user.email);
      const grant = (grantsFile.grants || []).find((g) => normalizeEmail(g.granteeEmail) === email && g.workspaceId === workspaceId);
      if (!grant || !email) throw requestError("Bu çalışma alanına erişim yetkiniz yok.", 403);
      const registry = await readWorkspaceRegistry(ownerRef);
      if (!registry || !registry.workspaces.some((w) => w.id === workspaceId)) throw requestError("Çalışma alanı bulunamadı.", 404);
    }

    setActiveWorkspaceRef(req, { ownerId, ownerUsername, workspaceId });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------- Grants API ------------------------------ */
// All grant routes operate on the currently-active workspace and require the
// caller to be its owner.
function requireOwner(req, res, next) {
  if (!req.ws || !req.ws.isOwner) {
    return res.status(403).json({ error: "forbidden", message: "Bu işlem için çalışma alanı sahibi olmalısınız." });
  }
  return next();
}

app.get("/api/workspaces/grants", apiLimiter, requireAuth, requireWorkspace, requireOwner, async (req, res, next) => {
  try {
    const grantsFile = await readGrants(req.session.user);
    const grants = (grantsFile.grants || []).filter((g) => g.workspaceId === req.ws.workspaceId).map(publicGrant);
    res.json({ grants, roles: Object.keys(ROLE_PRESETS), modules: PERMISSION_MODULES, presets: ROLE_PRESETS });
  } catch (error) {
    next(error);
  }
});

app.post("/api/workspaces/grants", apiLimiter, mutationLimiter, requireAuth, requireWorkspace, requireOwner, async (req, res, next) => {
  try {
    const body = req.body || {};
    const granteeEmail = normalizeEmail(body.granteeEmail);
    if (!granteeEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(granteeEmail)) throw requestError("Geçerli bir e-posta girin.");
    if (granteeEmail === normalizeEmail(req.session.user.email)) throw requestError("Kendinize yetki veremezsiniz.");
    const role = ["yönetici", "eğitmen", "görüntüleyici", "özel"].includes(body.role) ? body.role : "görüntüleyici";
    const permissions = normalizePermissions(role === "özel" ? "özel" : role, body.permissions);
    const branchScope = normalizeBranchScope(body.branchScope);
    const granteeLabel = sanitizeWorkspaceName(body.granteeLabel);

    const grant = await withLock(registryLockKey(req.session.user), async () => {
      const grantsFile = await readGrants(req.session.user);
      const grants = grantsFile.grants || [];
      const existing = grants.find((g) => g.workspaceId === req.ws.workspaceId && normalizeEmail(g.granteeEmail) === granteeEmail);
      if (existing) {
        Object.assign(existing, { granteeLabel, role, permissions, branchScope, updatedAt: new Date().toISOString() });
        await writeGrants(req.session.user, { grants });
        return existing;
      }
      const created = {
        id: generateGrantId(),
        granteeEmail,
        granteeLabel,
        workspaceId: req.ws.workspaceId,
        role,
        permissions,
        branchScope,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await writeGrants(req.session.user, { grants: [...grants, created] });
      return created;
    });

    res.json({ ok: true, grant: publicGrant(grant) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/workspaces/grants/:id", apiLimiter, mutationLimiter, requireAuth, requireWorkspace, requireOwner, async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    await withLock(registryLockKey(req.session.user), async () => {
      const grantsFile = await readGrants(req.session.user);
      const grants = (grantsFile.grants || []).filter((g) => !(g.id === id && g.workspaceId === req.ws.workspaceId));
      await writeGrants(req.session.user, { grants });
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- Student images ---------------------------- */
app.post(
  "/api/student-images/:studentId",
  apiLimiter,
  mutationLimiter,
  requireAuth,
  requireWorkspace,
  async (req, res, next) => {
    try {
      ensureModuleLevel(req.ws, "students", "edit");
      const studentId = sanitizePathSegment(req.params.studentId, "", 96);
      if (!studentId) throw requestError("Geçersiz öğrenci id.");

      // Image bytes arrive as base64 inside a JSON body (parsed by express.json).
      // This matches the logo upload transport; the reverse proxy forwards
      // application/json reliably but stalled raw application/octet-stream POSTs.
      const base64 = req.body && typeof req.body.data === "string" ? req.body.data : "";
      const bytes = base64 ? Buffer.from(base64, "base64") : Buffer.alloc(0);
      if (bytes.length === 0) throw requestError("Resim verisi boş.");
      if (bytes.length > 8 * 1024 * 1024) throw requestError("Resim en fazla 8 MB olabilir.");
      if (sniffImageMime(bytes) === "application/octet-stream") throw requestError("Sadece JPG, PNG veya WebP yüklenebilir.");

      const imageId = `img_${Date.now().toString(36)}_${randomToken(8)}`;
      const filePath = workspaceImageFilePath(req.ws.ownerRef, req.ws.workspaceId, studentId, imageId);
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(tmpPath, serverEncryptBytes(bytes));
      await fs.promises.rename(tmpPath, filePath);

      res.json({
        ok: true,
        image: {
          id: imageId,
          url: `api/student-images/${encodeURIComponent(studentId)}/${encodeURIComponent(imageId)}`,
          byteLength: bytes.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/student-images/:studentId/:imageId", apiLimiter, requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    ensureModuleLevel(req.ws, "students", "view");
    const studentId = sanitizePathSegment(req.params.studentId, "", 96);
    const imageId = sanitizePathSegment(req.params.imageId, "", 96);
    if (!studentId || !imageId) throw requestError("Geçersiz resim yolu.", 404);

    const filePath = workspaceImageFilePath(req.ws.ownerRef, req.ws.workspaceId, studentId, imageId);
    let stored;
    try {
      stored = await fs.promises.readFile(filePath);
    } catch (error) {
      throw requestError("Resim bulunamadı.", 404);
    }
    let bytes;
    try {
      bytes = serverDecryptBytes(stored);
    } catch (error) {
      throw requestError("Resim bulunamadı.", 404);
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", sniffImageMime(bytes));
    res.end(bytes);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/student-images/:studentId/:imageId", apiLimiter, mutationLimiter, requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    ensureModuleLevel(req.ws, "students", "edit");
    const studentId = sanitizePathSegment(req.params.studentId, "", 96);
    const imageId = sanitizePathSegment(req.params.imageId, "", 96);
    if (!studentId || !imageId) throw requestError("Geçersiz resim yolu.", 404);

    const filePath = workspaceImageFilePath(req.ws.ownerRef, req.ws.workspaceId, studentId, imageId);
    await fs.promises.unlink(filePath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Workspace picker — needs auth but no selected workspace yet.
app.get("/workspaces.html", requireAuth, (req, res) => {
  res.sendFile(path.join(publicPath, "workspaces.html"));
});

// App pages require both an authenticated session and a selected workspace.
protectedPages.forEach((page) => {
  app.get(page, requireAuth, requireWorkspace, (req, res) => {
    res.sendFile(path.join(publicPath, page.slice(1)));
  });
});

app.use((req, res) => {
  const homeHref = toRelativeAppUrl(req.path || "/", "/");
  res.status(404).send(`
    <!doctype html>
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>404 - CaYaSport Panel</title>
        <style>
          body { margin: 0; font-family: Arial, sans-serif; background: #f6f8fb; color: #172033; display: grid; place-items: center; min-height: 100vh; }
          main { max-width: 520px; padding: 32px; text-align: center; }
          a { color: #dc2727; font-weight: 700; }
        </style>
      </head>
      <body>
        <main>
          <h1>Sayfa bulunamadı</h1>
          <p>Aradığınız sayfa CaYaSport Panel içinde mevcut değil.</p>
          <a href="${homeHref}">Panele dön</a>
        </main>
      </body>
    </html>
  `);
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  const status = error.statusCode || 500;
  if (status >= 500) console.error(error);

  if (req.path.startsWith("/api/")) {
    return res.status(status).json({
      error: status >= 500 ? "server_error" : "request_error",
      message: status >= 500 ? "Sunucu hatasi olustu." : error.message
    });
  }

  return redirectWithinApp(req, res, `/login.html?error=${encodeURIComponent(status >= 500 ? "server_error" : error.message)}`);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CaYaSport Panel http://localhost:${PORT} adresinde calisiyor`);
  });
}

// Exported for tests (no side effects when required).
module.exports = {
  app,
  serverEncryptObject,
  serverDecryptObject,
  serverEncryptBytes,
  serverDecryptBytes,
  deriveClientDataKey,
  decryptClientEnvelopeWithKey,
  readWorkspaceData,
  writeWorkspaceData,
  ensureWorkspaces,
  workspaceDataFilePath,
  workspaceImageFilePath,
  filterDataForScope,
  mergeResourceForScope,
  normalizePermissions,
  normalizeBranchScope,
  ROLE_PRESETS,
  readGrants,
  writeGrants,
  listSharedWorkspaces,
  writeWorkspaceRegistry,
  writeAccountMeta
};
