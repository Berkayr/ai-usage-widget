# Build-time preparation only. Run from any working directory.
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path $PSScriptRoot -Parent
$Pin = Get-Content (Join-Path $PSScriptRoot 'python-runtime.json') -Raw | ConvertFrom-Json
$Staging = Join-Path ([IO.Path]::GetTempPath()) ('quotacore-python-' + [guid]::NewGuid())
New-Item $Staging -ItemType Directory | Out-Null
try {
    $Archive = Join-Path $Staging 'python.zip'
    Invoke-WebRequest -Uri $Pin.url -OutFile $Archive
    if ((Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Pin.sha256) {
        throw 'Python SHA-256 mismatch; refusing to extract'
    }
    $Extracted = Join-Path $Staging 'python'
    Expand-Archive -LiteralPath $Archive -DestinationPath $Extracted
    foreach ($Name in @('python.exe', 'python313.dll')) {
        $Signature = Get-AuthenticodeSignature (Join-Path $Extracted $Name)
        if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notmatch 'O=Python Software Foundation(?:,|$)') {
            throw "Invalid Python Software Foundation Authenticode signature: $Name"
        }
    }
    foreach ($Name in @('python313.zip', 'LICENSE.txt')) {
        if (!(Test-Path (Join-Path $Extracted $Name) -PathType Leaf)) { throw "Incomplete archive: $Name" }
    }
    [IO.File]::WriteAllText((Join-Path $Extracted 'python313._pth'), "python313.zip`n.`n..`n# import site`n", [Text.Encoding]::ASCII)
    $Destination = Join-Path $RepoRoot 'app/src-tauri/python'
    if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force }
    Move-Item $Extracted $Destination
    Write-Host "Verified Python $($Pin.version) SHA-256: $($Pin.sha256) and PSF signatures"
} finally {
    Remove-Item $Staging -Recurse -Force
}
