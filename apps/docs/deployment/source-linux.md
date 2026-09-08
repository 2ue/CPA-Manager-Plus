# Linux 源码部署（CPA + CPAMP）

本文适用于在一台 Debian/Ubuntu Linux 服务器上，从源码部署：

- `CLIProxyAPI（CPA）`：模型 API 网关和凭证运行时。
- `CPA-Manager-Plus（CPAMP）`：完整管理面板、用量监控和 SQLite 数据服务。

本文不使用 CPA 或 CPAMP 的预构建镜像。前端、Go 后端和 CPA 二进制都在目标 Linux 主机上构建。

## 部署边界

建议为本实例使用独立的服务用户、目录、端口、systemd 单元和数据文件。下面的示例使用：

```text
安装根目录：/opt/cpa178
CPA 服务：  cpa178.service
CPAMP 服务：cpamp178.service
CPA API：  127.0.0.1:18371
CPAMP 面板：127.0.0.1:18372
SQLite：   /opt/cpa178/cpamp/data/usage.sqlite
```

端口可以按服务器现状调整。若服务器已有数据库、Redis、Caddy 或 Nginx，不要复用它们的容器、网络、卷、配置目录或端口。

CPAMP 默认使用 SQLite，不需要 Redis 才能运行。只有在明确需要独立 Redis 监控队列时，才部署本文末尾的可选 Compose 项目。

## 前置条件

目标主机需要：

- Debian 12/13、Ubuntu 22.04/24.04 或兼容的 systemd Linux。
- `git`、`curl`、`ca-certificates`、`build-essential`。
- Go 1.26 或更高版本（当前 CPA 源码 `go.mod` 要求 Go 1.26；CPAMP Manager Server 要求 Go 1.24）。
- Node.js 与 npm，建议使用 Node.js 22 LTS 或仓库 CI 使用的兼容版本。
- root 权限或可以执行 `sudo`。
- CPA 使用的 Claude/OAuth 凭证由实际账号所有者提供；本文不会生成或伪造第三方凭证。

检查架构：

```bash
uname -m
```

常见结果 `x86_64` 对应 Go 的 `linux/amd64`，`aarch64` 对应 `linux/arm64`。

## 安装构建工具

以下示例适用于 Debian/Ubuntu。安装前先检查服务器已有版本，避免覆盖现有运行时。

```bash
apt-get update
apt-get install -y ca-certificates curl git build-essential jq rsync
```

如果系统没有满足要求的 Go 或 Node.js，请按组织的标准软件源安装。安装后确认：

```bash
go version
node --version
npm --version
```

不要把构建工具安装到 CPA 的运行目录，也不要把 `node_modules`、构建缓存或源码中的密钥复制到生产数据目录。

## 创建独立用户和目录

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

推荐把源码放在单独的发布目录，例如 `/opt/src` 或 CI 工作区；运行目录只保留经过验证的二进制、配置、凭证和数据。若直接把源码放在 `/opt/cpa178/cpamp/src`，也必须确保运行用户不能写入二进制目录。

## 获取源码

将本地工作树或受信任的 Git 版本同步到目标主机。CPAMP 当前工作树包含页面改造，不能只从默认分支重新 clone 而遗漏未提交改动。

示例：

```bash
install -d -m 0755 /opt/src
git clone --depth 1 <CLIProxyAPI 仓库地址> /opt/src/CLIProxyAPI
git clone --depth 1 <CPA-Manager-Plus 仓库地址> /opt/src/CPA-Manager-Plus
```

如果使用 `rsync` 从开发机同步当前工作树，请排除运行数据和依赖目录：

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

执行 `rsync --delete` 前必须确认目标路径只包含本实例源码；不要把它指向 `/opt/cpa178/cpa` 或 `/opt/cpa178/cpamp/data`。

## 构建 CPA

```bash
cd /opt/src/CLIProxyAPI
go mod download
CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' \
  -o /opt/cpa178/cpa/bin/cli-proxy-api ./cmd/server
chown root:cpa178 /opt/cpa178/cpa/bin/cli-proxy-api
chmod 0750 /opt/cpa178/cpa/bin/cli-proxy-api
```

CPA 从当前工作目录读取 `config.yaml`。因此服务的 `WorkingDirectory` 必须固定为 `/opt/cpa178/cpa`，并且配置中的 `auth-dir` 使用绝对路径 `/opt/cpa178/cpa/auths`。

## CPA 配置与补丁优化

创建 `/opt/cpa178/cpa/config.yaml` 时，只保留一份唯一的 YAML 根键。不要把补丁文件的内容直接追加到已有配置文件末尾；例如已有 `streaming:` 时再次追加 `streaming:` 会导致 `yaml: mapping key "streaming" already defined`。

推荐的针对性配置如下。`os`、`arch`、`timezone` 必须描述真实使用客户端或实际部署策略，不能为了规避风控伪造成他人的设备画像：

