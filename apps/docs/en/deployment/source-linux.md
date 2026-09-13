# Linux Source Deployment (CPA + CPAMP)

This guide covers deploying from source on a single Debian/Ubuntu Linux server:

- `CLIProxyAPI (CPA)`: the model API gateway and credential runtime.
- `CPA-Manager-Plus (CPAMP)`: the full management panel, usage monitoring, and SQLite data service.

It does not use prebuilt images for CPA or CPAMP. The frontend, the Go backend, and the CPA binary are all built on the target Linux host.

## Deployment Boundaries

Use a dedicated service user, directory, port, systemd unit, and data file for this instance. The examples below use:

```text
Install root: /opt/cpa178
CPA service:  cpa178.service
CPAMP service: cpamp178.service
CPA API:      127.0.0.1:18371
CPAMP panel:  127.0.0.1:18372
SQLite:       /opt/cpa178/cpamp/data/usage.sqlite
```

Adjust the ports to match the server. If the server already runs a database, Redis, Caddy, or Nginx, do not reuse their containers, networks, volumes, configuration directories, or ports.

CPAMP uses SQLite by default and does not need Redis to run. Only deploy the optional Compose project at the end of this guide if you specifically need a separate Redis monitoring queue.

## Prerequisites

The target host needs:

- Debian 12/13, Ubuntu 22.04/24.04, or a compatible systemd Linux.
- `git`, `curl`, `ca-certificates`, `build-essential`.
- Go 1.26 or later (the current CPA `go.mod` requires Go 1.26; the CPAMP Manager Server requires Go 1.24).
- Node.js and npm — Node.js 22 LTS, or a compatible version matching the repository CI, is recommended.
- root privileges or the ability to run `sudo`.
- Claude/OAuth credentials supplied by the actual account owner. This guide does not generate or forge third-party credentials.

Check the architecture:

```bash
uname -m
```

`x86_64` maps to Go's `linux/amd64`; `aarch64` maps to `linux/arm64`.

## Install Build Tools

The examples below target Debian/Ubuntu. Check the versions already present on the server before installing, so you do not overwrite an existing runtime.

```bash
apt-get update
apt-get install -y ca-certificates curl git build-essential jq rsync
```

If the system lacks a suitable Go or Node.js, install it from your organization's standard package source. Verify afterwards:

```bash
go version
node --version
npm --version
```

Do not install build tools into CPA's runtime directory, and do not copy `node_modules`, build caches, or source-tree secrets into the production data directory.

## Create a Dedicated User and Directories

```bash
useradd --system --home-dir /opt/cpa178 --shell /usr/sbin/nologin cpa178 || true
install -d -o cpa178 -g cpa178 -m 0750 \
  /opt/cpa178 \
  /opt/cpa178/cpa/bin \
  /opt/cpa178/cpa/auths \
  /opt/cpa178/cpa/logs \
  /opt/cpa178/cpa/run \
  /opt/cpa178/cpamp/bin \
  /opt/cpa178/cpamp/data \
  /opt/cpa178/cpamp/src
install -d -o root -g cpa178 -m 0750 /opt/cpa178/secrets
```

Keep the source in a separate release directory such as `/opt/src` or a CI workspace. The runtime directory should hold only verified binaries, configuration, credentials, and data. If you do place the source directly in `/opt/cpa178/cpamp/src`, make sure the service user cannot write to the binary directory.

## Obtain the Source

Sync your local working tree, or a trusted Git revision, to the target host. The current CPAMP working tree contains page changes, so re-cloning the default branch alone would omit uncommitted work.

Example:

```bash
install -d -m 0755 /opt/src
git clone --depth 1 <CLIProxyAPI repository URL> /opt/src/CLIProxyAPI
git clone --depth 1 <CPA-Manager-Plus repository URL> /opt/src/CPA-Manager-Plus
```

If you use `rsync` to sync the current working tree from a development machine, exclude runtime data and dependency directories:

