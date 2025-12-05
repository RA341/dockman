---
title: Docker Socket Proxy
---

# Docker Socket Proxy

This section outlines how to configure Dockman with a Docker socket proxy for enhanced security and fine-grained control
over Docker API access.

:::info
This is community-sourced documentation from [this issue](https://github.com/RA341/dockman/issues/) and may contain
mistakes. Feel free to make corrections as needed.

Huge thanks to [cerede2000](https://github.com/cerede2000) for figuring out the permissions required and for providing
the examples.
:::

## Overview

Docker socket proxies provide a security layer between Dockman and the Docker daemon by:

- Restricting which Docker API operations are available
- Enabling read-only container filesystems
- Allowing remote access with fine-tuned permissions

## Basic Configuration

Dockman natively supports the `DOCKER_HOST` environment variable. To use a socket proxy, simply set:

In your dockman config

```yaml
environment:
  - DOCKER_HOST=tcp://dockmanProxy:2375
```

## Complete Example Setup

Here's a full working configuration using the LinuxServer socket proxy:

```yaml
services:
  dockman:
    container_name: dockman
    image: ghcr.io/ra341/dockman:canary
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs: [ "/tmp" ]
    healthcheck:
      test: wget --no-verbose --tries=1 --spider http://localhost:8866/ || exit 1
      interval: 5s
      timeout: 5s
      retries: 3
    env_file: [ '../.env' ]
    environment:
      - DOCKMAN_COMPOSE_ROOT=/server/stacks
      - DOCKMAN_MACHINE_ADDR=${HOST_IP}
      - DOCKER_HOST=tcp://dockmanProxy:2375
    volumes:
      - ${DATA_PATH}/dockman/config:/config
      - /server/stacks:/server/stacks
    ports:
      - 8866:8866
    restart: always
    pull_policy: always
    labels:
      - com.centurylinklabs.watchtower.enable=true

  dockmanProxy:
    image: lscr.io/linuxserver/socket-proxy:latest
    container_name: dockmanProxy
    healthcheck:
      test: wget --spider http://localhost:2375/version || exit 1
      interval: 5s
      timeout: 2s
      retries: 3
    env_file: [ '../.env' ]
    environment:
      LOG_LEVEL: info # debug,info,notice,warning,err,crit,alert,emerg

      # Base permissions
      PING: 1
      VERSION: 1
      INFO: 1
      EVENTS: 1

      # Resources required by Dockman
      CONTAINERS: 1
      IMAGES: 1
      NETWORKS: 1
      VOLUMES: 1
      EXEC: 1

      # Write operations (create, start/stop, pull, prune, etc.)
      POST: 1
      SYSTEM: 1

      # Container lifecycle controls
      ALLOW_START: 1
      ALLOW_STOP: 1
      ALLOW_RESTARTS: 1

      # Disabled by default (enable only if needed)
      AUTH: 0
      BUILD: 0        # Set to 1 to build images via Dockman
      COMMIT: 0       # Set to 1 to commit containers as images
      CONFIGS: 0
      DISTRIBUTION: 0
      NODES: 0
      PLUGINS: 0
      SERVICES: 0
      SESSION: 0
      SWARM: 0
      TASKS: 0
      SECRETS: 0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    tmpfs:
      - /run:rw,uid=${SUID},gid=${GUID},mode=0755
      - /tmp:rw,mode=1777
      - /var/lib/haproxy:rw,uid=${SUID},gid=${GUID},mode=0755
    security_opt:
      - no-new-privileges:true
    read_only: true
    cap_drop:
      - ALL
    user: ${SUID}:${GUID}
    group_add:
      - 990
    expose:
      - 2375
    restart: unless-stopped
    labels:
      com.centurylinklabs.watchtower.enable: true  
```

## Alternative Socket Proxy Images

The community has successfully tested these socket proxy images:

- `lscr.io/linuxserver/socket-proxy:latest` (shown above)
- `tecnativa/docker-socket-proxy:latest`
- `need4swede/socket-proxy:latest`

## Understanding Permissions

### Critical: POST Permission

The `POST: 1` environment variable is **required** for write operations. Without it, only GET and HEAD operations are
allowed, which means Dockman cannot:

- Start or stop containers
- Create or modify resources
- Execute compose operations

According to the Docker API documentation, operations like Start, Stop, and Restart all require the POST method.

### Read-Only Container Filesystem

Setting `read_only: true` on the proxy container makes its **internal filesystem** read-only. This is a security best
practice and does **not** affect which Docker API operations are permitted. Permissions are controlled exclusively by
environment variables.

### Minimum Required Permissions for Dockman

```yaml
# Base
PING: 1
VERSION: 1
INFO: 1
EVENTS: 1

# Resources
CONTAINERS: 1
IMAGES: 1
NETWORKS: 1
VOLUMES: 1
EXEC: 1

# Operations
POST: 1
SYSTEM: 1

# Lifecycle
ALLOW_START: 1
ALLOW_STOP: 1
ALLOW_RESTARTS: 1
```

## Troubleshooting

### Error: "ConnectError: [unknown] compose stop operation failed"

This error typically occurs when:

1. `POST: 1` is not set (write operations are disabled)
2. Container lifecycle permissions are missing (`ALLOW_START`, `ALLOW_STOP`, `ALLOW_RESTARTS`)

**Solution:** Ensure all minimum required permissions are set as shown above.

### Proxy Not Accessible

If Dockman cannot reach the proxy:

1. Verify both containers are on the same Docker network
2. Check the proxy container name matches the `DOCKER_HOST` value
3. Ensure the proxy's healthcheck is passing
4. Review proxy logs for connection errors

## Additional Resources

- [Docker Engine API Reference](https://docs.docker.com/reference/api/engine/)
- [LinuxServer Docker Socket Proxy](https://github.com/linuxserver/docker-socket-proxy)
- [Tecnativa Docker Socket Proxy](https://github.com/Tecnativa/docker-socket-proxy)