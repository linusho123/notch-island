#!/bin/sh
# scripts/signing.sh: prints the codesign arguments every local build signs
# with, one line each: --sign, the identity, --keychain, its keychain.
#
# macOS remembers Automation consent ("NotchIsland wants to control Music")
# against an app's signature. An ad hoc signature changes with every build, so
# each rebuild asked again; one self-signed identity kept across builds lets an
# Allow given once stick. The identity lives in a keychain of its own (never
# the login keychain) that holds nothing else, so its password can sit here.
# Falls back to ad hoc signing ("--sign -") if the identity can't be made.
set -u
KC="$HOME/Library/Keychains/notch-island-dev.keychain-db"
PW=notch-island-dev
NAME="notch-island dev"

make_identity() {
  tmp=$(mktemp -d) || return 1
  cat > "$tmp/req.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
  /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$tmp/req.cnf" \
    -keyout "$tmp/key.pem" -out "$tmp/cert.pem" >/dev/null 2>&1 &&
  /usr/bin/openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" \
    -out "$tmp/id.p12" -passout "pass:$PW" >/dev/null 2>&1 &&
  security create-keychain -p "$PW" "$KC" >/dev/null 2>&1 &&
  security set-keychain-settings "$KC" &&
  security import "$tmp/id.p12" -k "$KC" -P "$PW" -T /usr/bin/codesign >/dev/null 2>&1 &&
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PW" "$KC" >/dev/null 2>&1
  rc=$?
  rm -rf "$tmp"
  return $rc
}

if [ ! -f "$KC" ] && ! make_identity; then
  rm -f "$KC"
  printf '%s\n' --sign -
  exit 0
fi
security unlock-keychain -p "$PW" "$KC" >/dev/null 2>&1
# codesign only finds identities in the search list: add this keychain after
# whatever is there, never dropping an entry.
if ! security list-keychains -d user | grep -q "notch-island-dev.keychain-db"; then
  eval "set -- $(security list-keychains -d user | tr '\n' ' ')"
  security list-keychains -d user -s "$@" "$KC"
fi
printf '%s\n' --sign "$NAME" --keychain "$KC"
