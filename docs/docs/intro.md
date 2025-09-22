---
sidebar_position: 0
title: Overview
---

## **Why Dockman**

I built Dockman to solve a workflow problem in my homelab. I never quite liked the other Docker management tools. None
of them matched the way I actually wanted to work.

Before Dockman, my setup was basically a folder full of Compose files that I manually scped around to my servers.
I also had a bunch of scripts to manage Docker, like cleaning up old images, updating stacks, and so on.

Dockman tries to remove that friction while keeping what worked. You get the comfort of your editor with easy deployment
to your homelab.

Dockman is not for everyone. I come from a heavily developer-focused background, I like my editor and my shortcuts.
Dockman is an attempt to recreate that experience, something like a dedicated IntelliJ or VS Code environment but for
Docker, which you will see in the design and shortcuts.

**Dockman is built for people who:**

* Edit configuration files directly rather than through GUI abstractions
* Value simplicity over comprehensive features
* Enjoy using keyboard shortcuts

If this matches your workflow, I'd appreciate a star. If not, let me know what's missing.

## Roadmap

### ✅ Completed

- **Version Control** - Built-in Git support that automatically tracks changes to your compose files and lets you easily
  roll back when things go wrong
    - Released: [v1.0](https://github.com/RA341/dockman/releases/tag/v1.0.0)

- **Multi-Host Support** - Deploy containers across multiple hosts while keeping everything managed from one place, with
  isolated configs per host
    - Released: [v1.1](https://github.com/RA341/dockman/releases/tag/v1.1.0)

### 📋 Planned

- **Editor LSP** - Smart autocompletion, syntax checking, formatter and custom Docker Compose helpers like port
  conflict detection and auto network setup

- **Smart Updater** - Built-in container update management that replaces watchtower and diun. Choose between
  auto-updates or just get notified when updates are available

- **Backup & Restore** - Complete backup and restore for your entire Docker setup, so you never lose
  your configs

Have ideas for new features?
[open an issue](https://github.com/RA341/dockman/issues/new) to share your suggestions!

## Getting Help

Need assistance? Open a [discussion on GitHub](https://github.com/RA341/dockman/discussions).
