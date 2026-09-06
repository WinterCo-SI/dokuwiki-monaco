[CmdletBinding()]
param(
    [string] $MonacoVersion = '0.52.2',
    [string] $MarkedVersion = '15.0.7',
    [string] $DomPurifyVersion = '3.2.4',
    [string] $CodiconsVersion = '0.0.45'
)

$ErrorActionPreference = 'Stop'
$pluginRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vendorPath = [IO.Path]::GetFullPath((Join-Path $pluginRoot 'vendor'))
if (-not $vendorPath.StartsWith($pluginRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Resolved vendor path is outside the plugin directory.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is required to update local Monaco assets.'
}

$temporary = Join-Path ([IO.Path]::GetTempPath()) ('dokuwiki-monaco-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $temporary 'vendor'
New-Item -ItemType Directory -Path $stage | Out-Null

function Expand-NpmPackage {
    param([string] $Package, [string] $Version, [string] $Destination)

    $packDirectory = Join-Path $temporary ($Package.Replace('/', '-').Replace('@', '') + '-pack')
    $extractDirectory = Join-Path $temporary ($Package.Replace('/', '-').Replace('@', '') + '-extract')
    New-Item -ItemType Directory -Path $packDirectory, $extractDirectory | Out-Null
    $archiveName = (& npm pack ($Package + '@' + $Version) --pack-destination $packDirectory --silent).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $archiveName) {
        throw "npm pack failed for $Package@$Version"
    }
    & tar -xf (Join-Path $packDirectory $archiveName) -C $extractDirectory
    if ($LASTEXITCODE -ne 0) {
        throw "Could not extract $archiveName"
    }
    New-Item -ItemType Directory -Path $Destination | Out-Null
    return Join-Path $extractDirectory 'package'
}

function Copy-PackageLicense {
    param([string] $PackageDirectory, [string] $Destination)

    Get-ChildItem -LiteralPath $PackageDirectory -File -Filter 'LICENSE*' |
        Copy-Item -Destination $Destination
}

try {
    $monacoDestination = Join-Path $stage 'monaco'
    $monacoPackage = Expand-NpmPackage 'monaco-editor' $MonacoVersion $monacoDestination
    Copy-Item -LiteralPath (Join-Path $monacoPackage 'min/vs') -Destination $monacoDestination -Recurse
    Copy-PackageLicense $monacoPackage $monacoDestination

    $markedDestination = Join-Path $stage 'marked'
    $markedPackage = Expand-NpmPackage 'marked' $MarkedVersion $markedDestination
    Copy-Item -LiteralPath (Join-Path $markedPackage 'lib/marked.umd.js') -Destination $markedDestination
    Copy-PackageLicense $markedPackage $markedDestination

    $purifyDestination = Join-Path $stage 'dompurify'
    $purifyPackage = Expand-NpmPackage 'dompurify' $DomPurifyVersion $purifyDestination
    Copy-Item -LiteralPath (Join-Path $purifyPackage 'dist/purify.min.js') -Destination $purifyDestination
    Copy-PackageLicense $purifyPackage $purifyDestination

    $codiconsDestination = Join-Path $stage 'codicons'
    $codiconsPackage = Expand-NpmPackage '@vscode/codicons' $CodiconsVersion $codiconsDestination
    Copy-Item -LiteralPath (Join-Path $codiconsPackage 'dist/codicon.css') -Destination $codiconsDestination
    Copy-Item -LiteralPath (Join-Path $codiconsPackage 'dist/codicon.ttf') -Destination $codiconsDestination
    Copy-PackageLicense $codiconsPackage $codiconsDestination

    $versions = [ordered]@{
        monaco = $MonacoVersion
        marked = $MarkedVersion
        dompurify = $DomPurifyVersion
        codicons = $CodiconsVersion
    }
    $versionsJson = $versions | ConvertTo-Json
    [IO.File]::WriteAllText(
        (Join-Path $stage 'versions.json'),
        $versionsJson + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )

    if (Test-Path -LiteralPath $vendorPath) {
        Remove-Item -LiteralPath $vendorPath -Recurse -Force
    }
    Move-Item -LiteralPath $stage -Destination $vendorPath
    Write-Host "Updated local assets in $vendorPath"
} finally {
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Recurse -Force
    }
}
