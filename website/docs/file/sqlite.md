---
title: SQLite Browser
sidebar_position: 1
---

# SQLite Browser

Dockman includes a 'built-in' SQLite browser so you can view and edit databases right in the file explorer.

## How it works

Under the hood, Dockman uses [sqlite-web](https://github.com/coleifer/sqlite-web), a Python-based SQLite GUI
by [@coleifer](https://github.com/coleifer). (Go show them some love!)

When you open a `.db` file:

1. Dockman spins up a container with sqlite-web
2. Mounts your database file
3. Embeds the UI in an iframe

You get a native-looking window just like any other file. Close the tab and the container auto-removes itself.

:::note
Only files ending in `.db` are supported at this time
:::

## Usage

Just click any `.db` file in the file explorer and it'll open automatically.

**Example:** Opening `myapp.db` to check user records or tweak settings.

![sqlite.png](img/sqlite.png)

:::warning
**Stop any containers using the database first!** Editing a DB while it's in use can corrupt your data. You've been
warned 😅
:::
