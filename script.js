/* DokuWiki Monaco editor: all preview rendering happens in this browser file. */
(function () {
    'use strict';

    function readAssetConfig() {
        const meta = document.querySelector('meta[name="dokuwiki-monaco-config"]');
        if (!meta) return null;
        try {
            return JSON.parse(meta.content);
        } catch (error) {
            console.error('Invalid DokuWiki Monaco asset configuration:', error);
            return null;
        }
    }

    function loadScript(asset) {
        return new Promise(function (resolve, reject) {
            const existing = Array.from(document.scripts).find(function (script) {
                return script.dataset.monacoSource === asset.src;
            });
            if (existing) {
                existing.addEventListener('load', resolve, {once: true});
                existing.addEventListener('error', reject, {once: true});
                if (existing.dataset.loaded === 'true') resolve();
                return;
            }
            const script = document.createElement('script');
            script.async = true;
            script.dataset.monacoSource = asset.src;
            if (asset.integrity) script.integrity = asset.integrity;
            if (asset.crossorigin) script.crossOrigin = asset.crossorigin;
            script.src = asset.src;
            script.onload = function () {
                script.dataset.loaded = 'true';
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function loadStyle(asset) {
        return new Promise(function (resolve, reject) {
            const existing = Array.from(document.styleSheets).find(function (sheet) {
                return sheet.ownerNode && sheet.ownerNode.dataset.monacoSource === asset.src;
            });
            if (existing) {
                resolve();
                return;
            }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.dataset.monacoSource = asset.src;
            if (asset.integrity) link.integrity = asset.integrity;
            if (asset.crossorigin) link.crossOrigin = asset.crossorigin;
            link.onload = resolve;
            link.onerror = reject;
            link.href = asset.src;
            document.head.appendChild(link);
        });
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character];
        });
    }

    function safeUrl(value) {
        const url = String(value || '').trim();
        if (/^(?:https?:|mailto:|\/|#)/i.test(url)) return url;
        return '#';
    }

    function unescapeUrlText(value) {
        return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }

    function wikiUrl(page) {
        const base = typeof DOKU_BASE === 'string' ? DOKU_BASE : '/';
        return base + 'doku.php?id=' + encodeURIComponent(page.replace(/ /g, '_'));
    }

    function mediaUrl(media) {
        const base = typeof DOKU_BASE === 'string' ? DOKU_BASE : '/';
        if (/^https?:\/\//i.test(media)) return media;
        return base + 'lib/exe/fetch.php?media=' + encodeURIComponent(media.replace(/ /g, '_'));
    }

    function detectFormat(source) {
        const text = String(source || '');
        let dokuwiki = 0;
        let markdown = 0;

        if (/^\s*={2,6}.+={2,6}\s*$/m.test(text)) dokuwiki += 4;
        if (/\[\[[^\]]+\]\]|\{\{[^}]+\}\}/.test(text)) dokuwiki += 3;
        if (/^\s{2,}(?:\*|-)\s+/m.test(text)) dokuwiki += 2;
        if (/^\^[^^\n]+\^/m.test(text)) dokuwiki += 2;
        if (/<(?:code|file|nowiki)(?:\s[^>]*)?>/i.test(text)) dokuwiki += 2;

        if (/^\s{0,3}#{1,6}\s+\S/m.test(text)) markdown += 4;
        if (/^\s*```|^\s*~~~/m.test(text)) markdown += 3;
        if (/!?(?:\[[^\]]*\])\([^)]+\)/.test(text)) markdown += 3;
        if (/^\s*[-*+]\s+\[[ xX]\]\s+/m.test(text)) markdown += 3;
        if (/^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/m.test(text)) markdown += 2;

        return markdown > dokuwiki ? 'markdown' : 'dokuwiki';
    }

    function renderWikiInline(source) {
        const held = [];
        function hold(html) {
            held.push(html);
            return '\u0000' + (held.length - 1) + '\u0000';
        }

        let text = escapeHtml(source);
        text = text.replace(/&lt;nowiki&gt;([\s\S]*?)&lt;\/nowiki&gt;/gi, function (_, code) {
            return hold(code);
        });
        text = text.replace(/''([^'\n]+)''/g, function (_, code) {
            return hold('<code>' + code + '</code>');
        });
        text = text.replace(/\{\{\s*([^}|?]+)(?:\?[^}|]*)?\s*(?:\|\s*([^}]*))?\}\}/g, function (_, media, title) {
            const src = safeUrl(mediaUrl(unescapeUrlText(media.trim())));
            const alt = (title || media).trim();
            return hold('<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" loading="lazy">');
        });
        text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, target, title) {
            const rawTarget = unescapeUrlText(target.trim());
            const external = /^(?:https?:|mailto:)/i.test(rawTarget);
            const href = external ? safeUrl(rawTarget) : wikiUrl(rawTarget);
            return hold('<a href="' + escapeHtml(href) + '">' + (title || target) + '</a>');
        });
        text = text.replace(/(^|[\s(])((?:https?:\/\/|mailto:)[^\s<]+)/g, function (_, prefix, url) {
            return prefix + hold('<a href="' + escapeHtml(safeUrl(unescapeUrlText(url))) + '">' + url + '</a>');
        });
        text = text.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\/\/([^\n]+?)\/\//g, '<em>$1</em>');
        text = text.replace(/__([^\n]+?)__/g, '<u>$1</u>');
        text = text.replace(/~~([^\n]+?)~~/g, '<del>$1</del>');
        text = text.replace(/\\\\(?:\s|$)/g, '<br>');
        text = text.replace(/\(\((.+?)\)\)/g, '<sup class="monaco-footnote" title="$1">*</sup>');
        return text.replace(/\u0000(\d+)\u0000/g, function (_, index) { return held[Number(index)]; });
    }

    function splitTableRow(line) {
        const trimmed = line.trim();
        return trimmed.slice(1, -1).split(/(?<!\\)[|^]/).map(function (cell) { return cell.trim(); });
    }

    function renderDokuWiki(source) {
        const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
        const output = [];
        let paragraph = [];
        let listStack = [];
        let quoteDepth = 0;
        let inCode = false;
        let codeTag = 'code';
        let codeLanguage = '';
        let codeLines = [];

        function closeParagraph() {
            if (paragraph.length) {
                output.push('<p>' + paragraph.map(renderWikiInline).join('<br>') + '</p>');
                paragraph = [];
            }
        }
        function closeLists() {
            while (listStack.length) output.push('</li></' + listStack.pop() + '>');
        }
        function closeQuotes() {
            while (quoteDepth-- > 0) output.push('</blockquote>');
            quoteDepth = 0;
        }
        function closeFlow() {
            closeParagraph();
            closeLists();
            closeQuotes();
        }

        lines.forEach(function (line) {
            if (inCode) {
                const closing = new RegExp('^\\s*&lt;/' + codeTag + '&gt;\\s*$', 'i');
                if (closing.test(escapeHtml(line))) {
                    output.push('<pre><code' + (codeLanguage ? ' class="language-' + escapeHtml(codeLanguage) + '"' : '') + '>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
                    inCode = false;
                    codeLines = [];
                } else codeLines.push(line);
                return;
            }

            const codeOpen = line.match(/^\s*<(code|file)(?:\s+([^>]+))?>\s*$/i);
            if (codeOpen) {
                closeFlow();
                inCode = true;
                codeTag = codeOpen[1].toLowerCase();
                codeLanguage = (codeOpen[2] || '').split(/\s+/)[0];
                return;
            }

            const heading = line.match(/^\s*(={2,6})\s*(.*?)\s*\1\s*$/);
            if (heading) {
                closeFlow();
                const level = 7 - heading[1].length;
                output.push('<h' + level + '>' + renderWikiInline(heading[2]) + '</h' + level + '>');
                return;
            }

            if (/^\s*-{4,}\s*$/.test(line)) {
                closeFlow();
                output.push('<hr>');
                return;
            }

            const list = line.match(/^(\s{2,})([*-])\s+(.*)$/);
            if (list) {
                closeParagraph();
                closeQuotes();
                const depth = Math.max(1, Math.floor(list[1].length / 2));
                const type = list[2] === '*' ? 'ul' : 'ol';
                while (listStack.length > depth) output.push('</li></' + listStack.pop() + '>');
                if (listStack.length === depth && listStack[listStack.length - 1] !== type) {
                    output.push('</li></' + listStack.pop() + '><' + type + '><li>');
                    listStack.push(type);
                    output.push(renderWikiInline(list[3]));
                    return;
                }
                if (listStack.length === depth) output.push('</li><li>');
                while (listStack.length < depth) {
                    listStack.push(type);
                    output.push('<' + type + '><li>');
                }
                output.push(renderWikiInline(list[3]));
                return;
            }
            closeLists();

            const quote = line.match(/^(>+)\s?(.*)$/);
            if (quote) {
                closeParagraph();
                while (quoteDepth < quote[1].length) { output.push('<blockquote>'); quoteDepth++; }
                while (quoteDepth > quote[1].length) { output.push('</blockquote>'); quoteDepth--; }
                output.push('<p>' + renderWikiInline(quote[2]) + '</p>');
                return;
            }
            closeQuotes();

            if (/^[|^].*[|^]\s*$/.test(line)) {
                closeParagraph();
                const header = line.charAt(0) === '^';
                const cells = splitTableRow(line);
                output.push('<table><tbody><tr>' + cells.map(function (cell) {
                    const tag = header ? 'th' : 'td';
                    return '<' + tag + '>' + renderWikiInline(cell) + '</' + tag + '>';
                }).join('') + '</tr></tbody></table>');
                return;
            }

            if (!line.trim()) {
                closeParagraph();
                return;
            }
            paragraph.push(line);
        });

        if (inCode) output.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        closeFlow();
        return output.join('\n').replace(/<\/tbody><\/table>\s*<table><tbody>/g, '');
    }

    function registerDokuWikiLanguage(monaco) {
        monaco.languages.register({id: 'dokuwiki'});
        monaco.languages.setMonarchTokensProvider('dokuwiki', {
            tokenizer: {
                root: [
                    [/^\s*={2,6}.*?={2,6}\s*$/, 'type.identifier'],
                    [/^\s*-{4,}\s*$/, 'delimiter'],
                    [/^\s{2,}[*-]\s+/, 'keyword'],
                    [/^>+/, 'comment'],
                    [/<(code|file)(?:\s+[^>]*)?>/, {token: 'tag', next: '@code'}],
                    [/<nowiki>/, {token: 'tag', next: '@nowiki'}],
                    [/\{\{[^}]+\}\}/, 'string'],
                    [/\[\[[^\]]+\]\]/, 'string.link'],
                    [/(https?:\/\/|mailto:)[^\s]+/, 'string.link'],
                    [/\*\*/, 'strong'],
                    [/\/\//, 'emphasis'],
                    [/__/, 'strong'],
                    [/''/, 'variable'],
                    [/\(\(|\)\)/, 'annotation'],
                    [/^[|^]|[|^]$/, 'delimiter'],
                    [/~~[^~]+~~/, 'keyword']
                ],
                code: [
                    [/<\/(code|file)>/, {token: 'tag', next: '@pop'}],
                    [/.*$/, 'string']
                ],
                nowiki: [
                    [/<\/nowiki>/, {token: 'tag', next: '@pop'}],
                    [/.*$/, 'string']
                ]
            }
        });
        monaco.languages.setLanguageConfiguration('dokuwiki', {
            brackets: [['[[', ']]'], ['{{', '}}'], ['((', '))']],
            autoClosingPairs: [
                {open: '[[', close: ']]'}, {open: '{{', close: '}}'},
                {open: '**', close: '**'}, {open: "''", close: "''"}
            ]
        });
    }

    async function start() {
        const textarea = document.getElementById('wiki__text');
        if (!textarea || textarea.dataset.monacoStarted) return;
        const assets = readAssetConfig();
        if (!assets) return;
        textarea.dataset.monacoStarted = 'true';

        const shell = document.createElement('div');
        shell.className = 'dw-monaco-shell';
        const pageName = typeof JSINFO === 'object' && JSINFO.id ? JSINFO.id : 'wikitext';
        shell.innerHTML = '<div class="dw-monaco-titlebar">' +
            '<span class="dw-monaco-brand"><span class="codicon codicon-code" aria-hidden="true"></span></span>' +
            '<span class="dw-monaco-file">' + escapeHtml(pageName) + '</span>' +
            '<div class="dw-monaco-commandbar"></div>' +
            '<div class="dw-monaco-controls"></div></div>' +
            '<div class="dw-monaco-workspace">' +
            '<section class="dw-monaco-pane dw-monaco-editor-pane"><header draggable="true" role="tab" title="Drag to move editor"><span class="codicon codicon-code" aria-hidden="true"></span>' + escapeHtml(pageName) + '</header><div class="dw-monaco-editor"></div></section>' +
            '<div class="dw-monaco-resizer" role="separator" tabindex="0" aria-label="Resize editor and preview" aria-orientation="vertical"></div>' +
            '<section class="dw-monaco-pane dw-monaco-preview-pane"><header draggable="true" role="tab" title="Drag to move preview"><span class="codicon codicon-open-preview" aria-hidden="true"></span>Preview</header><div class="dw-monaco-preview" aria-live="polite"></div></section>' +
            '</div><div class="dw-monaco-statusbar"><span class="dw-monaco-status-item"><span class="codicon codicon-code" aria-hidden="true"></span> DokuWiki</span><span class="dw-monaco-status" role="status">Loading editor…</span>' +
            '<span class="dw-monaco-position">Ln 1, Col 1</span><span class="dw-monaco-status-item">Spaces: 2</span><span class="dw-monaco-status-item">UTF-8</span>' +
            '<button type="button" class="dw-monaco-word-wrap dw-monaco-status-button" aria-pressed="true" title="Toggle word wrap"><span class="codicon codicon-word-wrap" aria-hidden="true"></span> Wrap</button>' +
            '<label class="dw-monaco-format-control"><span class="codicon codicon-symbol-enum" aria-hidden="true"></span><span>Format</span><select class="dw-monaco-format"><option value="dokuwiki">DokuWiki</option><option value="markdown">GitHub Markdown</option></select></label></div>';
        textarea.parentNode.insertBefore(shell, textarea.nextSibling);
        const workspace = shell.querySelector('.dw-monaco-workspace');
        const tabStrip = document.createElement('div');
        tabStrip.className = 'dw-monaco-tabstrip';
        workspace.insertBefore(tabStrip, workspace.firstChild);
        workspace.querySelectorAll('.dw-monaco-pane > header').forEach(function (header) {
            header.classList.add(header.parentElement.classList.contains('dw-monaco-editor-pane') ? 'dw-monaco-editor-pane-tab' : 'dw-monaco-preview-pane-tab');
            tabStrip.appendChild(header);
        });

        const dokuToolbar = document.getElementById('tool__bar');
        if (dokuToolbar) {
            const bootstrapIconMap = {
                'mdi-format-bold.svg': 'bold.png',
                'mdi-format-italic.svg': 'italic.png',
                'mdi-format-underline.svg': 'underline.png',
                'mdi-format-title.svg': 'mono.png',
                'mdi-format-strikethrough.svg': 'strike.png',
                'mdi-format-header-equal.svg': 'hequal.png',
                'mdi-format-header-decrease.svg': 'hminus.png',
                'mdi-format-header-increase.svg': 'hplus.png',
                'mdi-format-header-pound.svg': 'h.png',
                'mdi-format-header-1.svg': 'h1.png',
                'mdi-format-header-2.svg': 'h2.png',
                'mdi-format-header-3.svg': 'h3.png',
                'mdi-format-header-4.svg': 'h4.png',
                'mdi-format-header-5.svg': 'h5.png',
                'mdi-link.svg': 'link.png',
                'mdi-link-variant.svg': 'linkextern.png',
                'mdi-format-list-numbered.svg': 'ol.png',
                'mdi-format-list-bulleted.svg': 'ul.png',
                'mdi-minus.svg': 'hr.png',
                'mdi-image.svg': 'image.png',
                'mdi-emoticon-outline.svg': 'smiley.png',
                'mdi-omega.svg': 'chars.png',
                'mdi-signature.svg': 'sig.png'
            };
            const monochromeToolbarIcons = new Set([
                'bold.png', 'italic.png', 'link.png', 'mono.png', 'strike.png', 'underline.png'
            ]);
            const toolbarIconBase = (typeof DOKU_BASE === 'string' ? DOKU_BASE : '/') + 'lib/images/toolbar/';
            function restoreBuiltInToolbarIcons() {
                dokuToolbar.querySelectorAll('img').forEach(function (image) {
                    const source = image.getAttribute('src') || '';
                    const url = new URL(image.src, document.baseURI);
                    const icon = url.searchParams.get('icon') || url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
                    const fromBuiltInToolbar = source.indexOf('lib/images/toolbar/') !== -1;
                    const fromBootstrapIconify = source.indexOf('iconify.php') !== -1 || source.indexOf('/iconify/') !== -1;
                    const replacement = fromBuiltInToolbar && fromBootstrapIconify ? bootstrapIconMap[icon] : null;
                    if (replacement) {
                        image.src = toolbarIconBase + replacement;
                        url.pathname = toolbarIconBase + replacement;
                        url.search = '';
                    }
                    const builtIn = /\/lib\/images\/toolbar\/[^/]+$/.test(url.pathname);
                    const filename = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
                    image.classList.toggle('dw-monaco-built-in-icon', builtIn);
                    image.classList.toggle('dw-monaco-monochrome-icon', builtIn && monochromeToolbarIcons.has(filename));
                });
            }
            restoreBuiltInToolbarIcons();
            new MutationObserver(restoreBuiltInToolbarIcons).observe(dokuToolbar, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['src']
            });
            const oldToolbarHost = dokuToolbar.parentElement;
            shell.querySelector('.dw-monaco-commandbar').appendChild(dokuToolbar);
            if (oldToolbarHost && oldToolbarHost !== shell && !oldToolbarHost.children.length) {
                oldToolbarHost.style.display = 'none';
            }
        }

        const editorNode = shell.querySelector('.dw-monaco-editor');
        const preview = shell.querySelector('.dw-monaco-preview');
        const format = shell.querySelector('.dw-monaco-format');
        const status = shell.querySelector('.dw-monaco-status');
        const wordWrapButtons = shell.querySelectorAll('.dw-monaco-word-wrap');
        const resizer = shell.querySelector('.dw-monaco-resizer');
        const editorPane = shell.querySelector('.dw-monaco-editor-pane');
        const previewPane = shell.querySelector('.dw-monaco-preview-pane');
        editorPane.classList.add('dw-monaco-active-tab');
        function activatePane(pane) {
            [editorPane, previewPane].forEach(function (candidate) {
                candidate.classList.toggle('dw-monaco-active-tab', candidate === pane);
            });
            tabStrip.querySelectorAll('header').forEach(function (header) {
                const isEditorTab = header.classList.contains('dw-monaco-editor-pane-tab');
                header.classList.toggle('dw-monaco-active-tab', isEditorTab === (pane === editorPane));
            });
            editor.layout();
        }
        tabStrip.querySelectorAll('header').forEach(function (header) {
            header.addEventListener('click', function () {
                activatePane(header.classList.contains('dw-monaco-editor-pane-tab') ? editorPane : previewPane);
            });
        });
        const positionStatus = shell.querySelector('.dw-monaco-position');
        const sizeControl = document.getElementById('size__ctl') || document.querySelector('.size__ctl');
        const savedHeight = typeof DokuCookie !== 'undefined' ? parseFloat(DokuCookie.getValue('sizeCtl')) : NaN;
        if (Number.isFinite(savedHeight) && savedHeight >= 360) {
            workspace.style.height = savedHeight + 'px';
            workspace.style.maxHeight = 'none';
        }
        format.value = detectFormat(textarea.value);

        try {
            await Promise.all([loadScript(assets.marked), loadScript(assets.purify), loadStyle(assets.codicons)]);
            await loadScript(assets.monacoLoader);
            window.require.config({paths: {vs: assets.monacoRoot}});
            await Promise.all([loadScript(assets.monacoMain), loadStyle(assets.monacoCss)]);
            const monaco = await new Promise(function (resolve) {
                window.require(['vs/editor/editor.main'], function () { resolve(window.monaco); });
            });
            registerDokuWikiLanguage(monaco);

            const editor = monaco.editor.create(editorNode, {
                value: textarea.value,
                language: format.value,
                automaticLayout: true,
                minimap: {enabled: true, renderCharacters: false, showSlider: 'mouseover'},
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                fontFamily: "Consolas, 'Cascadia Mono', 'Cascadia Code', 'Courier New', monospace",
                fontSize: 14,
                fontWeight: 'normal',
                fontLigatures: false,
                fontVariations: false,
                letterSpacing: 0,
                tabSize: 2,
                theme: 'vs-dark',
                padding: {top: 12}
            });
            textarea.classList.add('dw-monaco-source');
            status.textContent = 'Ready';

            let metricRefreshFrame;
            function refreshEditorMetrics() {
                window.cancelAnimationFrame(metricRefreshFrame);
                metricRefreshFrame = window.requestAnimationFrame(function () {
                    monaco.editor.remeasureFonts();
                    editor.layout();
                });
            }
            if (document.fonts) {
                document.fonts.ready.then(refreshEditorMetrics);
                document.fonts.addEventListener('loadingdone', refreshEditorMetrics);
            }
            window.addEventListener('resize', refreshEditorMetrics);
            if (window.visualViewport) window.visualViewport.addEventListener('resize', refreshEditorMetrics);

            if (sizeControl) {
                sizeControl.querySelectorAll('button').forEach(function (button) {
                    const image = button.querySelector('img');
                    if (!image) return;
                    const filename = new URL(image.src, document.baseURI).pathname.split('/').pop();
                    const delta = filename === 'larger.svg' ? 100 : filename === 'smaller.svg' ? -100 : 0;
                    if (!delta) return;
                    button.addEventListener('click', function () {
                        const height = Math.max(360, Math.round(workspace.getBoundingClientRect().height + delta));
                        workspace.style.height = height + 'px';
                        workspace.style.maxHeight = 'none';
                        if (typeof DokuCookie !== 'undefined') DokuCookie.setValue('sizeCtl', height + 'px');
                        editor.layout();
                    });
                });
            }

            let previewTimer;
            let previewRequest;
            function renderPreview() {
                clearTimeout(previewTimer);
                if (previewRequest) previewRequest.abort();
                previewTimer = setTimeout(async function () {
                    const source = editor.getValue();
                    textarea.value = source;
                    let html;
                    previewRequest = new AbortController();
                    const body = new URLSearchParams({
                        call: 'plugin_monaco_preview',
                        id: pageName,
                        format: format.value,
                        wikitext: source
                    });
                    try {
                        const base = typeof DOKU_BASE === 'string' ? DOKU_BASE : '/';
                        const response = await fetch(base + 'lib/exe/ajax.php', {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                            body: body.toString(),
                            signal: previewRequest.signal
                        });
                        if (!response.ok) throw new Error('Preview request failed: ' + response.status);
                        html = await response.text();
                    } catch (error) {
                        if (error.name === 'AbortError') return;
                        console.warn('DokuWiki preview failed; using the browser fallback.', error);
                        if (format.value === 'markdown') {
                            window.marked.setOptions({gfm: true, breaks: false});
                            html = window.marked.parse(source);
                        } else {
                            html = renderDokuWiki(source);
                        }
                    }
                    preview.innerHTML = window.DOMPurify.sanitize(html, {
                        USE_PROFILES: {html: true},
                        ADD_ATTR: ['target'],
                        FORBID_TAGS: ['style', 'form', 'button', 'select', 'textarea']
                    });
                    status.textContent = source.length.toLocaleString() + ' characters';
                }, 200);
            }

            editor.onDidChangeModelContent(function () {
                renderPreview();
            });

            let lastSelection = editor.getSelection();
            editor.onDidChangeCursorSelection(function (event) {
                lastSelection = event.selection;
                const selected = [event.selection].concat(event.secondarySelections || []).reduce(function (total, selection) {
                    return total + editor.getModel().getValueLengthInRange(selection);
                }, 0);
                positionStatus.textContent = 'Ln ' + event.selection.positionLineNumber + ', Col ' + event.selection.positionColumn +
                    (selected ? ' (' + selected.toLocaleString() + ' selected)' : '');
            });

            function prepareToolbarEdit() {
                const model = editor.getModel();
                const selection = lastSelection || editor.getSelection();
                textarea.value = model.getValue();
                textarea.selectionStart = model.getOffsetAt(selection.getStartPosition());
                textarea.selectionEnd = model.getOffsetAt(selection.getEndPosition());
            }

            function applyToolbarEdit() {
                const model = editor.getModel();
                const before = model.getValue();
                const after = textarea.value;
                if (before === after) return;
                let start = 0;
                while (start < before.length && start < after.length && before[start] === after[start]) start++;
                let beforeEnd = before.length;
                let afterEnd = after.length;
                while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
                    beforeEnd--;
                    afterEnd--;
                }
                const resultSelectionStart = textarea.selectionStart;
                const resultSelectionEnd = textarea.selectionEnd;
                editor.pushUndoStop();
                editor.executeEdits('dokuwiki-toolbar', [{
                    range: monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(beforeEnd)),
                    text: after.slice(start, afterEnd),
                    forceMoveMarkers: true
                }]);
                const selectionStart = model.getPositionAt(resultSelectionStart);
                const selectionEnd = model.getPositionAt(resultSelectionEnd);
                editor.setSelection(monaco.Selection.fromPositions(selectionStart, selectionEnd));
                editor.pushUndoStop();
                editor.focus();
            }

            if (dokuToolbar) {
                dokuToolbar.addEventListener('click', prepareToolbarEdit, true);
                dokuToolbar.addEventListener('click', function () {
                    window.setTimeout(applyToolbarEdit, 0);
                });
            }

            format.addEventListener('change', function () {
                monaco.editor.setModelLanguage(editor.getModel(), format.value);
                renderPreview();
            });
            let wordWrapEnabled = true;
            wordWrapButtons.forEach(function (button) {
                button.addEventListener('click', function () {
                    wordWrapEnabled = !wordWrapEnabled;
                    editor.updateOptions({wordWrap: wordWrapEnabled ? 'on' : 'off'});
                    wordWrapButtons.forEach(function (control) {
                        control.setAttribute('aria-pressed', String(wordWrapEnabled));
                        control.classList.toggle('dw-monaco-control-off', !wordWrapEnabled);
                    });
                });
            });

            let draggedPane = null;
            let dropPane = null;
            let dropEdge = null;
            function clearDropTarget() {
                [editorPane, previewPane].forEach(function (pane) {
                    pane.removeAttribute('data-drop-edge');
                });
                dropPane = null;
                dropEdge = null;
            }
            function arrangePanes(first, second, stacked) {
                shell.classList.toggle('dw-monaco-stacked', stacked);
                workspace.appendChild(first);
                workspace.appendChild(resizer);
                workspace.appendChild(second);
                updateResizerOrientation();
                editor.layout();
            }
            [editorPane, previewPane].forEach(function (pane) {
            const tab = tabStrip.querySelector(pane.classList.contains('dw-monaco-editor-pane') ? '.dw-monaco-editor-pane-tab' : '.dw-monaco-preview-pane-tab');
                tab.addEventListener('dragstart', function (event) {
                    draggedPane = pane;
                    shell.classList.add('dw-monaco-tab-dragging');
                    event.dataTransfer.effectAllowed = 'move';
                    // Mark this as an internal pane move; exposing text/plain lets the
                    // browser/editor treat the tab's class name as dropped content.
                    event.dataTransfer.setData('application/x-dw-monaco-pane', pane.dataset.pane || '');
                });
                tab.addEventListener('dragend', function () {
                    draggedPane = null;
                    shell.classList.remove('dw-monaco-tab-dragging');
                    clearDropTarget();
                });
            });
            workspace.addEventListener('dragover', function (event) {
                if (!draggedPane) return;
                const pane = event.target.closest('.dw-monaco-pane');
                if (!pane) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    return;
                }
                if (pane === draggedPane) {
                    // Keep the drag active while crossing the source pane; this
                    // mirrors VS Code's internal tab drag behavior.
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    return;
                }
                const bounds = pane.getBoundingClientRect();
                const distances = {
                    left: event.clientX - bounds.left,
                    right: bounds.right - event.clientX,
                    top: event.clientY - bounds.top,
                    bottom: bounds.bottom - event.clientY
                };
                const edge = Object.keys(distances).reduce(function (best, current) {
                    return distances[current] < distances[best] ? current : best;
                }, 'left');
                clearDropTarget();
                dropPane = pane;
                dropEdge = edge;
                pane.dataset.dropEdge = edge;
                event.dataTransfer.dropEffect = 'move';
                event.preventDefault();
            });
            workspace.addEventListener('drop', function (event) {
                if (!draggedPane) return;
                if (!dropPane || !dropEdge) {
                    event.preventDefault();
                    return;
                }
                const draggedTab = tabStrip.querySelector(draggedPane.classList.contains('dw-monaco-editor-pane') ? '.dw-monaco-editor-pane-tab' : '.dw-monaco-preview-pane-tab');
                const targetTab = tabStrip.querySelector(dropPane.classList.contains('dw-monaco-editor-pane') ? '.dw-monaco-editor-pane-tab' : '.dw-monaco-preview-pane-tab');
                if (draggedTab && targetTab && draggedTab !== targetTab) {
                    tabStrip.insertBefore(draggedTab, dropEdge === 'left' || dropEdge === 'top' ? targetTab : targetTab.nextSibling);
                }
                const first = dropEdge === 'left' || dropEdge === 'top' ? draggedPane : dropPane;
                const second = first === editorPane ? previewPane : editorPane;
                arrangePanes(first, second, dropEdge === 'top' || dropEdge === 'bottom');
                clearDropTarget();
                event.preventDefault();
            });

            let resizing = false;
            const narrowLayout = window.matchMedia('(max-width: 850px)');
            function isStackedLayout() {
                return shell.classList.contains('dw-monaco-stacked') || narrowLayout.matches;
            }
            function updateResizerOrientation() {
                resizer.setAttribute('aria-orientation', isStackedLayout() ? 'horizontal' : 'vertical');
            }
            function resizeAt(clientX, clientY) {
                const bounds = workspace.getBoundingClientRect();
                const stacked = isStackedLayout();
                const position = stacked ? clientY - bounds.top : clientX - bounds.left;
                const total = stacked ? bounds.height : bounds.width;
                const percent = Math.max(20, Math.min(80, position / total * 100));
                shell.style.setProperty('--dw-monaco-editor-size', percent + '%');
                editor.layout();
            }
            resizer.addEventListener('pointerdown', function (event) {
                resizing = true;
                shell.classList.add('dw-monaco-resizing');
                resizer.setPointerCapture(event.pointerId);
                event.preventDefault();
            });
            resizer.addEventListener('pointermove', function (event) {
                if (resizing) resizeAt(event.clientX, event.clientY);
            });
            resizer.addEventListener('pointerup', function (event) {
                resizing = false;
                shell.classList.remove('dw-monaco-resizing');
                resizer.releasePointerCapture(event.pointerId);
            });
            resizer.addEventListener('pointercancel', function () {
                resizing = false;
                shell.classList.remove('dw-monaco-resizing');
            });
            resizer.addEventListener('keydown', function (event) {
                const stacked = isStackedLayout();
                const backwards = stacked ? event.key === 'ArrowUp' : event.key === 'ArrowLeft';
                const forwards = stacked ? event.key === 'ArrowDown' : event.key === 'ArrowRight';
                if (!backwards && !forwards) return;
                const current = parseFloat(shell.style.getPropertyValue('--dw-monaco-editor-size')) || 50;
                shell.style.setProperty('--dw-monaco-editor-size', Math.max(20, Math.min(80, current + (forwards ? 5 : -5))) + '%');
                editor.layout();
                event.preventDefault();
            });
            narrowLayout.addEventListener('change', updateResizerOrientation);
            updateResizerOrientation();

            const form = textarea.form;
            if (form) {
                form.addEventListener('submit', function () { textarea.value = editor.getValue(); });
                form.addEventListener('reset', function () {
                    setTimeout(function () { editor.setValue(textarea.value); }, 0);
                });
            }
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
                textarea.value = editor.getValue();
                const save = form && form.querySelector('button[name="do[save]"], input[name="do[save]"]');
                if (save && form.requestSubmit) form.requestSubmit(save);
                else if (form) form.submit();
            });
            renderPreview();
        } catch (error) {
            shell.remove();
            textarea.dataset.monacoStarted = '';
            textarea.classList.remove('dw-monaco-source');
            console.error('DokuWiki Monaco failed to load:', error);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
}());
