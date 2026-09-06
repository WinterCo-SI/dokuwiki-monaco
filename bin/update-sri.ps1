[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$pluginRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifestPath = [IO.Path]::GetFullPath((Join-Path $pluginRoot 'conf/sri.json'))
if (-not $manifestPath.StartsWith($pluginRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Resolved SRI manifest path is outside the plugin directory.'
}

$sources = [ordered]@{
    cdnjs = [ordered]@{
        monacoLoader = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js'
        monacoMain = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/editor/editor.main.js'
        monacoCss = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/editor/editor.main.css'
        marked = 'https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.7/marked.min.js'
        purify = 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.4/purify.min.js'
    }
    jsdelivr = [ordered]@{
        monacoLoader = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js'
        monacoMain = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/editor/editor.main.js'
        monacoCss = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/editor/editor.main.css'
        marked = 'https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js'
        purify = 'https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js'
    }
}

$client = [Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.UserAgent.ParseAdd('dokuwiki-monaco-sri-updater/1.0')
$manifest = [ordered]@{}
try {
    foreach ($provider in $sources.Keys) {
        $manifest[$provider] = [ordered]@{}
        foreach ($asset in $sources[$provider].Keys) {
            $url = $sources[$provider][$asset]
            $bytes = $client.GetByteArrayAsync($url).GetAwaiter().GetResult()
            if ($bytes.Length -lt 1000) {
                throw "Downloaded file is unexpectedly small: $url"
            }
            $digest = [Security.Cryptography.SHA384]::HashData($bytes)
            $manifest[$provider][$asset] = 'sha384-' + [Convert]::ToBase64String($digest)
            Write-Host "Hashed $provider/$asset"
        }
    }
} finally {
    $client.Dispose()
}

$json = $manifest | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($manifestPath, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
Write-Host "Updated $manifestPath"
