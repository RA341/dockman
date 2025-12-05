---
title: Environment variables
---

# Environment Variables

This section outlines the various ways **Dockman** handles and loads environment variables for your services defined in
a `docker-compose.yml` file.

Understanding these distinctions is crucial for configuring your application secrets and
runtime settings.

-----

## Primary Distinctions for Loading

There are two primary methods for loading environment variables, each with a different scope and mechanism:

### 1. Direct Environment Files (`env_file`)

This method loads **all variables** from the specified file directly into the container's environment when it starts.

* **Mechanism:** Docker Compose uses the `env_file` key to specify one or more paths to environment files. The file
  contents are parsed, and every variable is made available inside the running container.
* **Use Case:** Ideal for configurations that don't need to be visible or used in the `docker-compose.yml` file itself (
  e.g., a long list of application-specific settings).

<!-- end list -->

```yaml
services:
  app:
    # Loads ALL variables from './some.env.file' directly into the 'app' container
    env_file:
      - ./some.env.file
```

### 2. Compose Interpolation (Variable Substitution)

This method is used to substitute variables **within the `docker-compose.yml` file** before it is sent to the Docker
daemon.

* **Mechanism:** Variables are referenced using the `${VARIABLE_NAME}` syntax (e.g.,
  `db_password: ${postgres_password}`). Docker Compose replaces these references with the actual value found in the host
  environment or a pre-loaded `.env` file **before** starting the container.
* **Use Case:** Necessary when a variable needs to configure the **Compose file itself** (e.g., setting a container
  image tag, a port number, or assigning a secret to a specific environment key).

<!-- end list -->

```yaml
services:
  db:
    image: postgres:${PG_VERSION} # Interpolates the image tag
    environment:
      # Interpolates the value found for 'POSTGRES_PASSWORD'
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

-----

## How Dockman Loads Interpolation Variables

For variables used in Compose Interpolation (method 2), **Dockman** follows a specific hierarchy to determine the value
for `${VARIABLE_NAME}`.

### Automatic `.env` File Loading

**Dockman** automatically looks for and loads variables from a `.env` file to supply values for interpolation. The
lookup follows a "closest-first" principle:

1. **Prioritized `.env`:** **Dockman** will always prioritize and load the `.env` file located in the **same directory
   as the `compose.yml` file.**
2. **Fallback `.env`:** If a variable is not found in the closest `.env` file, **Dockman** will then search for and load
   the `.env` file in the **parent directory** (or the project root).

This ensures that configuration specific to a nested setup overrides general project-level settings.

:::important
Only files named **`.env`** will be used in compose interpolation

The file name **CANNOT** be changed.
:::

>
**Example Scenario:**

```
.env (Project Root: PG_PORT=420, DATA=/data/)
folder
  | .env (Local: e.g., PG_PORT=6969, APP_MODE=dev)
  | inner-compose.yml
outer-compose.yml (cannot access APP_MODE)
```

If `inner-compose.yml` access PG_PORT, Dockman will use the
value from `.env` file found in the current dir

```yaml title="inner-compose.yml"
services:
  db:
    environment:
      PORT: ${PG_PORT} # will be 6969
      OUT: ${DATA} # can still access /data/ from the outer .env
```

outer compose can access normal

```yaml title="outer-compose.yml"
services:
  db:
    environment:
      PORT: ${PG_PORT} # will be 420
      OUT: ${DATA}
```
