# Run this once to configure Firebase Hosting for Research Reader.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\setup-firebase.ps1
$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n$msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "OK  $msg" -ForegroundColor Green }
function Write-Note($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

Write-Host "`n=== Research Reader - Firebase Hosting Setup ===" -ForegroundColor Green

# -- 1. Install firebase-tools ---------------------------------------------------
Write-Step "Step 1: Check firebase-tools"
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "    Installing firebase-tools globally..."
    npm install -g firebase-tools
} else {
    $v = firebase --version
    Write-Ok "firebase-tools $v already installed"
}

# -- 2. Authenticate -------------------------------------------------------------
Write-Step "Step 2: Log in to Firebase (a browser window will open)"
firebase login

# -- 3. Select or create project -------------------------------------------------
Write-Step "Step 3: Select a Firebase / GCP project"
Write-Host "`nYour existing projects:"
firebase projects:list

Write-Host ""
Write-Note "a) Use an existing project (recommended - reuse your backend GCP project)"
Write-Note "b) Create a new project"
$choice = Read-Host "`nChoice [a/b]"

if ($choice -eq 'b') {
    $projectId = Read-Host "New project ID (lowercase, hyphens OK)"
    firebase projects:create $projectId
} else {
    $projectId = Read-Host "Project ID to use"
}

# -- 4. Write .firebaserc --------------------------------------------------------
@"
{
  "projects": {
    "default": "$projectId"
  }
}
"@ | Set-Content .firebaserc -Encoding utf8
Write-Ok ".firebaserc updated (project: $projectId)"

# -- 5. Select project in CLI ----------------------------------------------------
firebase use $projectId

# -- 6. First deploy -------------------------------------------------------------
Write-Step "Step 4: Building and doing an initial deploy to activate Hosting..."
npm run build
firebase deploy --only hosting

Write-Ok "Hosting live at: https://$projectId.web.app/rr.html"

# -- 7. Generate CI token --------------------------------------------------------
Write-Step "Step 5: Generate a CI token for GitHub Actions"
Write-Note "Copy the token printed below and add it to your GitHub repo:"
Write-Note "  Repo -> Settings -> Secrets and variables -> Actions -> New repository secret"
Write-Note "  Name:  FIREBASE_TOKEN"
Write-Note "  Value: <the token printed below>"
Write-Host ""
firebase login:ci

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Note "Commit .firebaserc, then push to main - the GitHub Action deploys automatically."
