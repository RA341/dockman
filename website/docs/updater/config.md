---
title: Setup
sidebar_position: 0
---

:::warning
Dockman updater is only available on ```ghcr.io/ra341/dockman:main``` tag only
and is currently in testing expect bugs
:::

## Configure updater

TODO

### Disable updates

You can disable updates for specific containers by adding the label

```yaml
labels:
  dockman.update.disable=true
```
