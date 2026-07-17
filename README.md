# CaYaSport Panel

> 🇹🇷 Türkçe aşağıda · 🇬🇧 English below

## 🇹🇷 Türkçe

**CaYaSport Panel**, spor salonları, kurslar ve branş bazlı spor okulları için web tabanlı bir yönetim panelidir. Node.js + Express sunucusu ve çerçevesiz (vanilla) JavaScript arayüzünden oluşur. Veriler sunucuda, hesap ve çalışma alanı bazında şifrelenmiş JSON dosyalarında tutulur.

### Özellikler
- **CaYaDev OAuth ile giriş** (oturum çerezi, oturum süresi ayarlanabilir, giriş uçlarında hız sınırlama)
- **Çalışma alanları (workspace):** bir hesapta birden çok salon/kurum; başka kullanıcılara yetki (grant) verme
- **Öğrenciler:** kayıt, fotoğraf yükleme, branş/grup atama
- **Öğretmenler ve maaşlar**
- **Branşlar ve gruplar**, haftalık ders programı
- **Yoklama**
- **Ödemeler** ve **ödenmeyenler** listesi
- **Raporlar** ve Excel (.xlsx) dışa aktarma
- **Yetkiler** ve **denetim kaydı (audit log)**
- **Herkese açık ders programı paylaşımı** (imzalı paylaşım bağlantısı)
- Bildirimler, ayarlar, veri sıfırlama

### Teknolojiler
Node.js, Express 4, HTML/CSS, vanilla JavaScript. Veri: AES ile şifrelenmiş JSON dosyaları (`data/` klasörü).

### Gereksinimler
- Node.js 18+ (yerleşik `fetch` kullanılır)
- Bir CaYaDev OAuth istemcisi (client id / secret)

### Kurulum
```bash
npm install
cp .env.example .env   # Windows: copy .env.example .env
```
`.env` anahtarları:

| Anahtar | Açıklama |
|---|---|
| `CAYADEV_CLIENT_ID` | CaYaDev OAuth istemci kimliği |
| `CAYADEV_CLIENT_SECRET` | CaYaDev OAuth istemci sırrı (**asla paylaşmayın**) |
| `CAYADEV_REDIRECT_URI` | OAuth dönüş adresi, ör. `http://localhost:3000/auth/cayadev/callback` |
| `CAYADEV_SCOPE` | İstenen izinler (`profile:read email:read avatar:read`) |
| `SESSION_TTL_MS` | Oturum süresi (ms), varsayılan 12 saat |
| `PORT` | Sunucu portu, varsayılan 3000 |
| `DATA_ENCRYPTION_KEY` | 32 bayt AES anahtarı (base64). Yoksa `data/.master.key` otomatik oluşturulur |
| `TRUST_PROXY`, `NODE_ENV`, `COOKIE_SECURE`, `APP_BASE_PATH` | Reverse proxy / üretim ayarları (`.env.example` içinde açıklandı) |
| `CAYADEV_AUTHORIZE_URL`, `CAYADEV_TOKEN_URL`, `CAYADEV_USERINFO_URL` | İsteğe bağlı OAuth uç noktası geçersiz kılmaları |

### Çalıştırma
```bash
npm start
```
Ardından `http://localhost:3000` adresini açın, CaYaDev ile giriş yapın ve bir çalışma alanı oluşturun.

### Proje yapısı
```
server.js          Express sunucusu, OAuth, oturumlar, API, şifreli depolama
public/            HTML sayfaları, css/style.css, assets/logo.svg
public/js/         Sayfa modülleri (students, payments, groups, reports ...)
data/              Çalışma zamanı verisi (repoda yok, .gitignore)
.env.example       Örnek ortam değişkenleri
```

### Bilinen sorunlar / notlar
- Giriş yalnızca CaYaDev OAuth ile yapılabilir; başka bir giriş yöntemi yoktur.
- Veriler dosya tabanlıdır; çok kullanıcılı yoğun kullanım için bir veritabanı yoktur.
- Otomatik test yoktur.
- Üretimde `DATA_ENCRYPTION_KEY` mutlaka ayarlanmalı; `data/.master.key` kaybolursa veriler okunamaz.

### Proje tarihleri
- **Oluşturulma:** 16 Mayıs 2026
- **Son güncelleme:** 17 Temmuz 2026

### Lisans
Repoda ayrı bir lisans dosyası yoktur (`package.json` içinde `MIT` yazmaktadır).

---

## 🇬🇧 English

**CaYaSport Panel** is a web-based management panel for gyms, courses and multi-branch sports schools. It is a Node.js + Express server with a framework-free (vanilla) JavaScript frontend. Data is stored on the server as encrypted JSON files per account and workspace.

### Features
- **Sign-in with CaYaDev OAuth** (session cookie, configurable TTL, rate-limited auth endpoints)
- **Workspaces:** multiple gyms/organisations per account; share access with other users (grants)
- **Students** with photo upload and branch/group assignment
- **Teachers and salaries**
- **Branches and groups**, weekly schedule
- **Attendance**
- **Payments** and **unpaid** list
- **Reports** and Excel (.xlsx) export
- **Permissions** and **audit log**
- **Public schedule sharing** via signed share links
- Notifications, settings, data reset

### Tech
Node.js, Express 4, HTML/CSS, vanilla JavaScript. Storage: AES-encrypted JSON files (`data/`).

### Requirements
- Node.js 18+ (uses built-in `fetch`)
- A CaYaDev OAuth client (client id / secret)

### Setup
```bash
npm install
cp .env.example .env
```
Fill in `.env` (see the table in the Turkish section: `CAYADEV_CLIENT_ID`, `CAYADEV_CLIENT_SECRET`, `CAYADEV_REDIRECT_URI`, `CAYADEV_SCOPE`, `SESSION_TTL_MS`, `PORT`, `DATA_ENCRYPTION_KEY`, proxy options).

### Run
```bash
npm start
```
Open `http://localhost:3000`, sign in with CaYaDev and create a workspace.

### Known issues / notes
- Only CaYaDev OAuth login is supported.
- File-based storage, no database.
- No automated tests.
- Set `DATA_ENCRYPTION_KEY` in production; losing `data/.master.key` makes data unreadable.

### Project dates
- **Created:** 16 May 2026
- **Last updated:** 17 July 2026

### License
No separate license file (`package.json` declares `MIT`).