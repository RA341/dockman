---
sidebar_position: 0
title: Overview
---

## **Why Dockman**

I built Dockman out of my need, the need for speed!, I wanted a compose focused docker management tool that
deployed with the simplicity of a terminal command and edited via text.

No deeply nested menus and buttons, no Enterprise™ features, no paywalls, everything accessible and managed via a simple
focused WebUI and my keyboard.

I tried other Docker management tools, but they never really clicked for me. Most leaned on heavy GUIs, lots of buttons
and menus, and too much “magic” happening behind the scenes. I missed the simplicity of just editing a config file and
deploying.

Dockman is for people who know their way around Docker and prefer working directly with text, no abstractions, no
distractions. If that's you, you'll feel right at home.

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
