$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Push-Location $projectDir
try {
    New-Item -ItemType Directory -Path 'dist' -Force | Out-Null
    $extensionFiles = @('manifest.json', 'background.js', 'settings.js', 'cache.js', 'extract.js', 'openrouter.js', 'render.js', 'sidepanel.html', 'sidepanel.js', 'options.html', 'options.js', 'styles.css', 'icons')
    Compress-Archive -LiteralPath $extensionFiles -DestinationPath 'dist/chrome-site-summary.zip' -Force
    Write-Output (Join-Path $projectDir 'dist/chrome-site-summary.zip')
} finally {
    Pop-Location
}
