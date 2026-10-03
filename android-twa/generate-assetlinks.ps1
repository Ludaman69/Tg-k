# Скрипт генерации Digital Asset Links (assetlinks.json)
#
# Использование:
#   1. Сначала создайте keystore (если ещё нет):
#      keytool -genkey -v -keystore bkonekte-release.keystore `
#          -alias bkonekte -keyalg RSA -keysize 2048 -validity 10000 `
#          -storepass android -keypass android
#
#   2. Запустите этот скрипт:
#      .\generate-assetlinks.ps1

param(
    [string]$KeystorePath = "bkonekte-release.keystore",
    [string]$KeystorePassword = "android",
    [string]$KeyAlias = "bkonekte",
    [string]$PackageName = "com.bkonekte.app",
    [string]$OutputFile = "assetlinks.json"
)

# Проверяем, существует ли keystore
if (-not (Test-Path $KeystorePath)) {
    Write-Warning "Keystore '$KeystorePath' не найден."
    Write-Warning "Создаём новый keystore..."
    
    keytool -genkey -v -keystore $KeystorePath `
        -alias $KeyAlias -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $KeystorePassword -keypass $KeystorePassword `
        -dname "CN=Bkonekte, OU=Development, O=Bkonekte, L=Moscow, ST=RU, C=RU"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Не удалось создать keystore. Убедитесь, что Java JDK установлен."
        exit 1
    }
    Write-Host "Keystore создан: $KeystorePath"
}

# Получаем SHA256 отпечаток из keystore
Write-Host "Получаем SHA256 fingerprint из keystore..."
$output = keytool -list -v -keystore $KeystorePath -alias $KeyAlias -storepass $KeystorePassword 2>&1

$sha256Match = $output | Select-String "SHA256:" | ForEach-Object { 
    ($_ -split "SHA256:")[1].Trim() -replace ":", "" 
}

if (-not $sha256Match) {
    Write-Error "Не удалось извлечь SHA256 fingerprint. Проверьте keystore."
    exit 1
}

$sha256Fingerprint = $sha256Match

Write-Host "SHA256 Fingerprint: $sha256Fingerprint"

# Генерируем assetlinks.json
$assetLinks = @(
    @{
        relation = @(
            "delegate_permission/common.handle_all_urls",
            "delegate_permission/common.use_as_origin"
        )
        target = @{
            namespace = "android_app"
            package_name = $PackageName
            sha256_cert_fingerprints = @($sha256Fingerprint)
        }
    }
)

$json = $assetLinks | ConvertTo-Json -Depth 10
$json | Out-File -FilePath $OutputFile -Encoding utf8

Write-Host "`n✅ assetlinks.json создан: $OutputFile"
Write-Host "`
`
📌 Разместите этот файл на вашем сервере по адресу:"
Write-Host "   https://tg-k.ru/.well-known/assetlinks.json"
Write-Host "`
📌 Убедитесь, что файл доступен по HTTPS и имеет Content-Type: application/json"