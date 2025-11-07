---
title: Overview
sidebar_position: 1
---

The **`.dockman.yaml`** file is an optional configuration file that allows you to customize your Dockman instance.
Use it to define how your instance behaves, looks, and feels.

## Creating the Configuration File

To start using Dockman, create a `.dockman.yaml` or `.dockman.yml` file in your compose root directory.

By default, Dockman looks for this file in the root of your compose root.
For example, if your `DOCKMAN_COMPOSE_ROOT` is set to `/home/zaphodb/stacks`,
Dockman will look for:

```
/home/zaphodb/stacks/.dockman.yaml
```

or

```
/home/zaphodb/stacks/.dockman.yml
```

### Custom Path

You can set a custom path by defining the `DOCKMAN_DOCK_YAML` environment
variable ([see how to set environment variables](../install/env.md)).

* If the path starts with `/`, it is considered an **absolute path**.
* If the path does **not** start with `/`, it is considered **relative to the compose root**.

#### Examples

**Default path (no environment variable set):**

```
DOCKMAN_COMPOSE_ROOT=/home/zaphodb/stacks
# Dockman looks for:
/home/zaphodb/stacks/.dockman.yaml
```

**Absolute path example:**

```
DOCKMAN_DOCK_YAML=/opt/configs/mydockman.yaml
# Dockman looks for:
/opt/configs/mydockman.yaml
```

**Relative path example:**

```
DOCKMAN_DOCK_YAML=dockman/.dockman.yml
# Dockman looks for:
/home/zaphodb/stacks/dockman/.dockman.yml
```
