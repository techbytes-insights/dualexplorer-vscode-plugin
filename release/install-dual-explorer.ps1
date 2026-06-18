$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vsix = Join-Path $scriptDir 'dual-explorer-1.3.1.vsix'

if (-not (Test-Path $vsix)) {
    Write-Error "VSIX not found: $vsix"
}

$codeCmd = Get-Command code -ErrorAction SilentlyContinue
if (-not $codeCmd) {
    Write-Error "VS Code CLI ('code') not found in PATH. In VS Code, run: Shell Command: Install 'code' command in PATH"
}

Write-Host "Installing Dual Explorer from: $vsix"
& code --install-extension $vsix --force
if ($LASTEXITCODE -ne 0) {
    Write-Error "Installation failed with exit code $LASTEXITCODE"
}

Write-Host "Installation complete."
