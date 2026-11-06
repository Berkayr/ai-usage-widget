param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [Parameter(Mandatory = $true)][ValidateSet('circle', 'pill')][string]$Shape
)
$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class WindowRegionCheck {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr data);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr data);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] private static extern int GetWindowRgnBox(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

    public static string Check(int processId, string shape) {
        var results = new List<string>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr data) {
            uint owner;
            GetWindowThreadProcessId(hwnd, out owner);
            if (owner != (uint)processId) return true;

            RECT region, client, outer;
            int regionType = GetWindowRgnBox(hwnd, out region);
            if (regionType == 0 || !GetClientRect(hwnd, out client) || !GetWindowRect(hwnd, out outer)) return true;
            var topLeft = new POINT { X = client.Left, Y = client.Top };
            var bottomRight = new POINT { X = client.Right, Y = client.Bottom };
            if (!ClientToScreen(hwnd, ref topLeft) || !ClientToScreen(hwnd, ref bottomRight)) return true;

            int[] expected = { topLeft.X - outer.Left, topLeft.Y - outer.Top, bottomRight.X - outer.Left, bottomRight.Y - outer.Top };
            int[] actual = { region.Left, region.Top, region.Right, region.Bottom };
            int maxDelta = 0;
            for (int i = 0; i < 4; i++) maxDelta = Math.Max(maxDelta, Math.Abs(actual[i] - expected[i]));
            results.Add("RegionType=" + regionType + " Expected=" + String.Join(",", expected) + " Actual=" + String.Join(",", actual) + " MaxDelta=" + maxDelta);
            return true;
        }, IntPtr.Zero);

        if (results.Count == 0) return "FAIL: No window region found for process " + processId + " (" + shape + ")";
        foreach (string result in results) if (result.EndsWith("MaxDelta=0") || result.EndsWith("MaxDelta=1")) continue;
        else return "FAIL: " + shape + " window region differs from its client rectangle by more than 1 pixel; " + String.Join("; ", results);
        return "PASS: " + shape + " region matches client rectangle within 1 pixel; " + String.Join("; ", results);
    }
}
'@
Add-Type -TypeDefinition $source -Language CSharp
$result = [WindowRegionCheck]::Check($ProcessId, $Shape)
Write-Host $result
if ($result.StartsWith('FAIL:')) { throw $result }
