# Generates the app icons from one drawing: build\icon.ico (multi-size, Windows),
# build\icon.png (the master, what electron-builder converts to .icns for macOS)
# and 256px copies under src\assets for the window and the in-app logo.
#
# Run:  powershell -ExecutionPolicy Bypass -File tools\make-icon.ps1
#
# The master is 1024 because macOS needs it. electron-builder refuses to build a
# mac target from anything under 512x512 -- app-builder-lib's iconConverter
# throws ERR_ICON_TOO_SMALL -- and 1024 is the largest size an .icns carries, so
# rendering it once here is what keeps a hand-made .icns out of the repo.
#
# Nothing is a raster asset: the whole icon is drawn from paths, so the size is
# a parameter rather than a resampling. Every measurement below is written in
# the 256-unit space the design was drawn in and multiplied by $U, which is what
# lets the master move without the proportions moving with it.

param([int]$Size = 1024)

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

# --- master --------------------------------------------------------------
$S = $Size
$U = $S / 256.0   # one unit of the space the measurements below are written in

$master = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($master)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

# cream plate
$plate = New-RoundedPath (6 * $U) (6 * $U) ($S - 12 * $U) ($S - 12 * $U) (44 * $U)
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#FAF9F5'))), $plate)
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#DED9C9')), (4 * $U)
$g.DrawPath($pen, $plate)

# 2x2 quadrants
$colors = @('#C85A4D', '#4A72B8', '#C1892C', '#8D887D')
$pad = 34.0 * $U
$gap = 14.0 * $U
$cell = ($S - ($pad * 2) - $gap) / 2
$i = 0
foreach ($row in 0, 1) {
  foreach ($col in 0, 1) {
    $x = $pad + $col * ($cell + $gap)
    $y = $pad + $row * ($cell + $gap)
    $cellPath = New-RoundedPath $x $y $cell $cell (16 * $U)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($colors[$i]))
    $g.FillPath($brush, $cellPath)
    $brush.Dispose(); $cellPath.Dispose()
    $i++
  }
}
$g.Dispose()

# --- resampler -----------------------------------------------------------
function Save-Scaled([System.Drawing.Bitmap]$src, [int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $gg = [System.Drawing.Graphics]::FromImage($bmp)
  $gg.InterpolationMode = 'HighQualityBicubic'
  $gg.PixelOffsetMode = 'HighQuality'
  $gg.SmoothingMode = 'AntiAlias'
  $gg.Clear([System.Drawing.Color]::Transparent)
  $gg.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $gg.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# --- write multi-size .ico (PNG-compressed entries) ----------------------
# 256 is the ceiling the .ico format carries, so this set does not follow the
# master upwards.
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

# The master, at full size: this is the file electron-builder reads for macOS.
$master.Save((Join-Path $outDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)

# copy into src so the window icon and the in-app title bar logo match the exe
# icon. The logo is drawn at about 20px, so it takes a 256 copy rather than the
# master -- there is no reason to carry a megabyte into the asar for it.
$assets = Join-Path $root 'src\assets'
if (-not (Test-Path $assets)) { New-Item -ItemType Directory -Path $assets | Out-Null }
Copy-Item $icoPath (Join-Path $assets 'icon.ico') -Force
Save-Scaled $master ([Math]::Min(256, $S)) (Join-Path $assets 'icon.png')

$master.Dispose()

Write-Output "wrote $icoPath ($((Get-Item $icoPath).Length) bytes)"
Write-Output "wrote $(Join-Path $outDir 'icon.png') (${S}x${S})"
