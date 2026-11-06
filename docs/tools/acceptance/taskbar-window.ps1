param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StripWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
}
'@
$deadline = (Get-Date).AddSeconds(10)
do {
  $handle = [StripWindow]::FindWindow('AIUsageTaskbarStrip', $null)
  if ($handle -ne [IntPtr]::Zero -and [StripWindow]::IsWindowVisible($handle)) { break }
  Start-Sleep -Milliseconds 200
} while ((Get-Date) -lt $deadline)
if ($handle -eq [IntPtr]::Zero -or -not [StripWindow]::IsWindowVisible($handle)) { throw 'Native GDI taskbar strip not visible' }
$rect = New-Object StripWindow+Rect
if (-not [StripWindow]::GetWindowRect($handle, [ref]$rect)) { throw 'Cannot measure taskbar strip' }
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 1 -or $height -le 1) { throw 'Taskbar strip has no usable bounds' }
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose() }
@{width=$width; height=$height; x=$rect.Left; y=$rect.Top} | ConvertTo-Json -Compress
