$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..")
Set-Location $Root

# Legacy filename is retained for convenience. All startup is now handled by
# the independent Studio launcher; no VibeX/RunningHub auth or browser redirect.
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Run pnpm standalone:init after installing Node.js."
}
& node (Join-Path $Root "ops/standalone-dev.mjs")
if ($LASTEXITCODE -ne 0) {
  throw ("Agent Studio standalone launcher failed (exit " + $LASTEXITCODE + ").")
}
