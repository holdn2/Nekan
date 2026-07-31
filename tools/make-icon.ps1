# Generates build\icon.ico (multi-size) for the app / taskbar.
# Run:  powershell -ExecutionPolicy Bypass -File tools\make-icon.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'build'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$icoPath = Join-Path $outDir 'icon.ico'

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# --- master 256x256 -----------------------------------------------------
$S = 256
$master = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($master)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

# cream plate
$plate = New-RoundedPath 6 6 ($S - 12) ($S - 12) 44
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#FAF9F5'))), $plate)
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#DED9C9')), 4
$g.DrawPath($pen, $plate)

# 2x2 quadrants
$colors = @('#C85A4D', '#4A72B8', '#C1892C', '#8D887D')
$pad = 34.0
$gap = 14.0
$cell = ($S - ($pad * 2) - $gap) / 2
$i = 0
foreach ($row in 0, 1) {
  foreach ($col in 0, 1) {
    $x = $pad + $col * ($cell + $gap)
    $y = $pad + $row * ($cell + $gap)
    $cellPath = New-RoundedPath $x $y $cell $cell 16
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($colors[$i]))
    $g.FillPath($brush, $cellPath)
    $brush.Dispose(); $cellPath.Dispose()
    $i++
  }
}
$g.Dispose()

# --- write multi-size .ico (PNG-compressed entries) ----------------------
$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$blobs = @()
foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $gg = [System.Drawing.Graphics]::FromImage($bmp)
  $gg.InterpolationMode = 'HighQualityBicubic'
  $gg.PixelOffsetMode = 'HighQuality'
  $gg.SmoothingMode = 'AntiAlias'
  $gg.Clear([System.Drawing.Color]::Transparent)
  $gg.DrawImage($master, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $gg.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $blobs += , @{ size = $size; bytes = $ms.ToArray() }
  $ms.Dispose(); $bmp.Dispose()
}

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0)              # reserved
$bw.Write([UInt16]1)              # type: icon
$bw.Write([UInt16]$blobs.Count)

$offset = 6 + (16 * $blobs.Count)
foreach ($b in $blobs) {
  $dim = if ($b.size -ge 256) { 0 } else { $b.size }
  $bw.Write([Byte]$dim)           # width
  $bw.Write([Byte]$dim)           # height
  $bw.Write([Byte]0)              # palette
  $bw.Write([Byte]0)              # reserved
  $bw.Write([UInt16]1)            # color planes
  $bw.Write([UInt16]32)           # bits per pixel
  $bw.Write([UInt32]$b.bytes.Length)
  $bw.Write([UInt32]$offset)
  $offset += $b.bytes.Length
}
foreach ($b in $blobs) { $bw.Write($b.bytes) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()

# 256px PNG kept for docs / other platforms
$master.Save((Join-Path $outDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()

# copy into src so the window icon and the in-app title bar logo match the exe icon
$assets = Join-Path $root 'src\assets'
if (-not (Test-Path $assets)) { New-Item -ItemType Directory -Path $assets | Out-Null }
Copy-Item $icoPath (Join-Path $assets 'icon.ico') -Force
Copy-Item (Join-Path $outDir 'icon.png') (Join-Path $assets 'icon.png') -Force

Write-Output "wrote $icoPath ($((Get-Item $icoPath).Length) bytes)"
