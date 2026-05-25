$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Src = Join-Path $Root "sistema"
$Log = Join-Path $Root "vitoriaregia_v93_publicacao_windows.log"
function Info($m){ Write-Host "▶ $m"; Add-Content $Log "▶ $m" }
function Fail($m){ Write-Host "ERRO: $m" -ForegroundColor Red; Add-Content $Log "ERRO: $m"; exit 1 }
Set-Content $Log "===== Publicador Vitória Régia Pro v9.4 - Windows ====="
if (!(Get-Command git -ErrorAction SilentlyContinue)) { Fail "git não encontrado" }
if (!(Test-Path (Join-Path $Src "package.json"))) { Fail "não encontrei sistema/package.json" }
$RepoUrl = Read-Host "URL do repositório GitHub [https://github.com/bmedeiros1987/vitoriaregia1.git]"
if (!$RepoUrl) { $RepoUrl = "https://github.com/bmedeiros1987/vitoriaregia1.git" }
$Branch = Read-Host "Branch [main]"
if (!$Branch) { $Branch = "main" }
$GitName = Read-Host "Nome do autor do commit [Bruno Saraiva]"
if (!$GitName) { $GitName = "Bruno Saraiva" }
$GitEmail = Read-Host "E-mail do autor do commit [bmedeiros1987@gmail.com]"
if (!$GitEmail) { $GitEmail = "bmedeiros1987@gmail.com" }
$TokenSecure = Read-Host "Cole o token temporário do GitHub" -AsSecureString
$Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($TokenSecure))
if (!$Token) { Fail "token vazio" }
$AuthBytes = [Text.Encoding]::ASCII.GetBytes("x-access-token:$Token")
$Auth = [Convert]::ToBase64String($AuthBytes)
$Work = Join-Path $env:TEMP ("vitoriaregia_v93_" + (Get-Date -Format yyyyMMdd_HHmmss))
$Repo = Join-Path $Work "repo"
New-Item -ItemType Directory -Path $Work | Out-Null
Info "Clonando repositório"
git -c "http.extraheader=AUTHORIZATION: basic $Auth" clone --branch $Branch --single-branch $RepoUrl $Repo 2>&1 | Add-Content $Log
if ($LASTEXITCODE -ne 0) { Fail "falha ao clonar" }
Info "Limpando e copiando sistema"
Get-ChildItem $Repo -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
Get-ChildItem $Src -Force | Copy-Item -Destination $Repo -Recurse -Force
Info "Removendo arquivos sensíveis"
@(".env","server/.env","client/.env",".env.local","server/.env.local","client/.env.local","package-lock.json","server/package-lock.json","client/package-lock.json") | ForEach-Object { $p=Join-Path $Repo $_; if(Test-Path $p){Remove-Item $p -Force} }
$pathsToRemove = @("server/public","client/dist","dist","build",".cache","coverage","client/.vite","server/.vite")
foreach($rel in $pathsToRemove){ $p=Join-Path $Repo $rel; if(Test-Path $p){ Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue } }
Get-ChildItem $Repo -Recurse -Force -Directory | Where-Object { $_.Name -in @("node_modules","dist","build",".cache","coverage",".vite") } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $Repo -Recurse -Force -File | Where-Object { $_.Name -match "\.(log|pem|key|crt|p12|pfx|jks|keystore)$" } | Remove-Item -Force -ErrorAction SilentlyContinue
Set-Content (Join-Path $Repo ".gitignore") @"
node_modules/
**/node_modules/
server/public/
client/dist/
dist/
build/
.cache/
coverage/
.vite/
.env
.env.*
!.env.example
server/.env
server/.env.*
client/.env
client/.env.*
*.pem
*.key
*.crt
*.p12
*.pfx
*.jks
*.keystore
*.log
.DS_Store
Thumbs.db
.vscode/
.idea/
*.sqlite
*.sqlite3
*.db
backup-*.json
"@
Set-Location $Repo
git config user.name $GitName
git config user.email $GitEmail
git add -A
$Staged = git diff --cached --name-only --diff-filter=ACMR
if (!$Staged) { Write-Host "Nenhuma alteração nova para publicar."; exit 0 }
foreach($f in $Staged){
  if($f -match "(^|/)(node_modules|dist|build|\.cache|coverage|\.vite)(/|$)"){ Fail "commit bloqueado por artefato: $f" }
  if($f -match "(^|/)server/public(/|$)"){ Fail "commit bloqueado por build público do servidor: $f" }
  if($f -match "(^|/)\.env($|\.)" -and $f -notmatch "(^|/)\.env\.example$"){ Fail "commit bloqueado por .env: $f" }
}
Info "Criando commit"
git commit -m "Publica Vitória Régia Pro v9.4 com migração segura do banco legado e central de atualizações" 2>&1 | Add-Content $Log
Info "Enviando para GitHub"
git -c "http.extraheader=AUTHORIZATION: basic $Auth" push origin "HEAD:$Branch" 2>&1 | Add-Content $Log
if ($LASTEXITCODE -ne 0) { Fail "push não concluído" }
Write-Host "OK: GitHub atualizado. Agora no Render: Manual Deploy -> Clear build cache & deploy" -ForegroundColor Green
