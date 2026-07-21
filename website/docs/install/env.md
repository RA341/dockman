---
title: Environment Variables
sidebar_position: 999
---

Dockman can be customized through environment variables to suit your preferences.

When you launch a Dockman instance, a detailed **information table** will automatically appear in the logs. This
table provides:

| Config Names | Current Values | Descriptions | Environment Variable |
|--------------|----------------|--------------|----------------------|

**To see all available configuration options for your specific version, refer to this table in the logs.**

:::tip **Example Logs**
![Environment Variables Table](./img/env.png)
:::

## Setting Environment Variables

You can set environment variables directly in your compose file or import them via a .env file:

### **Environment:**

```yaml title="docker-compose.yaml"
dockman:
  image: ghcr.io/ra341/dockman:latest
  environment:
    - DOCKMAN_COMPOSE_ROOT=/home/docker/stacks
    - DOCKMAN_AUTH_ENABLE=true
```

## Temporarily allowing Exec into Dockman

Interactive Exec sessions into a container built from the Dockman image are blocked by default. This protects the
configuration and credentials mounted inside Dockman. To enable self-Exec temporarily for troubleshooting, add:

```yaml title="docker-compose.yaml"
dockman:
  environment:
    DOCKMAN_ALLOW_SELF_EXEC: "true"
```

Recreate the Dockman container for the setting to take effect. Remove the variable (or set it to `false`) and recreate
the container again as soon as troubleshooting is complete. Exec into other managed containers is unaffected.

### **Environment File:**

```bash title="dockman.env"

DOCKMAN_COMPOSE_ROOT=/home/docker/stacks
DOCKMAN_AUTH_ENABLE=true
DOCKMAN_AUTH_USERNAME=test
DOCKMAN_AUTH_PASSWORD=wow
```

```yaml title="docker-compose.yaml"
dockman:
  image: ghcr.io/ra341/dockman:latest
  env_file:
    - ./dockman.env
```
