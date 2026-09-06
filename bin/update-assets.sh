#!/usr/bin/env bash

set -euo pipefail

monaco_version='0.52.2'
marked_version='15.0.7'
dompurify_version='3.2.4'
codicons_version='0.0.45'

usage() {
    cat <<'EOF'
Usage: update-assets.sh [options]

Options:
  --monaco-version VERSION
  --marked-version VERSION
  --dompurify-version VERSION
  --codicons-version VERSION
  -h, --help
EOF
}

while (($#)); do
    case "$1" in
        --monaco-version|--marked-version|--dompurify-version|--codicons-version)
            if (($# < 2)); then
                echo "Missing value for $1" >&2
                exit 2
            fi
            case "$1" in
                --monaco-version) monaco_version=$2 ;;
                --marked-version) marked_version=$2 ;;
                --dompurify-version) dompurify_version=$2 ;;
                --codicons-version) codicons_version=$2 ;;
            esac
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

for command in curl tar mktemp; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "$command is required to update local Monaco assets." >&2
        exit 1
    fi
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
plugin_root=$(cd -- "$script_dir/.." && pwd -P)
vendor_path="$plugin_root/vendor"
temporary=$(mktemp -d "${TMPDIR:-/tmp}/dokuwiki-monaco.XXXXXX")
stage="$temporary/vendor"
mkdir -p -- "$stage"

cleanup() {
    rm -rf -- "$temporary"
}
trap cleanup EXIT

expand_package() {
    local package=$1
    local version=$2
    local safe_name=${package//@/}
    safe_name=${safe_name//\//-}
    local pack_directory="$temporary/$safe_name-pack"
    local extract_directory="$temporary/$safe_name-extract"
    local archive_name package_name

    mkdir -p -- "$pack_directory" "$extract_directory"
    package_name=${package##*/}
    archive_name="$package_name-$version.tgz"
    curl --fail --location --silent --show-error \
        "https://registry.npmjs.org/$package/-/$archive_name" \
        --output "$pack_directory/$archive_name"
    tar -xf "$pack_directory/$archive_name" -C "$extract_directory"
    printf '%s\n' "$extract_directory/package"
}

copy_package_licenses() {
    local package_directory=$1
    local destination=$2
    local license

    shopt -s nullglob
    for license in "$package_directory"/LICENSE*; do
        [[ -f "$license" ]] && cp -- "$license" "$destination/"
    done
    shopt -u nullglob
}

monaco_destination="$stage/monaco"
monaco_package=$(expand_package 'monaco-editor' "$monaco_version")
mkdir -p -- "$monaco_destination"
cp -R -- "$monaco_package/min/vs" "$monaco_destination/"
copy_package_licenses "$monaco_package" "$monaco_destination"

marked_destination="$stage/marked"
marked_package=$(expand_package 'marked' "$marked_version")
mkdir -p -- "$marked_destination"
cp -- "$marked_package/lib/marked.umd.js" "$marked_destination/"
copy_package_licenses "$marked_package" "$marked_destination"

dompurify_destination="$stage/dompurify"
dompurify_package=$(expand_package 'dompurify' "$dompurify_version")
mkdir -p -- "$dompurify_destination"
cp -- "$dompurify_package/dist/purify.min.js" "$dompurify_destination/"
copy_package_licenses "$dompurify_package" "$dompurify_destination"

codicons_destination="$stage/codicons"
codicons_package=$(expand_package '@vscode/codicons' "$codicons_version")
mkdir -p -- "$codicons_destination"
cp -- "$codicons_package/dist/codicon.css" "$codicons_package/dist/codicon.ttf" "$codicons_destination/"
copy_package_licenses "$codicons_package" "$codicons_destination"

printf '{\n  "monaco": "%s",\n  "marked": "%s",\n  "dompurify": "%s",\n  "codicons": "%s"\n}\n' \
    "$monaco_version" "$marked_version" "$dompurify_version" "$codicons_version" \
    > "$stage/versions.json"

rm -rf -- "$vendor_path"
mv -- "$stage" "$vendor_path"
echo "Updated local assets in $vendor_path"
