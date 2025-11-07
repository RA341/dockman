---
sidebar_position: 2
title: Legacy
---

# Legacy Configuration (Deprecated)

**Migration from hosts.yaml:**

For users coming from v1, following are the steps to miagrate away from hosts.yaml

1. Remove the `./hosts.yaml:/app/config/hosts.yaml` volume mount from docker-compose
2. Remove the `./config/ssh/` volume mount from docker-compose
3. Reconfigure your hosts through the web UI

```yaml title="docker-compose.yaml"
 # docker compose sample
 name: dockman
 services:
   dockman:
     container_name: dockman
     image: ghcr.io/ra341/dockman:latest
     environment:
       - DOCKMAN_COMPOSE_ROOT=/path/to/stacks
     volumes:
       # these mounts can now be removed
       # - ./config/ssh:/app/config/ssh
       # - ./hosts.yaml:/app/config/hosts.yaml

       # 4️⃣ NEW: Mount config directory for database storage
       # DO NOT store this in dockman compose root
       - /path/to/dockman/config:/config
     ports:
       - "8866:8866"
     restart: always
```