```yaml
host: "127.0.0.1"
port: 18371

auth-dir: "/opt/cpa178/cpa/auths"
api-keys:
  - "在 secrets/cpa-client-api-key 中保存的随机 API key"

remote-management:
  allow-remote: false
  secret-key: "在 secrets/cpa-management-key 中保存的随机管理 key"
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

说明：

- `stabilize-device-profile` 固定 CPA 的请求头设备画像，不会替凭证创建 `claude_device_ids`。
- `cloak_cache_user_id` 是逐个 Claude 凭证的属性，应在真实凭证添加后通过 CPAMP 页面批量启用；不要直接改写非 Claude 或插件虚拟凭证。
- keepalive 只用于减少反向代理或中间网络的空闲断开，不是封禁规避机制。
- `disable-cooling: false` 保留失败凭证冷却保护。排查模型支持情况时临时关闭，测试后必须恢复。
- `remote-management.allow-remote: false` 适合 CPAMP 与 CPA 同机部署：CPAMP 通过 `127.0.0.1` 连接 CPA。只有跨主机连接时才开启，并同时使用防火墙和反向代理访问控制。

生成配置前准备三个独立随机值：

```bash
umask 077
openssl rand -hex 32 > /opt/cpa178/secrets/cpa-client-api-key
openssl rand -hex 32 > /opt/cpa178/secrets/cpa-management-key
openssl rand -hex 32 > /opt/cpa178/secrets/cpamp-admin-key
chown root:cpa178 /opt/cpa178/secrets/*
chmod 0640 /opt/cpa178/secrets/*
```

不要把这些值提交到 Git、写入文档、命令历史或公开截图。CPA 的 API key 与 Management Key 不是同一个凭证。

## 构建 CPAMP 前端和 Manager Server

CPAMP Manager Server 会嵌入 `management.html`。源码部署必须先构建前端，再把单文件产物复制到 Go 的 embed 路径，然后构建 Manager Server：

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

前端全量测试可能受浏览器全局或既有认证 store 的超时影响。发布前至少应确认类型检查、lint 无错误、生产构建、CPAMP Manager Server 测试和本次配置页面聚焦测试通过；全量测试中的失败必须单独记录，不能伪称全部通过。

## systemd 服务

### CPA

创建 `/etc/systemd/system/cpa178.service`：

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

创建 `/etc/systemd/system/cpamp178.service`：

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

创建只允许服务用户读取的 `/opt/cpa178/secrets/cpamp.env`：

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

CPAMP 会把 CPA Management Key 加密保存到 `data/usage.sqlite`，加密密钥保存在 `data/data.key`。这两个文件必须作为一组备份；不要把数据库文件放到服务器已有 Postgres 或 Redis 的数据目录中。

## 首次访问与连接

如果没有配置反向代理，面板只监听本机回环地址。通过 SSH 隧道访问：

```bash
ssh -L 18372:127.0.0.1:18372 root@server
```

然后打开：

```text
http://127.0.0.1:18372/management.html
```

使用 `cpamp-admin-key` 登录。若使用 CPAMP setup，CPA URL 填 `http://127.0.0.1:18371`，CPA Management Key 填 `cpa-management-key` 文件中的值。部署完成后应优先通过 CPAMP 页面添加实际 OAuth 账户，再在账户页批量开启 `cloak_cache_user_id`。

## 反向代理和公网地址

服务器已有 Caddy/Nginx 时，先读取现有站点配置、证书和端口占用，再新增独立域名或路径。不要覆盖默认站点，也不要把 CPA 的管理接口直接暴露到公网。

推荐：

- CPAMP 管理面板使用独立域名，反向代理到 `127.0.0.1:18372`，并增加访问控制。
- CPA API 使用独立域名，反向代理到 `127.0.0.1:18371`，仅开放需要的 API 路径。
- RESP 采集必须连接 CPA 的直连端口，不能连接只支持 HTTP 的反向代理地址。

如果没有域名，继续使用 SSH 隧道，不要为了“有访问地址”而把管理端口裸露到公网。生产环境的公网 URL、TLS 和防火墙规则必须根据目标机现有 Caddy 配置确定。

## 可选：隔离 Redis Compose

CPAMP 本地 SQLite 和 CPA 内存用量队列通常不需要 Redis。只有确认版本和采集模式需要独立 Redis 时，创建单独目录：

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

此 Compose 项目不发布宿主机端口，不加入已有 Compose 网络，不使用已有 Redis 容器和卷。若 CPA 需要访问它，必须把 CPA 也明确加入 `cpa178-private` 网络；不要仅凭主机端口或容器名称猜测连接关系。完成测试后，记录 `docker compose -p cpa178-redis ps` 和网络成员，确认没有跨项目共享。

## 健康检查、日志和备份

```bash
systemctl status cpa178 cpamp178 --no-pager
journalctl -u cpa178 -n 100 --no-pager
journalctl -u cpamp178 -n 100 --no-pager
curl -fsS http://127.0.0.1:18371/healthz
curl -fsS http://127.0.0.1:18372/health
curl -fsS http://127.0.0.1:18372/usage-service/info
```

备份 CPAMP 时停止 Manager Server 或使用一致性快照，并同时保存：

```text
/opt/cpa178/cpamp/data/usage.sqlite
/opt/cpa178/cpamp/data/usage.sqlite-wal
/opt/cpa178/cpamp/data/usage.sqlite-shm
/opt/cpa178/cpamp/data/data.key
/opt/cpa178/secrets/cpamp-admin-key
/opt/cpa178/secrets/cpa-management-key（若仍由 env 管理）
```

CPA 的 `auths/` 也应单独加密备份。凭证备份不要放回 `auth-dir`，否则 CPA 可能把 `.bak` 文件当作新的凭证扫描。

## 升级与回滚

1. 记录当前 Git commit、二进制 SHA-256 和配置备份。
2. `systemctl stop cpamp178 cpa178`。
3. 备份 CPAMP 的 SQLite、WAL/SHM、`data.key`、CPA `config.yaml` 和 `auths/`。
4. 在新发布目录构建二进制，完成类型检查、测试和健康检查。
5. 原子替换 `bin/` 中的二进制，保留旧文件用于回滚。
6. 启动 CPA，再启动 CPAMP，检查 `/healthz`、`/health` 和 `/status`。
7. 若失败，停止服务并恢复上一版本二进制和配置；不要删除数据目录或 `data.key`。

配置修改应先复制备份并用 CPA 的 YAML 解析器验证，确保每个根键只出现一次。看到 `config successfully reloaded` 和 `auth file changed` 后，再进行业务请求验证。
