# VibePrompt Setup Script for Windows
# Run with: powershell -ExecutionPolicy Bypass -File vibeprompt-setup.ps1
# Requires: Node.js 18+ installed

param(
    [switch]$SkipNode,
    [switch]$SkipNpm,
    [switch]$SkipExtract
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ============================================================
# HELPERS
# ============================================================

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "  $("-" * $Text.Length)" -ForegroundColor DarkCyan
}

function Write-OK {
    param([string]$Text)
    Write-Host "  [OK] $Text" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Text)
    Write-Host "  [FAIL] $Text" -ForegroundColor Red
}

function Write-Info {
    param([string]$Text)
    Write-Host "  [..] $Text" -ForegroundColor Yellow
}

function Write-Step {
    param([string]$Text)
    Write-Host "  --> $Text" -ForegroundColor White
}

function Write-Banner {
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Magenta
    Write-Host "   VibePrompt - Instagram AI Prompt Generator" -ForegroundColor Magenta
    Write-Host "   Windows Setup Script v2.0                 " -ForegroundColor Magenta
    Write-Host "  ============================================" -ForegroundColor Magenta
    Write-Host ""
}

# ============================================================
# FIND FILES
# ============================================================

function Find-ZipFile {
    $candidates = @(
        (Join-Path $ScriptDir "vibeprompt-v2-grounded.zip"),
        (Join-Path $ScriptDir "vibeprompt.zip"),
        (Join-Path $ScriptDir "vibeprompt-v2.zip")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    # Search one level up
    $parent = Split-Path -Parent $ScriptDir
    foreach ($name in @("vibeprompt-v2-grounded.zip","vibeprompt.zip")) {
        $p = Join-Path $parent $name
        if (Test-Path $p) { return $p }
    }
    return $null
}

# ============================================================
# CHECK NODE.JS
# ============================================================

function Test-Node {
    Write-Header "Checking Node.js"
    try {
        $ver = node --version 2>&1
        if ($LASTEXITCODE -ne 0) { throw "node not found" }
        Write-OK "Node.js found: $ver"

        # Check version >= 18
        $num = [int]($ver -replace 'v(\d+)\..*','$1')
        if ($num -lt 18) {
            Write-Fail "Node.js version $ver is too old. Need v18 or newer."
            Write-Info "Download from: https://nodejs.org"
            exit 1
        }
        return $true
    }
    catch {
        Write-Fail "Node.js not found."
        Write-Info "Please install Node.js 18+ from: https://nodejs.org"
        Write-Info "Then re-run this script."
        exit 1
    }
}

# ============================================================
# EXTRACT ZIP
# ============================================================

function Expand-VibePrompt {
    Write-Header "Extracting Files"

    $zipPath = Find-ZipFile
    if (-not $zipPath) {
        Write-Fail "No vibeprompt zip file found in: $ScriptDir"
        Write-Info "Make sure vibeprompt-v2-grounded.zip is in the same folder as this script."
        exit 1
    }

    Write-Step "Found zip: $(Split-Path -Leaf $zipPath)"

    $destDir = Join-Path $ScriptDir "vibeprompt"

    if (Test-Path $destDir) {
        Write-Info "vibeprompt folder already exists - skipping extraction"
        Write-Info "(Delete the vibeprompt folder and re-run to force re-extract)"
    } else {
        Write-Step "Extracting to: $destDir"
        try {
            Expand-Archive -Path $zipPath -DestinationPath $ScriptDir -Force
            Write-OK "Extracted successfully"
        }
        catch {
            Write-Fail "Extraction failed: $_"
            Write-Info "Try manually extracting the zip file."
            exit 1
        }
    }

    return $destDir
}

# ============================================================
# INSTALL NPM PACKAGES
# ============================================================

function Install-NpmPackages {
    param([string]$BackendDir)
    Write-Header "Installing Backend Dependencies"

    if (-not (Test-Path $BackendDir)) {
        Write-Fail "Backend directory not found: $BackendDir"
        exit 1
    }

    Write-Step "Running npm install in: $BackendDir"
    Push-Location $BackendDir
    try {
        npm install 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Write-OK "npm install complete"
    }
    catch {
        Write-Fail "npm install failed: $_"
        Pop-Location
        exit 1
    }
    Pop-Location
}

# ============================================================
# CREATE .ENV
# ============================================================

function Create-EnvFile {
    param([string]$BackendDir)
    Write-Header "Environment Configuration"

    $envPath     = Join-Path $BackendDir ".env"
    $examplePath = Join-Path $BackendDir ".env.example"

    if (Test-Path $envPath) {
        Write-OK ".env already exists - skipping (your settings are preserved)"
    } else {
        if (Test-Path $examplePath) {
            Write-Step "Creating .env from template..."
            Copy-Item $examplePath $envPath
            Write-OK ".env created"
        } else {
            Write-Step "Creating .env from scratch..."
            @"
# VibePrompt Backend Configuration
PORT=3000

# Add your Anthropic API key for real Claude Vision analysis:
# ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
"@ | Set-Content $envPath -Encoding UTF8
            Write-OK ".env created"
        }
    }
}

# ============================================================
# CONFIGURE API KEY
# ============================================================

function Set-ApiKey {
    param([string]$BackendDir)
    Write-Header "Anthropic API Key Setup"

    $envPath = Join-Path $BackendDir ".env"

    Write-Host ""
    Write-Host "  VibePrompt needs a Claude API key for real image analysis." -ForegroundColor White
    Write-Host "  Get one free at: https://console.anthropic.com" -ForegroundColor Cyan
    Write-Host ""

    $current = Get-Content $envPath -Raw 2>$null
    $hasKey  = $current -match "ANTHROPIC_API_KEY=sk-ant-"

    if ($hasKey) {
        Write-OK "API key already configured in .env"
        return
    }

    $apiKey = Read-Host "  Enter your Anthropic API key (or press Enter to skip)"

    if ($apiKey -and $apiKey.StartsWith("sk-")) {
        # Add/replace in .env
        if ($current -match "# ANTHROPIC_API_KEY=") {
            $updated = $current -replace "# ANTHROPIC_API_KEY=.*", "ANTHROPIC_API_KEY=$apiKey"
        } elseif ($current -match "ANTHROPIC_API_KEY=") {
            $updated = $current -replace "ANTHROPIC_API_KEY=.*", "ANTHROPIC_API_KEY=$apiKey"
        } else {
            $updated = $current + "`nANTHROPIC_API_KEY=$apiKey`n"
        }
        Set-Content $envPath $updated -Encoding UTF8
        Write-OK "API key saved to .env"
    } else {
        Write-Info "Skipped - you can add it later to backend\.env"
        Write-Info "Line to add:  ANTHROPIC_API_KEY=sk-ant-api03-..."
    }
}

# ============================================================
# CHECK FFMPEG
# ============================================================

function Test-FFmpeg {
    Write-Header "Checking ffmpeg"
    try {
        $null = ffmpeg -version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-OK "ffmpeg found"
            return $true
        }
    } catch {}

    Write-Info "ffmpeg not found (optional but recommended for video Reels)"
    Write-Host ""
    Write-Host "  To install ffmpeg on Windows:" -ForegroundColor White
    Write-Host "    Option 1 (winget):  winget install ffmpeg" -ForegroundColor Cyan
    Write-Host "    Option 2 (choco):   choco install ffmpeg" -ForegroundColor Cyan
    Write-Host "    Option 3 (manual):  https://ffmpeg.org/download.html" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Without ffmpeg: Video Reels won't work, but Posts and Stories still will." -ForegroundColor Yellow
    Write-Host ""
    return $false
}

