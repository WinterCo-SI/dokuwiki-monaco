# DokuWiki Monaco Editor

Replaces DokuWiki's edit textarea with Monaco Editor and a live, split-pane
preview. The format menu switches between DokuWiki wikitext and GitHub-flavored
Markdown syntax highlighting and rendering.

The DokuWiki preview is rendered by DokuWiki through a same-origin AJAX call,
so installed syntax plugins such as WRAP and Bootstrap Wrapper are applied.
GitHub-flavored Markdown is rendered in the browser by Marked. Rendered output
is sanitized by DOMPurify before it enters the page.

The workbench follows the browser-IDE pattern used by StackBlitz and
CodeSandbox: Monaco supplies the editor, while this plugin owns the pane layout
and UI state. Icons come from Microsoft's official MIT-licensed
`@vscode/codicons` package, and the shell uses VS Code design-token names. The
full VS Code workbench is not embedded because it depends on VS Code's service
runtime.

## Installation

Copy this directory to `lib/plugins/monaco` in a DokuWiki installation and make
it readable by the web server. DokuWiki discovers `action.php`, `script.js`, and
`style.css` automatically. Open any editable page; the normal save controls are
unchanged, and Ctrl/Cmd+S triggers Save.

Choose `local`, `cdnjs`, or `jsdelivr` under **Configuration Settings → Monaco
Editor → Asset source**. Local is the default. Monaco's distribution files are
not committed to this repository; download them on demand by running the
PowerShell or Bash updater from the plugin directory before deploying (`tar`,
`curl` for Bash, and network access are required):

```powershell
.\bin\update-assets.ps1
```

```bash
bash ./bin/update-assets.sh
```

The script downloads the pinned Monaco, Marked, DOMPurify, and Codicons
versions directly from the npm registry into `vendor/`; npm itself is not
required. The generated `vendor/monaco/` directory is ignored by Git. If you
do not want to keep local assets, choose `cdnjs` or `jsdelivr` instead; those
modes load Monaco from the pinned CDN URLs. If loading fails, the original
DokuWiki textarea remains available.

CDNJS and jsDelivr versions are pinned. Every directly inserted CDN script has
a SHA-384 SRI value and `crossorigin="anonymous"`. Run `bin/update-sri.ps1` or
`bin/update-sri.sh` to download those exact CDN files, recompute their hashes,
and update the local `conf/sri.json` manifest. The Bash script requires `curl`
and OpenSSL. Review and commit the manifest change alongside any version or URL
change.

## Notes

- The selected format is stored locally in the browser.
- Format selection affects editing and live preview only. Saving still writes
  the editor text to DokuWiki's standard `wikitext` field.
- Drag either tab toward an edge of the other pane to move it or switch between
  a side-by-side and stacked layout.
- External links and images in preview may make normal browser requests to
  their targets. DokuWiki previews also make a same-origin request to the wiki.
