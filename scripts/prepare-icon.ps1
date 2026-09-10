param([string]$InputPath = "public/karta-logo.png", [string]$OutputPath = "public/karta-logo.png")
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::new([string](Resolve-Path $InputPath))
$cutout = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$left = $source.Width; $right = 0; $top = $source.Height; $bottom = 0

# Locate each real edge of the teal symbol. The warm paper/background never
# satisfies this green-channel relation, while even the pale teal highlight does.
for ($y = 0; $y -lt $source.Height; $y++) {
  $green = [bool[]]::new($source.Width)
  for ($x = 0; $x -lt $source.Width; $x++) {
    $color = $source.GetPixel($x, $y)
    if (($color.G - $color.R) -gt 5 -and ($color.G - $color.B) -gt 2 -and (($color.R + $color.G + $color.B) / 3) -lt 238) {
      $green[$x] = $true
    }
  }
  $rowLeft = $source.Width; $rowRight = -1
  for ($x = 0; $x -le $source.Width - 8; $x++) {
    $matches = 0; for ($offset = 0; $offset -lt 8; $offset++) { if ($green[$x + $offset]) { $matches++ } }
    if ($matches -ge 6) { $rowLeft = $x; break }
  }
  for ($x = $source.Width - 1; $x -ge 7; $x--) {
    $matches = 0; for ($offset = 0; $offset -lt 8; $offset++) { if ($green[$x - $offset]) { $matches++ } }
    if ($matches -ge 6) { $rowRight = $x; break }
  }
  if ($rowRight -lt 0) { continue }
  $left = [Math]::Min($left, $rowLeft); $right = [Math]::Max($right, $rowRight)
  $top = [Math]::Min($top, $y); $bottom = [Math]::Max($bottom, $y)
  for ($x = $rowLeft; $x -le $rowRight; $x++) {
    $color = $source.GetPixel($x, $y)
    $distance = [Math]::Min($x - $rowLeft, $rowRight - $x)
    if ($distance -lt 2) {
      $sampleX = if (($x - $rowLeft) -lt ($rowRight - $x)) { [Math]::Min($rowLeft + 3, $rowRight) } else { [Math]::Max($rowRight - 3, $rowLeft) }
      $color = $source.GetPixel($sampleX, $y)
    }
    $alpha = if ($distance -eq 0) { 96 } elseif ($distance -eq 1) { 196 } else { 255 }
    $cutout.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
  }
}
$source.Dispose()

$canvasSize = 1024; $targetLimit = [int]($canvasSize * 0.89)
$visibleWidth = $right - $left + 1; $visibleHeight = $bottom - $top + 1
$scale = [Math]::Min($targetLimit / $visibleWidth, $targetLimit / $visibleHeight)
$drawWidth = [int]($visibleWidth * $scale); $drawHeight = [int]($visibleHeight * $scale)
$destination = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($destination)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$target = [System.Drawing.Rectangle]::new([int](($canvasSize - $drawWidth) / 2), [int](($canvasSize - $drawHeight) / 2), $drawWidth, $drawHeight)
$crop = [System.Drawing.Rectangle]::new($left, $top, $visibleWidth, $visibleHeight)
$graphics.DrawImage($cutout, $target, $crop, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.Dispose(); $cutout.Dispose()
$destination.Save((Join-Path (Get-Location) $OutputPath), [System.Drawing.Imaging.ImageFormat]::Png)
$destination.Dispose()
