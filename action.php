<?php

use dokuwiki\Extension\ActionPlugin;
use dokuwiki\Extension\EventHandler;
use dokuwiki\Extension\Event;

/**
 * Monaco editor integration.
 *
 * Rendering is implemented in script.js. This class passes the configured,
 * pinned asset locations to the browser.
 */
class action_plugin_monaco extends ActionPlugin
{
    public function register(EventHandler $controller): void
    {
        $controller->register_hook('TPL_METAHEADER_OUTPUT', 'BEFORE', $this, 'addPageFlag');
        $controller->register_hook('AJAX_CALL_UNKNOWN', 'BEFORE', $this, 'renderPreview');
    }

    /** Render previews through DokuWiki so installed syntax plugins are applied. */
    public function renderPreview(Event $event): void
    {
        if ($event->data !== 'plugin_monaco_preview') {
            return;
        }

        $event->preventDefault();
        $event->stopPropagation();

        global $ID, $INPUT;

        $page = cleanID($INPUT->post->str('id'));
        if (!$page || auth_quickaclcheck($page) < AUTH_READ) {
            http_response_code(403);
            return;
        }

        $source = $INPUT->post->str('wikitext');
        if (strlen($source) > 2 * 1024 * 1024) {
            http_response_code(413);
            return;
        }

        $previousId = $ID;
        $ID = $page;
        try {
            $info = [];
            header('Content-Type: text/html; charset=utf-8');
            echo p_render('xhtml', p_get_instructions($source), $info);
        } finally {
            $ID = $previousId;
        }
    }

    public function addPageFlag(Event $event): void
    {
        global $ACT;

        $action = is_array($ACT) ? key($ACT) : $ACT;
        if (!in_array($action, ['edit', 'preview'], true)) {
            return;
        }

        $source = $this->getConf('asset_source');
        if (!in_array($source, ['local', 'cdnjs', 'jsdelivr'], true)) {
            $source = 'local';
        }

        try {
            $assets = $this->assetConfig($source);
        } catch (RuntimeException $error) {
            error_log('DokuWiki Monaco: ' . $error->getMessage() . '; using local assets');
            $assets = $this->assetConfig('local');
        }
        $event->data['meta'][] = [
            'name' => 'dokuwiki-monaco-config',
            'content' => json_encode($assets, JSON_UNESCAPED_SLASHES),
        ];
    }

    private function assetConfig(string $source): array
    {
        $versions = [
            'monaco' => '0.52.2',
            'marked' => '15.0.7',
            'purify' => '3.2.4',
        ];
        $localRoot = DOKU_BASE . 'lib/plugins/monaco/vendor/';
        $codicons = ['src' => $localRoot . 'codicons/codicon.css'];

        if ($source === 'cdnjs') {
            $root = 'https://cdnjs.cloudflare.com/ajax/libs/';
            return [
                'source' => $source,
                'codicons' => $codicons,
                'monacoRoot' => $root . 'monaco-editor/' . $versions['monaco'] . '/min/vs',
                'monacoLoader' => $this->cdnAsset(
                    $root . 'monaco-editor/' . $versions['monaco'] . '/min/vs/loader.min.js',
                    $this->sriHash('cdnjs', 'monacoLoader')
                ),
                'monacoMain' => $this->cdnAsset(
                    $root . 'monaco-editor/' . $versions['monaco'] . '/min/vs/editor/editor.main.js',
                    $this->sriHash('cdnjs', 'monacoMain')
                ),
                'monacoCss' => $this->cdnAsset(
                    $root . 'monaco-editor/' . $versions['monaco'] . '/min/vs/editor/editor.main.css',
                    $this->sriHash('cdnjs', 'monacoCss')
                ),
                'marked' => $this->cdnAsset(
                    $root . 'marked/' . $versions['marked'] . '/marked.min.js',
                    $this->sriHash('cdnjs', 'marked')
                ),
                'purify' => $this->cdnAsset(
                    $root . 'dompurify/' . $versions['purify'] . '/purify.min.js',
                    $this->sriHash('cdnjs', 'purify')
                ),
            ];
        }

        if ($source === 'jsdelivr') {
            $root = 'https://cdn.jsdelivr.net/npm/';
            return [
                'source' => $source,
                'codicons' => $codicons,
                'monacoRoot' => $root . 'monaco-editor@' . $versions['monaco'] . '/min/vs',
                'monacoLoader' => $this->cdnAsset(
                    $root . 'monaco-editor@' . $versions['monaco'] . '/min/vs/loader.js',
                    $this->sriHash('jsdelivr', 'monacoLoader')
                ),
                'monacoMain' => $this->cdnAsset(
                    $root . 'monaco-editor@' . $versions['monaco'] . '/min/vs/editor/editor.main.js',
                    $this->sriHash('jsdelivr', 'monacoMain')
                ),
                'monacoCss' => $this->cdnAsset(
                    $root . 'monaco-editor@' . $versions['monaco'] . '/min/vs/editor/editor.main.css',
                    $this->sriHash('jsdelivr', 'monacoCss')
                ),
                'marked' => $this->cdnAsset(
                    $root . 'marked@' . $versions['marked'] . '/marked.min.js',
                    $this->sriHash('jsdelivr', 'marked')
                ),
                'purify' => $this->cdnAsset(
                    $root . 'dompurify@' . $versions['purify'] . '/dist/purify.min.js',
                    $this->sriHash('jsdelivr', 'purify')
                ),
            ];
        }

        $root = $localRoot;
        return [
            'source' => 'local',
            'codicons' => $codicons,
            'monacoRoot' => $root . 'monaco/vs',
            'monacoLoader' => ['src' => $root . 'monaco/vs/loader.js'],
            'monacoMain' => ['src' => $root . 'monaco/vs/editor/editor.main.js'],
            'monacoCss' => ['src' => $root . 'monaco/vs/editor/editor.main.css'],
            'marked' => ['src' => $root . 'marked/marked.umd.js'],
            'purify' => ['src' => $root . 'dompurify/purify.min.js'],
        ];
    }

    private function cdnAsset(string $src, string $integrity): array
    {
        return [
            'src' => $src,
            'integrity' => $integrity,
            'crossorigin' => 'anonymous',
        ];
    }

    private function sriHash(string $provider, string $asset): string
    {
        static $hashes;
        if ($hashes === null) {
            $path = __DIR__ . '/conf/sri.json';
            $hashes = json_decode((string) file_get_contents($path), true);
        }

        $hash = $hashes[$provider][$asset] ?? '';
        if (!is_string($hash) || strpos($hash, 'sha384-') !== 0) {
            throw new RuntimeException("Missing SRI hash for $provider/$asset");
        }
        return $hash;
    }
}
