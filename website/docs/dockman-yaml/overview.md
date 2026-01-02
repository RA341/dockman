---
title: Overview
sidebar_position: 1
---

The **`.dockman.yaml`** file is an optional configuration file for customizing your Dockman instance's behavior,
appearance, and functionality.

## Configuration File Location

### Version 3+

Dockman automatically manages configuration files. YAML files are stored at:

```
path/to/config/dockyaml/<host>.dockman.yml
```

Edit the host-specific configuration by clicking the YAML button in the file list toolbar:

![dockm](./img/dock-file-actions.png)

### Version 2

Create a `.dockman.yaml` or `.dockman.yml` file in your compose root directory.

**Default location:**

Dockman searches for the configuration file in your compose root. For example, with
`DOCKMAN_COMPOSE_ROOT=/home/zaphodb/stacks`:

```
/home/zaphodb/stacks/.dockman.yaml
```

**Custom location:**

Override the default path using the `DOCKMAN_DOCK_YAML` environment variable ([configuration guide](../install/env.md)):

- **Absolute paths** start with `/`
- **Relative paths** are relative to the compose root

**Examples:**

```bash
# Default (no custom path set)
DOCKMAN_COMPOSE_ROOT=/home/zaphodb/stacks
# → /home/zaphodb/stacks/.dockman.yaml

# Absolute path
DOCKMAN_DOCK_YAML=/opt/configs/mydockman.yaml
# → /opt/configs/mydockman.yaml

# Relative path
DOCKMAN_DOCK_YAML=dockman/.dockman.yml
# → /home/zaphodb/stacks/dockman/.dockman.yml
```
