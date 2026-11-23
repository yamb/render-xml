#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_PATH:?GitHub Actions PATH file is required}"
root="$(mktemp -d "${RUNNER_TEMP:?GitHub Actions temporary directory is required}/yamb-xml.XXXXXX")"
snapshot=https://snapshot.ubuntu.com/ubuntu/20261121T000000Z/pool/main/libx/libxml2
version=2.15.2+dfsg-0.1ubuntu0.3

while read -r package checksum; do
  archive="${package}_${version}_amd64.deb"
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --connect-timeout 5 --max-time 20 --output "$root/$archive" "$snapshot/$archive"
  digest="$(sha256sum "$root/$archive")"
  if [[ "${digest%% *}" != "$checksum" ]]; then
    echo "SHA-256 mismatch for $archive" >&2
    exit 1
  fi
done <<'PACKAGES'
libxml2-16 e82ce35fd61483c1febf83232e76e54a296a6a78391983a24a904ff640b75c09
libxml2-utils d1460f47f8af98d0a6cf0fec787d0bb4ec8485331791afc8903fe469c9e56cea
PACKAGES

for archive in "$root"/*.deb; do
  dpkg-deb --extract "$archive" "$root"
done

mkdir -p "$root/bin"
cat > "$root/bin/xmllint" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
LD_LIBRARY_PATH="$root/usr/lib/x86_64-linux-gnu" exec "$root/usr/bin/xmllint" "$@"
WRAPPER
chmod +x "$root/bin/xmllint"
"$root/bin/xmllint" --version
printf '%s\n' "$root/bin" >> "$GITHUB_PATH"
