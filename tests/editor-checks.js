(function () {
    'use strict';
    const results = document.getElementById('results');
    const errors = [];
    window.addEventListener('error', function (event) { errors.push(event.message); });
    window.addEventListener('unhandledrejection', function (event) { errors.push(String(event.reason)); });
    function assert(condition, message) {
        if (!condition) throw new Error(message);
        results.textContent += '\nPASS: ' + message;
    }
    async function until(predicate) {
        const deadline = performance.now() + 10000;
        while (!predicate()) {
            if (performance.now() > deadline) throw new Error('Timed out waiting for editor state');
            await new Promise(requestAnimationFrame);
        }
    }
    async function compareNativeDimensions(widget) {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:absolute;left:-10000px;width:1000px;height:600px';
        const stylesheet = new URL('../vendor/monaco/vs/editor/editor.main.css', location.href).href;
        frame.srcdoc = '<link rel="stylesheet" href="' + stylesheet + '"><body class="monaco-editor vs-dark"></body>';
        const loaded = new Promise(function (resolve) { frame.onload = resolve; });
        document.body.appendChild(frame);
        try {
            await loaded;
            const body = frame.contentDocument.body;
            body.style.fontFamily = getComputedStyle(widget).fontFamily;
            const copy = frame.contentDocument.importNode(widget, true);
            body.appendChild(copy);
            const actualInput = getComputedStyle(widget.querySelector('.quick-input-box input'));
            const nativeInput = frame.contentWindow.getComputedStyle(copy.querySelector('.quick-input-box input'));
            for (const property of ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing']) {
                assert(actualInput[property] === nativeInput[property], 'Picker input ' + property + ' matches native Monaco');
            }
            for (const selector of ['.quick-input-titlebar', '.quick-input-header', '.quick-input-box input', '.monaco-list-row', '.quick-input-list-entry', '.quick-input-list-label', '.monaco-keybinding-key']) {
                const actual = widget.querySelector(selector);
                const native = copy.querySelector(selector);
                if (actual && native) {
                    assert(Math.abs(actual.getBoundingClientRect().height - native.getBoundingClientRect().height) < 0.1,
                        selector + ' height matches unmodified Monaco CSS');
                }
            }
            const actualLabels = widget.querySelectorAll('.label-name');
            const nativeLabels = copy.querySelectorAll('.label-name');
            actualLabels.forEach(function (label, index) {
                const nativeLabel = nativeLabels[index];
                const row = label.closest('.monaco-list-row').getBoundingClientRect();
                const nativeRow = nativeLabel.closest('.monaco-list-row').getBoundingClientRect();
                const actualRange = document.createRange();
                actualRange.selectNodeContents(label);
                const nativeRange = frame.contentDocument.createRange();
                nativeRange.selectNodeContents(nativeLabel);
                const actualBounds = actualRange.getBoundingClientRect();
                const nativeBounds = nativeRange.getBoundingClientRect();
                assert(Math.abs((actualBounds.top - row.top) - (nativeBounds.top - nativeRow.top)) < 0.1 &&
                    Math.abs((row.bottom - actualBounds.bottom) - (nativeRow.bottom - nativeBounds.bottom)) < 0.1,
                    'Text alignment matches native row: ' + label.textContent);
            });
        } finally { frame.remove(); }
    }
    document.getElementById('run').addEventListener('click', async function () {
        this.disabled = true;
        results.textContent = 'Running…';
        try {
            await until(function () { return window.monaco && !document.querySelector('.dw-monaco-language').disabled; });
            const editor = monaco.editor.getEditors()[0];
            const model = editor.getModel();
            const shell = document.querySelector('.dw-monaco-shell');
            const indentation = shell.querySelector('.dw-monaco-indentation');
            const language = shell.querySelector('.dw-monaco-language');
            const quickInput = await new Promise(function (resolve) {
                window.require(['vs/editor/standalone/browser/standaloneServices', 'vs/platform/quickinput/common/quickInput'],
                    function (services, module) { resolve(services.StandaloneServices.get(module.IQuickInputService)); });
            });
            function currentPicker() { return quickInput.currentQuickInput; }
            async function picker(placeholder) {
                await until(function () { return currentPicker() && currentPicker().placeholder === placeholder; });
                return currentPicker();
            }
            function choose(input, id) {
                const item = input.items.find(function (candidate) { return candidate.id === id; });
                if (!item) throw new Error('Missing picker item: ' + id);
                input.activeItems = [item];
                input.selectedItems = [item];
                input.accept();
            }
            assert(!shell.querySelector('select') && !shell.querySelector('.dw-monaco-statusbar').textContent.includes('UTF-8'), 'Dropdown and encoding item removed');
            indentation.click();
            let input = await picker('Select action');
            assert(input.items.some(function (item) { return item.id === 'editor.action.indentationToTabs'; }), 'Native indentation action menu opens');
            await new Promise(requestAnimationFrame);
            const widget = shell.querySelector('.quick-input-widget');
            assert(getComputedStyle(widget.parentElement).backgroundColor === 'rgba(0, 0, 0, 0)' &&
                getComputedStyle(widget.parentElement).pointerEvents === 'none',
                'Picker host leaves editor content visible and interactive');
            assert(widget.querySelector('.quick-input-titlebar').getBoundingClientRect().height === 0, 'Untitled picker has no title-bar height under wiki styles');
            const inputElement = widget.querySelector('.quick-input-box input');
            assert(getComputedStyle(inputElement).boxSizing === 'border-box', 'Native input uses border-box dimensions');
            await compareNativeDimensions(widget);
            input.hide();
            assert(model.getOptions().tabSize === 2, 'Cancelling the menu preserves indentation');
            indentation.click();
            input = await picker('Select action');
            choose(input, 'editor.action.indentUsingSpaces');
            input = await picker('Select Tab Size for Current File');
            choose(input, '4');
            await until(function () { return indentation.textContent === 'Spaces: 4'; });
            assert(model.getOptions().tabSize === 4 && model.getOptions().insertSpaces, 'Native size picker updates model and status');
            indentation.click();
            input = await picker('Select action');
            choose(input, 'editor.action.indentUsingTabs');
            input = await picker('Select Tab Size for Current File');
            choose(input, '2');
            await until(function () { return indentation.textContent === 'Tab Size: 2'; });
            assert(!model.getOptions().insertSpaces, 'Tab indentation updates model and status');
            model.setValue('    first\n        second');
            model.updateOptions({tabSize: 4, insertSpaces: true});
            indentation.click();
            input = await picker('Select action');
            choose(input, 'editor.action.indentationToTabs');
            await until(function () { return model.getValue().startsWith('\tfirst'); });
            assert(model.getValue() === '\tfirst\n\t\tsecond', 'Native conversion changes leading whitespace');
            await model.undo();
            assert(model.getValue() === '    first\n        second', 'Indentation conversion can be undone');
            shell.querySelector('.dw-monaco-preview-pane-tab').click();
            language.click();
            input = await picker('Select Language Mode');
            assert(shell.querySelector('.dw-monaco-editor-pane').classList.contains('dw-monaco-active-tab'), 'Picker opens from preview by activating editor');
            choose(input, 'markdown');
            await until(function () { return language.textContent === 'Markdown'; });
            assert(model.getLanguageId() === 'markdown', 'Language picker changes model and status');
            await until(function () { return previewRequests.some(function (request) { return request.get('format') === 'markdown'; }); });
            assert(true, 'Language change refreshes preview with selected format');
            language.click();
            input = await picker('Select Language Mode');
            input.hide();
            assert(model.getLanguageId() === 'markdown', 'Cancelling language picker preserves mode');
            language.click();
            input = await picker('Select Language Mode');
            choose(input, 'dokuwiki');
            await until(function () { return language.textContent === 'DokuWiki'; });
            assert(model.getLanguageId() === 'dokuwiki', 'Language can switch back to DokuWiki');
            const workspace = shell.querySelector('.dw-monaco-workspace');
            const previousHeight = workspace.style.height;
            shell.querySelector('.dw-monaco-maximize').click();
            indentation.click();
            input = await picker('Select action');
            input.hide();
            shell.querySelector('.dw-monaco-maximize').click();
            assert(workspace.style.height === previousHeight, 'Picker works maximized and restore preserves saved height');
            model.setValue('====== Example ======\n  * First item\n  * Second item\n');
            model.updateOptions({tabSize: 2, indentSize: 2, insertSpaces: true});
            await editor.getAction('editor.action.quickCommand').run();
            await until(function () { return currentPicker(); });
            await new Promise(requestAnimationFrame);
            await compareNativeDimensions(widget);
            currentPicker().hide();
            const editorTab = shell.querySelector('.dw-monaco-editor-pane-tab');
            const previewTab = shell.querySelector('.dw-monaco-preview-pane-tab');
            const editorPane = shell.querySelector('.dw-monaco-editor-pane');
            const previewPane = shell.querySelector('.dw-monaco-preview-pane');
            const divider = shell.querySelector('.dw-monaco-resizer');
            async function checkPickerPosition() {
                await new Promise(requestAnimationFrame);
                const bounds = widget.getBoundingClientRect();
                const area = workspace.getBoundingClientRect();
                assert(Math.abs((bounds.left + bounds.right) / 2 - (area.left + area.right) / 2) < 1 &&
                    Math.abs(bounds.top - area.top) < 1 &&
                    Math.abs(bounds.width - Math.min(workspace.clientWidth * 0.62, 600)) < 1 &&
                    !widget.closest('.dw-monaco-pane'), 'Picker is centered and sized across the entire workspace');
            }
            function dragTab(tab, target, x, y, beforeDrop) {
                const dataTransfer = new DataTransfer();
                tab.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: dataTransfer}));
                const options = {bubbles: true, cancelable: true, dataTransfer: dataTransfer, clientX: x, clientY: y};
                target.dispatchEvent(new DragEvent('dragover', options));
                if (beforeDrop) beforeDrop();
                target.dispatchEvent(new DragEvent('drop', options));
                tab.dispatchEvent(new DragEvent('dragend', {bubbles: true, dataTransfer: dataTransfer}));
            }
            function centerDrop(tab, pane) {
                const content = pane.lastElementChild;
                const bounds = content.getBoundingClientRect();
                dragTab(tab, content, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, function () {
                    const overlay = getComputedStyle(pane, '::after');
                    const paneBounds = pane.getBoundingClientRect();
                    const contentBounds = content.getBoundingClientRect();
                    assert(overlay.display === 'block' && overlay.pointerEvents === 'none' &&
                        Math.abs(paneBounds.top + parseFloat(overlay.top) - contentBounds.top) < 1 &&
                        Math.abs(parseFloat(overlay.width) - contentBounds.width) < 1 &&
                        Math.abs(parseFloat(overlay.height) - contentBounds.height) < 1,
                        'Center hover shows an overlay covering the entire editor content');
                });
                assert(!shell.querySelector('[data-drop-edge]'), 'Center overlay clears after drop');
            }
            const sourceBeforeDrag = model.getValue();
            for (const tab of [editorTab, previewTab]) {
                editorTab.click();
                const order = Array.from(tab.parentElement.children);
                centerDrop(tab, editorPane);
                assert(!shell.classList.contains('dw-monaco-split') &&
                    order.every(function (item, index) { return tab.parentElement.children[index] === item; }),
                    'Center drop within a single group preserves layout and tab order');
            }
            for (const tab of [editorTab, previewTab]) {
                for (const edge of ['left', 'right', 'top', 'bottom']) {
                    editorTab.click();
                    const bounds = editorPane.getBoundingClientRect();
                    const x = edge === 'left' ? bounds.left + 10 : edge === 'right' ? bounds.right - 10 : bounds.left + bounds.width / 2;
                    const y = edge === 'top' ? bounds.top + 10 : edge === 'bottom' ? bounds.bottom - 10 : bounds.top + bounds.height / 2;
                    dragTab(tab, editorPane, x, y);
                    await new Promise(requestAnimationFrame);
                    const a = editorPane.getBoundingClientRect();
                    const b = previewPane.getBoundingClientRect();
                    const stacked = edge === 'top' || edge === 'bottom';
                    assert(a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 &&
                        (stacked ? Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) > 10 :
                            Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) > 10),
                        (tab === editorTab ? 'Active' : 'Inactive') + ' tab creates a ' + edge + ' split');
                    assert(divider.getAttribute('aria-orientation') === (stacked ? 'horizontal' : 'vertical'), 'Divider matches split direction');
                    for (const button of [indentation, language]) {
                        button.click();
                        await picker(button === indentation ? 'Select action' : 'Select Language Mode');
                        await checkPickerPosition();
                        currentPicker().hide();
                    }
                    await editor.getAction('editor.action.quickCommand').run();
                    await until(function () { return currentPicker(); });
                    await checkPickerPosition();
                    divider.dispatchEvent(new KeyboardEvent('keydown', {key: stacked ? 'ArrowDown' : 'ArrowRight', bubbles: true}));
                    await checkPickerPosition();
                    if (tab === previewTab && edge === 'bottom') {
                        shell.querySelector('.dw-monaco-maximize').click();
                        await new Promise(requestAnimationFrame);
                        await checkPickerPosition();
                        shell.querySelector('.dw-monaco-maximize').click();
                        await new Promise(requestAnimationFrame);
                        await checkPickerPosition();
                    }
                    currentPicker().hide();
                    assert(shell.querySelectorAll('.dw-monaco-tabstrip').length === 2 &&
                        !workspace.querySelector(':scope > .dw-monaco-tabstrip'), 'Split contains two group tab strips');
                    for (const [pane, ownTab] of [[editorPane, editorTab], [previewPane, previewTab]]) {
                        const ownStrip = pane.querySelector('.dw-monaco-tabstrip');
                        const stripBounds = ownStrip.getBoundingClientRect();
                        const paneBounds = pane.getBoundingClientRect();
                        assert(ownStrip.children.length === 1 && ownStrip.firstElementChild === ownTab &&
                            ownTab.getAttribute('aria-selected') === 'true' &&
                            Math.abs(stripBounds.left - paneBounds.left) < 1 &&
                            Math.abs(stripBounds.right - paneBounds.right) < 1 &&
                            Math.abs(stripBounds.top - paneBounds.top) < 1 &&
                            Math.abs(stripBounds.height - 35) < 1,
                            'Each split owns its tab and full-width tab strip');
                    }
                    const ownStrip = tab.parentElement;
                    const ownBounds = ownStrip.getBoundingClientRect();
                    dragTab(tab, ownStrip, ownBounds.right - 10, ownBounds.top + 10);
                    assert(shell.classList.contains('dw-monaco-split'), 'Dropping on the same group preserves split');
                    const strip = (tab === editorTab ? previewTab : editorTab).parentElement;
                    const stripBounds = strip.getBoundingClientRect();
                    dragTab(tab, strip, stripBounds.right - 10, stripBounds.top + 10);
                    assert(!shell.classList.contains('dw-monaco-split'), 'Dropping on tab strip restores tabs');
                    assert(shell.querySelectorAll('.dw-monaco-tabstrip').length === 1 &&
                        tab.parentElement.children.length === 2 && tab.parentElement.lastElementChild === tab &&
                        tab.getAttribute('aria-selected') === 'true', 'Transferred tab is selected and empty group is removed');
                }
            }
            for (const tab of [editorTab, previewTab]) {
                editorTab.click();
                let bounds = editorPane.getBoundingClientRect();
                dragTab(tab, editorPane, bounds.right - 10, bounds.top + bounds.height / 2);
                centerDrop(tab, tab === editorTab ? editorPane : previewPane);
                assert(shell.classList.contains('dw-monaco-split'), 'Center drop onto the source group preserves split');
                const otherPane = tab === editorTab ? previewPane : editorPane;
                centerDrop(tab, otherPane);
                assert(!shell.classList.contains('dw-monaco-split') && tab.parentElement.children.length === 2,
                    'Center drop transfers the tab and closes the empty group');
            }
            editorTab.click();
            assert(model.getValue() === sourceBeforeDrag, 'Tab dragging preserves document text');
            assert(errors.length === 0, 'No uncaught errors: ' + errors.join('; '));
            results.textContent += '\nAll checks passed.';
        } catch (error) {
            results.textContent += '\nFAIL: ' + error.message;
            console.error(error);
        } finally {
            this.disabled = false;
        }
    });
}());
