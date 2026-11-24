# make-backgrounds.ps1 - erzeugt die Hintergrundbilder des OpenCodeGo-Gadgets.
# Groesse, Fuell- und Randfarbe je Zustand; Eckenradius wie im Original (6 px).
# Aufruf: powershell -NoProfile -File make-backgrounds.ps1 -Width 130 -Height 98 -Out <src-Ordner>
param(
    [int]$Width = 130,
    [int]$Height = 98,
    [int]$Radius = 6,
    [string]$Out = (Join-Path $PSScriptRoot 'src')
)

Add-Type -AssemblyName System.Drawing

function New-Panel {
    param([int]$w, [int]$h, [string]$fill, [string]$border, [string]$file)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Aussenflaeche in Randfarbe, darueber die Fuellung um 1 px eingerueckt -
    # so bleibt eine gleichmaessige 1-px-Kante, auch an den Ecken.
    $outer = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $Radius * 2
    $o = New-Object System.Drawing.RectangleF(0.5, 0.5, ($w - 1.5), ($h - 1.5))
    $outer.AddArc($o.X, $o.Y, $d, $d, 180, 90)
    $outer.AddArc(($o.Right - $d), $o.Y, $d, $d, 270, 90)
    $outer.AddArc(($o.Right - $d), ($o.Bottom - $d), $d, $d, 0, 90)
    $outer.AddArc($o.X, ($o.Bottom - $d), $d, $d, 90, 90)
    $outer.CloseFigure()

    $inner = New-Object System.Drawing.Drawing2D.GraphicsPath
    $di = ($Radius - 1) * 2
    $i = New-Object System.Drawing.RectangleF(1.5, 1.5, ($w - 3.5), ($h - 3.5))
    $inner.AddArc($i.X, $i.Y, $di, $di, 180, 90)
    $inner.AddArc(($i.Right - $di), $i.Y, $di, $di, 270, 90)
    $inner.AddArc(($i.Right - $di), ($i.Bottom - $di), $di, $di, 0, 90)
    $inner.AddArc($i.X, ($i.Bottom - $di), $di, $di, 90, 90)
    $inner.CloseFigure()

    $brushOuter = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($border))
    $g.FillPath($brushOuter, $outer)
    $brushInner = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($fill))
    $g.FillPath($brushInner, $inner)

    $g.Dispose()
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output ("{0}  {1}x{2}  Fuellung {3}  Rand {4}" -f (Split-Path $file -Leaf), $w, $h, $fill, $border)
}

New-Panel -w $Width -h $Height -fill '#2E2E2E' -border '#454545' -file (Join-Path $Out 'background.png')
New-Panel -w $Width -h $Height -fill '#3A2F1E' -border '#8A6A2F' -file (Join-Path $Out 'background_warn.png')
New-Panel -w $Width -h $Height -fill '#3A1F1F' -border '#8A2F2F' -file (Join-Path $Out 'background_alert.png')
