# Erzeugt die Grafiken fuer das Gadget OpenCodeGo (130x114 Pille + 32x32 Icon).
param([string]$Ziel = "F:\001_Coding_Projekte\xOpenCode_Costs\gadget\OpenCodeGo.gadget")

Add-Type -AssemblyName System.Drawing

function New-Pille([int]$w, [int]$h, [int]$r, [string]$farbe, [string]$rand, [string]$pfad) {
    $bmp = [System.Drawing.Bitmap]::new($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $d = $r * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc(1, 1, $d, $d, 180, 90)
    $path.AddArc($w - 1 - $d, 1, $d, $d, 270, 90)
    $path.AddArc($w - 1 - $d, $h - 1 - $d, $d, $d, 0, 90)
    $path.AddArc(1, $h - 1 - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($farbe))
    $g.FillPath($brush, $path)
    $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($rand), 1)
    $g.DrawPath($pen, $path)

    $bmp.Save($pfad, [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose(); $brush.Dispose(); $path.Dispose(); $g.Dispose(); $bmp.Dispose()
}

New-Item -ItemType Directory -Force -Path (Join-Path $Ziel 'src') | Out-Null

New-Pille 130 114 14 '#2e2e2e' '#454545' (Join-Path $Ziel 'src\background.png')
New-Pille 130 114 14 '#3a2f1e' '#8a6a2f' (Join-Path $Ziel 'src\background_warn.png')
New-Pille 130 114 14 '#3a1f1f' '#8a2f2f' (Join-Path $Ziel 'src\background_alert.png')
New-Pille 32 32 6 '#2e2e2e' '#454545' (Join-Path $Ziel 'src\icon.png')

# Gruener Punkt ins Icon
$ico = [System.Drawing.Image]::FromFile((Join-Path $Ziel 'src\icon.png'))
$bmpIco = [System.Drawing.Bitmap]::new($ico.Width, $ico.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gIco = [System.Drawing.Graphics]::FromImage($bmpIco)
$gIco.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gIco.DrawImage($ico, 0, 0)
$dot = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#3fbf5f'))
$gIco.FillEllipse($dot, 11, 11, 10, 10)
$bmpIco.Save((Join-Path $Ziel 'src\icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$gIco.Dispose(); $bmpIco.Dispose(); $dot.Dispose(); $ico.Dispose()

Copy-Item (Join-Path $Ziel 'src\background.png') (Join-Path $Ziel 'drag.png') -Force

Get-ChildItem (Join-Path $Ziel 'src') -File |
    Select-Object Name, Length | Format-Table -AutoSize | Out-String -Width 60
