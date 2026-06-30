# Developer corporate / antivirus root CAs

Drop your machine's TLS-intercepting root CA here as a PEM file ending in
`.crt` (for example `corp-root-ca.crt`). The dev swarm image
(`docker/dev/Dockerfile.ubuntu-swarm`) copies everything in this folder into
the container trust store and runs `update-ca-certificates` at build time, and
Node is started with `--use-system-ca` so `pnpm`/`corepack` honor it.

## Why this is needed

Some networks (corporate proxies, or antivirus like Kaspersky / Zscaler /
Bitdefender doing "HTTPS scanning") intercept TLS and present their own root CA.
Your Windows host already trusts it, but the Linux build container does not, so
`pnpm install` inside the container fails while resolving packages with:

```
GET https://registry.npmjs.org/... (SELF_SIGNED_CERT_IN_CHAIN)
[ERR_PNPM_META_FETCH_FAIL] ... fetch failed
```

The `pnpm`/`corepack` metadata fetch uses `undici`, which ignores
`NODE_TLS_REJECT_UNAUTHORIZED`, `strict-ssl=false` and even
`NODE_EXTRA_CA_CERTS`. Adding the CA to the system trust store plus
`--use-system-ca` is the only reliable fix through such a proxy.

## How to export your root CA

Files here (except this README and `.gitkeep`) are git-ignored because the CA is
specific to each developer's machine.

### Quick way (any OS, from a working host)

```sh
openssl s_client -connect registry.npmjs.org:443 -showcerts </dev/null 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/{c++} c==2,/END CERTIFICATE/' \
  > docker/dev/certs/corp-root-ca.crt
```

(Adjust `c==2` if your proxy presents more intermediates; you want the final,
self-signed root.)

### Windows (export the trusted root from the cert store)

PowerShell — find your interceptor's root (Kaspersky shown) and export it:

```powershell
Get-ChildItem Cert:\LocalMachine\Root |
  Where-Object Subject -match 'Kaspersky|Zscaler|Proxy' |
  ForEach-Object {
    [IO.File]::WriteAllText(
      "docker/dev/certs/corp-root-ca.crt",
      "-----BEGIN CERTIFICATE-----`n" +
      [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks') +
      "`n-----END CERTIFICATE-----`n")
  }
```

After adding or changing a cert, rebuild the image:

```sh
npm run dev:swarm   # builds with --build
```