```bash
rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude data \
  --exclude auths \
  --exclude logs \
  /path/to/CLIProxyAPI/ root@server:/opt/src/CLIProxyAPI/

rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  /path/to/CPA-Manager-Plus/ root@server:/opt/src/CPA-Manager-Plus/
```

Before running `rsync --delete`, confirm the destination path contains only this instance's source. Never point it at `/opt/cpa178/cpa` or `/opt/cpa178/cpamp/data`.

## Build CPA

```bash
cd /opt/src/CLIProxyAPI
go mod download
CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' \
  -o /opt/cpa178/cpa/bin/cli-proxy-api ./cmd/server
chown root:cpa178 /opt/cpa178/cpa/bin/cli-proxy-api
chmod 0750 /opt/cpa178/cpa/bin/cli-proxy-api
```

CPA reads `config.yaml` from the current working directory. The service `WorkingDirectory` must therefore be pinned to `/opt/cpa178/cpa`, and `auth-dir` in the configuration must use the absolute path `/opt/cpa178/cpa/auths`.

## CPA Configuration and Targeted Tuning

When creating `/opt/cpa178/cpa/config.yaml`, keep exactly one instance of each YAML root key. Do not append the contents of a patch file to the end of an existing configuration: appending a second `streaming:` when one already exists produces `yaml: mapping key "streaming" already defined`.

A recommended targeted configuration follows. `os`, `arch`, and `timezone` must describe the client you actually use or your real deployment policy — do not forge someone else's device profile to evade risk controls:

```yaml
host: "127.0.0.1"
port: 18371

auth-dir: "/opt/cpa178/cpa/auths"
api-keys:
  - "a random API key stored in secrets/cpa-client-api-key"

remote-management:
  allow-remote: false
  secret-key: "a random management key stored in secrets/cpa-management-key"
  disable-auto-update-panel: true

usage-statistics-enabled: true
redis-usage-queue-retention-seconds: 60
disable-cooling: false
nonstream-keepalive-interval: 15

streaming:
  keepalive-seconds: 15

claude-header-defaults:
  user-agent: "claude-cli/2.1.220 (external, cli)"
  package-version: "0.94.0"
  runtime-version: "v26.3.0"
  os: "Linux"
  arch: "x64"
  timeout: "600"
  timezone: "Asia/Shanghai"
  stabilize-device-profile: true
```

Notes:

- `stabilize-device-profile` pins the device profile in CPA's request headers. It does not create `claude_device_ids` on your behalf.
- `cloak_cache_user_id` is a per-Claude-credential attribute. Enable it in bulk from the CPAMP page after the real credentials have been added; do not apply it to non-Claude or plugin virtual credentials.
- Keepalive only reduces idle disconnects from reverse proxies or intermediate networks. It is not a ban-evasion mechanism.
- `disable-cooling: false` keeps the cooldown protection for failing credentials. Turn it off only temporarily while investigating model support, and restore it after testing.
- `remote-management.allow-remote: false` suits a co-located CPAMP and CPA deployment, where CPAMP reaches CPA over `127.0.0.1`. Enable it only for cross-host connections, and pair it with firewall and reverse-proxy access control.

Prepare three independent random values before generating the configuration:

```bash
umask 077
openssl rand -hex 32 > /opt/cpa178/secrets/cpa-client-api-key
openssl rand -hex 32 > /opt/cpa178/secrets/cpa-management-key
openssl rand -hex 32 > /opt/cpa178/secrets/cpamp-admin-key
chown root:cpa178 /opt/cpa178/secrets/*
chmod 0640 /opt/cpa178/secrets/*
```

Never commit these values to Git or place them in documentation, shell history, or public screenshots. CPA's API key and its Management Key are not the same credential.

## Build the CPAMP Frontend and Manager Server

The CPAMP Manager Server embeds `management.html`. A source deployment must build the frontend first, copy the single-file artifact to the Go embed path, and only then build the Manager Server:

