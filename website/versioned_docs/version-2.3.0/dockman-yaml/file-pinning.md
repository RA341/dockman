---
sidebar_position: 2
---

# Pinning folders/files

You can pin specific files or directories to appear at the top of your file list for quick access.

The specified files and directories will appear at the top of your file list, followed by the normal
alphabetical sorting.

Add a `pinnedFiles` section with the names of files or directories you want to pin:

```yaml title=".dockman.yml"
pinnedFiles:
  router: 1 # <- indicates priority
  media: 2
  arr-compose.yaml: 3
```

With the configuration above, your file list will show:

```
1. router/ (pinned)
2. media/ (pinned)
3. arr-compose.yaml (pinned)
4. Other files in normal sort order
```
