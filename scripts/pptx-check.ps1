# Mở file .pptx bằng PowerPoint (COM, ẩn), đếm slide / hiệu ứng / lần "tới" mỗi slide, đóng. Ra JSON.
# Không chụp màn hình, không chạy trình chiếu.
# Dùng: powershell -File scripts/pptx-check.ps1 -Path "a.pptx|b.pptx"   (nhiều file ngăn bằng dấu |)
# (Hàm trả `, giá trị` để PowerShell không tự trải bộ sưu tập COM thành mảng.)
# Dùng gọi muộn (InvokeMember) vì `$app.Presentations` kiểu thường trả null trên máy này (lỗi QueryInterface 0x80040155).
param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
$BF = [System.Reflection.BindingFlags]
function Get-P($o, $n, $a = $null) { , $o.GetType().InvokeMember($n, $BF::GetProperty, $null, $o, $a) }
function Invoke-M($o, $n, $a = $null) { , $o.GetType().InvokeMember($n, $BF::InvokeMethod, $null, $o, $a) }

$wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
$out = @()
$app = $null
$t = $null
try {
  $t = [Type]::GetTypeFromProgID('PowerPoint.Application')
  $app = [Activator]::CreateInstance($t)
  $presColl = $t.InvokeMember('Presentations', $BF::GetProperty, $null, $app, $null)
  foreach ($p in ($Path -split '\|')) {
    $full = (Resolve-Path -LiteralPath $p).Path
    $item = [ordered]@{ file = $full; ok = $false }
    $pres = $null
    try {
      # ReadOnly = true, Untitled = false, WithWindow = false
      $pres = Invoke-M $presColl 'Open' @($full, -1, 0, 0)
      $slides = Get-P $pres 'Slides'
      $n = [int](Get-P $slides 'Count')
      $item.slideCount = $n
      $ps = Get-P $pres 'PageSetup'
      $item.width = [double](Get-P $ps 'SlideWidth')
      $item.height = [double](Get-P $ps 'SlideHeight')
      $list = @()
      for ($i = 1; $i -le $n; $i++) {
        $s = Invoke-M $slides 'Item' @($i)
        $shapes = Get-P $s 'Shapes'
        $sc = [int](Get-P $shapes 'Count')
        $seq = Get-P (Get-P $s 'TimeLine') 'MainSequence'
        $ec = [int](Get-P $seq 'Count')
        $clicks = 0
        for ($j = 1; $j -le $ec; $j++) {
          $e = Invoke-M $seq 'Item' @($j)
          if ([int](Get-P (Get-P $e 'Timing') 'TriggerType') -eq 1) { $clicks++ }
        }
        $media = 0
        for ($k = 1; $k -le $sc; $k++) {
          $sh = Invoke-M $shapes 'Item' @($k)
          if ([int](Get-P $sh 'Type') -eq 16) { $media++ }
        }
        $list += [ordered]@{ index = $i; shapes = $sc; effects = $ec; clicks = $clicks; media = $media }
      }
      $item.slides = $list
      $item.ok = $true
    } catch {
      $item.error = $_.Exception.Message
    } finally {
      if ($pres) { try { [void](Invoke-M $pres 'Close') } catch { } }
    }
    $out += $item
  }
} catch {
  $out += [ordered]@{ ok = $false; error = $_.Exception.Message }
} finally {
  if ($app -and -not $wasRunning) { try { [void]($t.InvokeMember('Quit', $BF::InvokeMethod, $null, $app, $null)) } catch { } }
}
ConvertTo-Json -InputObject @($out) -Depth 6 -Compress
