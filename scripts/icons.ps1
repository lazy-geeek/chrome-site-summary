$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'icons'
New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
foreach ($size in @(16, 48, 128)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::FromArgb(40, 94, 73))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(250, 247, 234), [single]($size * 0.07))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    foreach ($line in @(@(0.25, 0.31, 0.75), @(0.25, 0.5, 0.64), @(0.25, 0.69, 0.49))) {
        $graphics.DrawLine($pen, [single]($line[0] * $size), [single]($line[1] * $size), [single]($line[2] * $size), [single]($line[1] * $size))
    }
    $bitmap.Save((Join-Path $iconDir "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