```bash
cd /opt/src/CPA-Manager-Plus
npm ci
npm run type-check
npm run lint
npm run build
npm run manager-server:test

cp apps/web/dist/index.html \
  apps/manager-server/internal/httpapi/web/management.html

cd apps/manager-server
go mod download
CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' \
  -o /opt/cpa178/cpamp/bin/cpa-manager-plus ./cmd/cpa-manager-plus

chown root:cpa178 /opt/cpa178/cpamp/bin/cpa-manager-plus
chmod 0750 /opt/cpa178/cpamp/bin/cpa-manager-plus
```

The full frontend test suite can be affected by browser globals or timeouts in an existing auth store. Before releasing, confirm at minimum that type checking and lint pass without errors, that the production build succeeds, and that the CPAMP Manager Server tests and the focused configuration-page tests pass. Any failures in the full suite must be recorded individually — do not claim everything passed.

## systemd Services

### CPA

Create `/etc/systemd/system/cpa178.service`:

```ini
[Unit]
Description=CLIProxyAPI CPA (cpa178)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cpa178
Group=cpa178
WorkingDirectory=/opt/cpa178/cpa
ExecStart=/opt/cpa178/cpa/bin/cli-proxy-api -config /opt/cpa178/cpa/config.yaml
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/cpa178/cpa
Environment=HOME=/opt/cpa178/cpa

[Install]
WantedBy=multi-user.target
```

### CPAMP

Create `/etc/systemd/system/cpamp178.service`:

```ini
[Unit]
Description=CPA Manager Plus Manager Server (cpamp178)
After=network-online.target cpa178.service
Wants=network-online.target

[Service]
Type=simple
User=cpa178
Group=cpa178
WorkingDirectory=/opt/cpa178/cpamp
ExecStart=/opt/cpa178/cpamp/bin/cpa-manager-plus
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/cpa178/cpamp
Environment=HTTP_ADDR=127.0.0.1:18372
Environment=USAGE_DATA_DIR=/opt/cpa178/cpamp/data
Environment=USAGE_DB_PATH=/opt/cpa178/cpamp/data/usage.sqlite
Environment=CPA_MANAGER_DATA_KEY_PATH=/opt/cpa178/cpamp/data/data.key
EnvironmentFile=-/opt/cpa178/secrets/cpamp.env

[Install]
WantedBy=multi-user.target
```

Create `/opt/cpa178/secrets/cpamp.env`, readable only by the service user:

```dotenv
CPA_MANAGER_ADMIN_KEY_FILE=/opt/cpa178/secrets/cpamp-admin-key
CPA_UPSTREAM_URL=http://127.0.0.1:18371
CPA_MANAGEMENT_KEY_FILE=/opt/cpa178/secrets/cpa-management-key
USAGE_COLLECTOR_MODE=auto
USAGE_RESP_QUEUE=usage
USAGE_RESP_POP_SIDE=right
USAGE_BATCH_SIZE=100
USAGE_POLL_INTERVAL_MS=500
USAGE_QUERY_LIMIT=50000
```

```bash
chown root:cpa178 /opt/cpa178/secrets/cpamp.env
chmod 0640 /opt/cpa178/secrets/cpamp.env
chmod 0640 /opt/cpa178/secrets/cpa-management-key /opt/cpa178/secrets/cpamp-admin-key
chown cpa178:cpa178 /opt/cpa178/cpamp/data
systemctl daemon-reload
systemctl enable --now cpa178.service cpamp178.service
```

CPAMP stores the CPA Management Key encrypted inside `data/usage.sqlite`, with the encryption key in `data/data.key`. Back up both files together, and do not place the database in the data directory of an existing Postgres or Redis instance.

## First Access and Connection

Without a reverse proxy, the panel listens only on the loopback address. Reach it over an SSH tunnel:

```bash
ssh -L 18372:127.0.0.1:18372 root@server
```

Then open:

```text
http://127.0.0.1:18372/management.html
```

