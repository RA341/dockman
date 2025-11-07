---
sidebar_position: 0
title: Overview
---

## **Why Dockman**

I built Dockman to scratch an itch in my homelab. The existing Docker tools never really matched the way I like to work.

Before Dockman, I had a folder full of Compose files that I’d `scp` around to different servers, plus a pile of scripts
for things like cleaning up old images and updating stacks. It worked, but it always felt clunky. Every change meant
bouncing between terminals,
servers, and scripts. Nothing was terrible on its own, but together it added up to a lot of friction.

I tried other Docker management tools, but they never really clicked for me. Most leaned on heavy GUIs, lots of buttons
and menus,
and too much “magic” happening behind the scenes. I missed the simplicity of just editing a config file and deploying.

Dockman keeps the parts I liked, editing configs in my own editor, while taking away the annoyance of deployment.

It’s not meant to be for everyone. I’m a developer at heart, so I lean on my editor and my shortcuts. Dockman is my
attempt to bring that kind of workflow into Docker, something that feels a little like having IntelliJ or VS Code, but
tailored for Docker.

**Dockman is for people who:**

* Prefer editing configuration files directly instead of clicking through GUIs
* Care more about simplicity than having every feature under the sun
* Enjoy working fast with keyboard shortcuts

If that sounds like you, give it a star. If not, I’d still love to hear what you think is missing.

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
