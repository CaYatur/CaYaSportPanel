@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo  CaYaSport Panel guncelleme
echo  Klasor: %CD%
echo ============================================
echo.
echo Kod, GitHub main dali ile esitlenir.
echo data, .env, log ve node_modules silinmez.
echo Sunucu otomatik kapanmaz ve yeniden baslamaz.
echo Sunucu aciksa once kapatin. Acik dosya, paket kurulumunu kilitleyebilir.
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo HATA: Git bulunamadi.
  goto fail
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Bu klasor git deposu degil.
  echo Mevcut dosyalar silinmeden GitHub deposuna baglaniyor...
  git init -b main
  if errorlevel 1 (
    git init
    if errorlevel 1 goto fail
  )
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/CaYatur/CaYaSportPanel.git
  if errorlevel 1 (
    echo HATA: origin eklenemedi.
    goto fail
  )
)

echo Uzak adres:
git remote get-url origin
echo.

echo GitHub okunuyor...
git fetch origin main
if errorlevel 1 (
  echo HATA: GitHub alinamadi. Internet ve oturum bilgilerini kontrol edin.
  goto fail
)

rem Ilk baglantida dosyalar henuz takipsizdir. Once indekse alinir,
rem sonra kod esitlenir. data ve .env takipsiz kaldigi icin durur.
git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 (
  echo.
  echo Ilk baglanti: mevcut klasor isaretleniyor...
  git reset origin/main
  if errorlevel 1 (
    echo HATA: Depo isaretlenemedi.
    goto fail
  )
)

for /f %%i in ('git rev-parse --short HEAD') do set "BEFORE=%%i"
for /f %%i in ('git rev-parse --short origin/main') do set "REMOTE=%%i"

echo Yerel surum : %BEFORE%
echo GitHub surum: %REMOTE%
echo.

echo Kod esitleniyor...
git reset --hard origin/main
if errorlevel 1 (
  echo HATA: Dosyalar esitlenemedi.
  goto fail
)

git branch --set-upstream-to=origin/main main
if errorlevel 1 (
  echo HATA: main dali origin/main ile eslestirilemedi.
  goto fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo UYARI: npm bulunamadi. Kod guncellendi, paketler yuklenmedi.
  goto done
)

echo.
echo Paketler kuruluyor...
if exist package-lock.json (
  call npm ci --omit=dev
) else (
  call npm install --omit=dev
)
if errorlevel 1 (
  echo HATA: Paket kurulumu basarisiz. Kod guncellendi, paketler eksik kaldi.
  goto fail
)

:done
echo.
echo Guncelleme bitti. %BEFORE% -^> %REMOTE%
echo Sunucuyu elle yeniden acin: npm start
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
