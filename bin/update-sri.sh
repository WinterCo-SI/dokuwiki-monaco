#!/usr/bin/env bash

set -euo pipefail

for command in curl openssl mktemp wc; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "$command is required to update the SRI manifest." >&2
        exit 1
    fi
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
plugin_root=$(cd -- "$script_dir/.." && pwd -P)
manifest_path="$plugin_root/conf/sri.json"
temporary=$(mktemp -d "${TMPDIR:-/tmp}/dokuwiki-monaco-sri.XXXXXX")

cleanup() {
    rm -rf -- "$temporary"
}
trap cleanup EXIT

providers=(cdnjs jsdelivr)
assets=(monacoLoader monacoMain monacoCss marked purify)
cdnjs_urls=(
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/loader.min.js'
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/editor/editor.main.js'
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/editor/editor.main.css'
    'https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.7/marked.min.js'
    'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.4/purify.min.js'
)
jsdelivr_urls=(
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js'
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/editor/editor.main.js'
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/editor/editor.main.css'
    'https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js'
    'https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js'
)

manifest="$temporary/sri.json"
printf '{\n' > "$manifest"

for provider_index in "${!providers[@]}"; do
    provider=${providers[$provider_index]}
    printf '  "%s": {\n' "$provider" >> "$manifest"

    if [[ "$provider" == 'cdnjs' ]]; then
        urls=("${cdnjs_urls[@]}")
    else
        urls=("${jsdelivr_urls[@]}")
    fi

    for asset_index in "${!assets[@]}"; do
        asset=${assets[$asset_index]}
        url=${urls[$asset_index]}
        download="$temporary/$provider-$asset"
        curl --fail --location --silent --show-error \
            --user-agent 'dokuwiki-monaco-sri-updater/1.0' \
            --output "$download" "$url"

        size=$(wc -c < "$download")
        if ((size < 1000)); then
            echo "Downloaded file is unexpectedly small: $url" >&2
            exit 1
        fi

        digest=$(openssl dgst -sha384 -binary "$download" | openssl base64 -A)
        comma=','
        if ((asset_index == ${#assets[@]} - 1)); then
            comma=''
        fi
        printf '    "%s": "sha384-%s"%s\n' "$asset" "$digest" "$comma" >> "$manifest"
        echo "Hashed $provider/$asset"
    done

    comma=','
    if ((provider_index == ${#providers[@]} - 1)); then
        comma=''
    fi
    printf '  }%s\n' "$comma" >> "$manifest"
done

printf '}\n' >> "$manifest"
mv -- "$manifest" "$manifest_path"
echo "Updated $manifest_path"
