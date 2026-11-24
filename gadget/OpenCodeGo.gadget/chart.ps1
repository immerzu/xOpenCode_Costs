# chart.ps1 - zeichnet den Stundenverbrauch als PNG fuer das Gadget OpenCodeGo.
# Quelle: https://opencode.ai/console/api/usage/cost-by-day (bucket=hour, ab lokaler Mitternacht)
# Ausgabe: src\chartA.png und src\chartB.png (abwechselnd angezeigt, damit die Sidebar
#          nicht die alte Bildfassung aus dem Cache nimmt) sowie src\chart.json mit den Summen.
param(
    [string]$GadgetDir = $PSScriptRoot
)

$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing

$ORG = 'org_01M849G7ER2E5P3E2B1B50D965'
$USER = 'user_01M849G7EBBXN0053BANANF5GH'
$KEYFILE = Join-Path $env:USERPROFILE '.config\opencode\go-usage.key'
$W = 120; $H = 18; $BASE = 16; $MAXBAR = 14; $START = 6; $END = 20; $PITCH = 8; $BARW = 5

$key = (Get-Content -Raw $KEYFILE).Trim()
if (-not $key) { exit 1 }

$midnight = (Get-Date).Date
$since = $midnight.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.000Z")
$url = "https://opencode.ai/console/api/usage/cost-by-day?range=24h&bucket=hour&since=$([uri]::EscapeDataString($since))&userId=$USER&includeLegacyKeys=true"

$headers = @{ Authorization = "Bearer $key"; Accept = 'application/json'; 'User-Agent' = 'opencode-chart/1.0'; 'x-org-id' = $ORG }
$resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 20
if ($resp.StatusCode -ne 200) { exit 1 }
$rows = $resp.Content | ConvertFrom-Json

$cost = New-Object double[] 24
foreach ($r in $rows) {
    $t = [datetime]::Parse($r.date).ToLocalTime()
    $cost[$t.Hour] += [double]$r.totalCostMicroCents / 100000000
}

$max = ($cost | Measure-Object -Maximum).Maximum
$sum = ($cost | Measure-Object -Sum).Sum
$maxHour = -1; $maxVal = 0
for ($i = 0; $i -lt 24; $i++) { if ($cost[$i] -gt $maxVal) { $maxVal = $cost[$i]; $maxHour = $i } }

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

$barBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 200, 200, 200))
$linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 74, 74, 74), 1)

$g.DrawLine($linePen, 0, $BASE, ($W - 1), $BASE)


for ($i = $START; $i -le $END; $i++) {
    if ($max -le 0) { break }
    $v = $cost[$i]
    if ($v -le 0) { continue }
    $bh = [int][math]::Round($v / $max * $MAXBAR)
    if ($bh -lt 2) { $bh = 2 }
    $x = ($i - $START) * $PITCH + 1
    $g.FillRectangle($barBrush, $x, ($BASE - $bh), $BARW, $bh)
}

$g.Dispose()
$dirA = Join-Path $GadgetDir 'src'
$bmp.Save((Join-Path $dirA 'chartA.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save((Join-Path $dirA 'chartB.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$hourInfo = @()
for ($i = $START; $i -le $END; $i++) {
    $tok = 0; $req = 0
    foreach ($r in $rows) {
        $lt = [datetime]::Parse($r.date).ToLocalTime()
        if ($lt.Hour -eq $i) { $tok += [long]$r.totalTokens; $req += [long]$r.totalRequests }
    }
    $hourInfo += [pscustomobject]@{ h = $i; c = [math]::Round($cost[$i], 3); t = $tok; r = $req }
}
$json = @{ sum = [math]::Round($sum, 2); max = [math]::Round($maxVal, 2); maxHour = $maxHour; hours = $hourInfo } | ConvertTo-Json -Compress -Depth 4
[System.IO.File]::WriteAllText((Join-Path $dirA 'chart.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
exit 0
