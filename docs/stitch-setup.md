# Stitch MCP connection

The project configuration uses Google's remote endpoint and reads STITCH_API_KEY from the environment. Configuration alone does not authenticate the account or prove project access.

Configured project: https://stitch.withgoogle.com/projects/2363914982225928169

Local check: `codex mcp get stitch` successfully recognized the project-scoped configuration on 2026-09-18. Authenticated connectivity and screen retrieval are still pending the API key and application restart.

## Authenticate locally

1. In https://stitch.withgoogle.com open profile -> Stitch Settings -> API Keys -> Create Key. Do not paste the key into chat or commit it.
2. In a local PowerShell terminal run the following. The prompt hides the key and avoids placing it in command history. Windows user environment storage is persistent, not an encrypted secret vault.

```powershell
$stitchSecret = Read-Host 'Stitch API key' -AsSecureString
$stitchPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stitchSecret)
try {
    $stitchValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stitchPtr)
    [Environment]::SetEnvironmentVariable('STITCH_API_KEY', $stitchValue, 'User')
    $env:STITCH_API_KEY = $stitchValue
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stitchPtr)
    Remove-Variable stitchValue, stitchSecret -ErrorAction SilentlyContinue
}
```

3. Restart the application hosting Codex so it inherits the updated environment. A terminal-only setting does not update an already running IDE. If a restarted application still lacks the variable, sign out/in to Windows or launch from an environment that contains it.
4. Open this trusted project, check the MCP server list, and verify Stitch connects. `codex mcp get stitch` checks configuration only, not connectivity.
5. Supply the MaatriSetu Stitch project URL/ID. First verify read access by listing its screens and retrieving a screenshot/HTML. No design edits are needed to inspect it.

If the key is rejected, check the selected Stitch account and key in Stitch settings. Do not paste raw authentication logs containing headers or credentials.

## Sources

- Codex configuration: https://developers.openai.com/codex/mcp
- Stitch setup: https://stitch.withgoogle.com/docs/mcp/setup
- Google's authentication guide: https://github.com/gemini-cli-extensions/stitch/blob/main/README.md
