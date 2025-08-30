---
title: Docker
sidebar_position: 0
---

### Docker Run

Try Dockman with this docker run command

:::warning
This quick-start command will **delete all dockman data** when the container stops. Use only for testing.

For a more persistent setup, see the [compose](#docker-compose) section below.
:::

```bash title="Bash"
docker run --rm -p 8866:8866 -v /var/run/docker.sock:/var/run/docker.sock ghcr.io/ra341/dockman:latest
```

Access at http://localhost:8866

### Docker Compose

:::info
The stacks directory path must be absolute and identical in all three locations:

* 1️⃣ Environment variable: `DOCKMAN_COMPOSE_ROOT=/path/to/stacks`
* 2️⃣ The host side of the volume `/path/to/stacks`
* 3️⃣ The container side of the volume `/path/to/stacks`
  This path consistency is essential for Dockman to locate and manage your compose files properly.

:::

```yaml title="docker-compose.yaml"
services:
  dockman:
    container_name: dockman
    image: ghcr.io/ra341/dockman:latest
    environment:
      # 1️⃣
      - DOCKMAN_COMPOSE_ROOT=/path/to/stacks
    volumes:
      #  2️⃣              3️⃣                
      - /path/to/stacks:/path/to/stacks
      - /path/to/dockman/config:/config
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8866:8866"
    restart: always
```

### Example with Real Path

Assuming `compose root` is stored at

```
/home/zaphodb/stacks
```

Replace `/path/to/stacks` with your directory path:

```yaml title="docker-compose.yaml"
services:
  dockman:
    container_name: dockman
    image: ghcr.io/ra341/dockman:latest
    environment:
      - DOCKMAN_COMPOSE_ROOT=/home/zaphodb/stacks
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /home/zaphodb/stacks:/home/zaphodb/stacks

      # never mount this dir in your stacks
      - /home/zaphodb/appdata/dockman/config:/config
    ports:
      - "8866:8866"
    restart: always
```

# Docker Tags

Dockman follows [semver](https://semver.org/) and tags its image as such.

You can pin a dockman version using specific version tags, Find all available
tags [here](https://github.com/RA341/dockman/pkgs/container/dockman/versions?filters%5Bversion_type%5D=tagged)

:::tip
Use `vX` for stability - guarantees your installation will always work

Use `latest` for newest features - may contain breaking changes requiring manual intervention
:::

### Tags

| Tag Pattern | Description                          | Example  | Recommended For                                              |
|-------------|--------------------------------------|----------|--------------------------------------------------------------|
| `vX.Y.Z`    | Exact version                        | `v1.2.0` | Pin (No updates)                                             |
| `vX.Y`      | Latest patch for minor version       | `v1.2`   | Bug fixes                                                    |
| `vX`        | Latest minor/patch for major version | `v1`     | New features                                                 |
| `latest`    | Latest stable release                | `latest` | Always get the latest updates (May contain breaking changes) |
| `canary`    | Development builds                   | `canary` | Contributing/testing unreleased features                     |

### Docker Compose Example

```yaml
services:
  dockman:
    image: ghcr.io/ra341/dockman:v1.2.0  # Pin to specific version
    container_name: dockman
    ports:
      - "8866:8866"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```
