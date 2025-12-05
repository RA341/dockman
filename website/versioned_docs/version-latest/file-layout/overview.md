---
title: Overview
sidebar_position: 0
---

Dockman keeps things simple with a flat-ish structure that makes sense for homelab setups.

### The Rules

- **No nested folders** - You can create folders in the root directory, but that's it. No folders inside folders.
- **Think startup-only** - Any file in dockman should only be needed when your containers start up. Think
  `compose.yaml`, `.env` files, and initial config files.
- **Keep data separate** - Application data like databases, logs, or user-generated content doesn't belong here. Mount
  those elsewhere.

### The Philosophy

Your compose setup should be a clean collection of:

- Core `compose.yaml` files
- Supporting `.env` files
- configuration files

That's it. If your container needs to write to it after startup, it probably doesn't belong in dockman.

### Example Structure

```
stacks/
├── .env # a global .env file that can be read by all compose files 
├── nextcloud/
│   ├── compose.yaml
│   ├── .env
│   └── config.php
├── traefik/
│   ├── compose.yaml
│   └── traefik.yml
└── media-compose.yaml # this file does not require any supporting files so it is placed at root
```

Think this is too limiting? Open an [issue](https://github.com/RA341/dockman/issues) and we can argue about it.
