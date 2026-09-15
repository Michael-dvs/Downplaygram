# Downplaygram Automated Installer for Windows
$ErrorActionPreference = "Stop"

function Write-Step ($step, $total, $text) {
    Write-Host "`n[$step/$total] " -ForegroundColor Cyan -NoNewline
    Write-Host $text -ForegroundColor White
}

Clear-Host
Write-Host @"
=====================================================
    DOWNPLAYGRAM - ONE-CLICK INSTALLER
    Zero-Telemetry Instagram Downloader & Viewer
=====================================================
"@ -ForegroundColor Magenta

$repo = "Michael-dvs/Downplaygram"
$targetDir = "$env:LOCALAPPDATA\Downplaygram"
$zipUrl = "https://github.com/$repo/releases/latest/download/downplaygram-chrome.zip"
$tempZip = "$env:TEMP\downplaygram-latest.zip"

try {
    # 1. Unduh Berkas Rilis
    Write-Step 1 4 "Mengunduh paket Downplaygram versi terbaru dari GitHub..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
    Write-Host "  -> Berkas berhasil diunduh ke direktori sementara." -ForegroundColor Green

    # 2. Ekstraksi Berkas
    Write-Step 2 4 "Menyiapkan folder aplikasi di $targetDir..."
    if (Test-Path $targetDir) {
        Remove-Item -Path $targetDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Expand-Archive -Path $tempZip -DestinationPath $targetDir -Force
    Remove-Item -Path $tempZip -Force
    Write-Host "  -> Ekstraksi selesai tanpa kendala." -ForegroundColor Green

    # 3. Buka File Explorer & Chrome Extensions
    Write-Step 3 4 "Membuka pengelola ekstensi browser dan direktori target..."
    Start-Process explorer.exe $targetDir

    # Buka chrome://extensions (coba Chrome, lalu Edge jika Chrome tidak ditemukan)
    if (Get-Command chrome.exe -ErrorAction SilentlyContinue) {
        Start-Process "chrome.exe" "chrome://extensions"
    } elseif (Get-Command msedge.exe -ErrorAction SilentlyContinue) {
        Start-Process "msedge.exe" "edge://extensions"
    } else {
        Start-Process "chrome://extensions"
    }

    # 4. Panduan Akhir Interaktif
    Write-Step 4 4 "Instalasi berkas selesai!"
    Write-Host @"
-----------------------------------------------------
LANGKAH TERAKHIR (Cukup 10 Detik di Browser):
1. Di halaman ekstensi yang baru terbuka, aktifkan toggle:
   [Developer mode] (Pojok kanan atas)
2. Klik tombol:
   [Load unpacked] (Muat ekstensi yang belum dibongkar)
3. Pilih folder yang baru saja dibuka otomatis oleh sistem:
   $targetDir
-----------------------------------------------------
"@ -ForegroundColor Yellow

} catch {
    Write-Host "`n[ERROR] Terjadi kendala selama proses instalasi:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor DarkRed
    Write-Host "`nSilakan unduh manual file .zip dari: https://github.com/$repo/releases" -ForegroundColor Gray
}
