# Run interactively in your own PowerShell terminal. Never send the key in chat.
$ErrorActionPreference = 'Stop'
$stitchSecret = Read-Host 'Paste your Stitch API key (input hidden)' -AsSecureString
$stitchPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stitchSecret)
try {
    $stitchValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stitchPtr)
    if ([string]::IsNullOrWhiteSpace($stitchValue)) {
        throw 'No API key entered. Nothing was saved.'
    }
    [Environment]::SetEnvironmentVariable('STITCH_API_KEY', $stitchValue, 'User')
    $env:STITCH_API_KEY = $stitchValue
    Write-Host 'Stitch key saved in your Windows user environment. Fully restart the application hosting Codex to load it.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stitchPtr)
    Remove-Variable stitchValue, stitchSecret -ErrorAction SilentlyContinue
}
