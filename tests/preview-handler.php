<?php
// Run with: php tests/preview-handler.php
namespace dokuwiki\Extension {
    class ActionPlugin {}
    class Event {
        public $data = 'plugin_monaco_preview';
        public static $calls = 0;
        public static $fail = false;
        public function preventDefault() {}
        public function stopPropagation() {}
        public static function createAndTrigger($name, &$html, $default) {
            \check($name === 'TPL_CONTENT_DISPLAY', 'Native content-display event');
            \check($GLOBALS['ACT'] === 'preview', 'Preview action available to handlers');
            \check($GLOBALS['INFO']['id'] === 'test:page', 'Requested page context');
            self::$calls++;
            if (self::$fail) throw new \RuntimeException('handler failed');
            // A template handler changes the fragment before the default output action.
            $html = str_replace('class="table"', 'class="table-responsive"', $html);
            $default($html);
        }
    }
}
namespace {
    use dokuwiki\Extension\Event;
    function check($condition, $message) {
        if (!$condition) throw new RuntimeException($message);
    }
    const AUTH_READ = 1;
    function cleanID($id) { return $id; }
    function auth_quickaclcheck($id) { return AUTH_READ; }
    function pageinfo() { return ['id' => $GLOBALS['ID']]; }
    function p_get_instructions($source) { return $source; }
    function p_render($format, $source, &$info) {
        return '<div class="table"><table class="inline"><tr><td>Cell</td></tr></table></div>';
    }
    require __DIR__ . '/../action.php';
    $INPUT = (object) ['post' => new class {
        public function str($key) { return $key === 'id' ? 'test:page' : '| Cell |'; }
    }];
    $conf = ['template' => 'dokuwiki'];
    $ID = 'original';
    $ACT = 'edit';
    $INFO = ['original' => true];
    $plugin = new action_plugin_monaco();
    ob_start();
    $plugin->renderPreview(new Event());
    $output = ob_get_clean();
    check(strpos($output, 'table-responsive') !== false, 'Transformed output returned');
    check(strpos($output, '<div class="preview"><div class="pad">') === 0, 'Native preview containers');
    check(Event::$calls === 1, 'Handler called once');
    check($ID === 'original' && $ACT === 'edit' && $INFO === ['original' => true], 'Context restored');
    Event::$fail = true;
    try {
        $plugin->renderPreview(new Event());
        throw new RuntimeException('Expected handler failure');
    } catch (RuntimeException $error) {
        check($error->getMessage() === 'handler failed', 'Expected failure propagated');
    }
    check($ID === 'original' && $ACT === 'edit' && $INFO === ['original' => true], 'Context restored after failure');
    echo "Preview handler checks passed\n";
}