# ============================================================
# CREATE LAUNCHER SCRIPTS
# ============================================================

function Create-Launchers {
    param([string]$BackendDir)
    Write-Header "Creating Launcher Scripts"

    # start-server.bat
    $batPath = Join-Path $ScriptDir "start-vibeprompt.bat"
    @"
@echo off
title VibePrompt Backend Server
echo.
echo  ============================================
echo   VibePrompt Backend Server
echo  ============================================
echo.
cd /d "$BackendDir"
node server.js
pause
"@ | Set-Content $batPath -Encoding ASCII
    Write-OK "Created: start-vibeprompt.bat"

    # start-server.ps1
    $ps1Path = Join-Path $ScriptDir "start-vibeprompt.ps1"
    @"
# VibePrompt - Start Backend Server
Set-Location "$BackendDir"
Write-Host "Starting VibePrompt backend server..." -ForegroundColor Cyan
node server.js
"@ | Set-Content $ps1Path -Encoding UTF8
    Write-OK "Created: start-vibeprompt.ps1"
}

# ============================================================
# PRINT FINAL INSTRUCTIONS
# ============================================================

function Write-FinalInstructions {
    param([string]$BackendDir, [string]$ExtensionDir)

    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "   Setup Complete!" -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""

    Write-Host "  STEP 1 - Start the backend server:" -ForegroundColor Cyan
    Write-Host "    Double-click: start-vibeprompt.bat" -ForegroundColor White
    Write-Host "    OR run:  cd `"$BackendDir`" && node server.js" -ForegroundColor White
    Write-Host ""

    Write-Host "  STEP 2 - Verify server is running:" -ForegroundColor Cyan
    Write-Host "    Open browser: http://localhost:3000/health" -ForegroundColor White
    Write-Host "    You should see: {`"status`":`"ok`"...}" -ForegroundColor DarkGray
    Write-Host ""

    Write-Host "  STEP 3 - Load the Chrome Extension:" -ForegroundColor Cyan
    Write-Host "    1. Open Chrome and go to: chrome://extensions" -ForegroundColor White
    Write-Host "    2. Enable 'Developer mode' (top-right toggle)" -ForegroundColor White
    Write-Host "    3. Click 'Load unpacked'" -ForegroundColor White
    Write-Host "    4. Select this folder: $ExtensionDir" -ForegroundColor White
    Write-Host ""

    Write-Host "  STEP 4 - Use VibePrompt:" -ForegroundColor Cyan
    Write-Host "    1. Go to instagram.com" -ForegroundColor White
    Write-Host "    2. Open any Reel, Post, or Story" -ForegroundColor White
    Write-Host "    3. Click the [*] Get Prompt button" -ForegroundColor White
    Write-Host ""

    Write-Host "  TROUBLESHOOTING:" -ForegroundColor Yellow
    Write-Host "    - Server logs show full pipeline debug per request" -ForegroundColor DarkGray
    Write-Host "    - The overlay debug panel shows Stage 1 raw image analysis" -ForegroundColor DarkGray
    Write-Host "    - API key goes in: $BackendDir\.env" -ForegroundColor DarkGray
    Write-Host ""
}

# ============================================================
# MAIN
# ============================================================

Write-Banner

# 1. Check Node
if (-not $SkipNode) { Test-Node }

# 2. Extract zip
$vibeDir     = Expand-VibePrompt
$backendDir  = Join-Path $vibeDir "backend"
$extDir      = Join-Path $vibeDir "extension"

# 3. Install packages
if (-not $SkipNpm) { Install-NpmPackages -BackendDir $backendDir }

# 4. Create .env
Create-EnvFile -BackendDir $backendDir

# 5. Configure API key
Set-ApiKey -BackendDir $backendDir

# 6. Check ffmpeg
Test-FFmpeg

# 7. Create launchers
Create-Launchers -BackendDir $backendDir

# 8. Final instructions
Write-FinalInstructions -BackendDir $backendDir -ExtensionDir $extDir

Write-Host "  Press any key to exit..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