Log in with `cpamp-admin-key`. In CPAMP setup, set the CPA URL to `http://127.0.0.1:18371` and the CPA Management Key to the value in the `cpa-management-key` file. Once deployed, add the real OAuth accounts through the CPAMP page first, then enable `cloak_cache_user_id` in bulk from the accounts page.

## Reverse Proxy and Public Addresses

If the server already runs Caddy or Nginx, read the existing site configuration, certificates, and port assignments before adding a new domain or path. Do not overwrite the default site, and do not expose CPA's management interface directly to the internet.

Recommended:

- Serve the CPAMP management panel on its own domain, reverse-proxied to `127.0.0.1:18372`, with access control.
- Serve the CPA API on its own domain, reverse-proxied to `127.0.0.1:18371`, exposing only the API paths you need.
- RESP collection must connect to CPA's direct port, not to an HTTP-only reverse-proxy address.

Without a domain, keep using the SSH tunnel. Do not expose the management port to the internet merely to have a reachable URL. Production public URLs, TLS, and firewall rules must be derived from the target machine's existing Caddy configuration.

## Optional: Isolated Redis Compose

CPAMP's local SQLite and CPA's in-memory usage queue usually make Redis unnecessary. Only if you have confirmed that your version and collection mode require a separate Redis, create a dedicated directory:

```bash
install -d -o root -g root -m 0750 /opt/cpa178/redis
cat >/opt/cpa178/redis/compose.yaml <<'YAML'
services:
  cpa178-redis:
    image: redis:8-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--save", "900", "1"]
    volumes:
      - cpa178-redis-data:/data
    networks: [cpa178-private]
    expose: ["6379"]

volumes:
  cpa178-redis-data:
    name: cpa178-redis-data

networks:
  cpa178-private:
    name: cpa178-private
    driver: bridge
YAML

cd /opt/cpa178/redis
docker compose -p cpa178-redis up -d
```

This Compose project publishes no host ports, joins no existing Compose network, and reuses no existing Redis container or volume. If CPA needs to reach it, explicitly add CPA to the `cpa178-private` network — do not infer connectivity from host ports or container names. After testing, record `docker compose -p cpa178-redis ps` and the network members to confirm nothing is shared across projects.

## Health Checks, Logs, and Backups

```bash
systemctl status cpa178 cpamp178 --no-pager
journalctl -u cpa178 -n 100 --no-pager
journalctl -u cpamp178 -n 100 --no-pager
curl -fsS http://127.0.0.1:18371/healthz
curl -fsS http://127.0.0.1:18372/health
curl -fsS http://127.0.0.1:18372/usage-service/info
```

When backing up CPAMP, stop the Manager Server or use a consistent snapshot, and save all of the following together:

```text
/opt/cpa178/cpamp/data/usage.sqlite
/opt/cpa178/cpamp/data/usage.sqlite-wal
/opt/cpa178/cpamp/data/usage.sqlite-shm
/opt/cpa178/cpamp/data/data.key
/opt/cpa178/secrets/cpamp-admin-key
/opt/cpa178/secrets/cpa-management-key (if still managed through env)
```

CPA's `auths/` should also be backed up separately and encrypted. Do not restore credential backups into `auth-dir`, or CPA may scan the `.bak` files as new credentials.

## Upgrade and Rollback

1. Record the current Git commit, the binary SHA-256, and a configuration backup.
2. Run `systemctl stop cpamp178 cpa178`.
3. Back up CPAMP's SQLite database, WAL/SHM files, `data.key`, CPA's `config.yaml`, and `auths/`.
4. Build the binaries in a new release directory, completing type checks, tests, and health checks.
5. Atomically replace the binaries in `bin/`, keeping the old files for rollback.
6. Start CPA, then CPAMP, and check `/healthz`, `/health`, and `/status`.
7. On failure, stop the services and restore the previous binaries and configuration. Do not delete the data directory or `data.key`.

Configuration changes should be copied to a backup and validated with CPA's YAML parser first, confirming that each root key appears exactly once. Verify with real requests only after you see `config successfully reloaded` and `auth file changed`.
