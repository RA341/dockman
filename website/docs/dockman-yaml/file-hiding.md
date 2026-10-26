---
sidebar_position: 2
---

## Hiding folders/files

To hide entries from the file browser, add an `ignoredFiles` section with the names of files or directories you want to exclude from the listing:

```yaml title=".dockman.yml"
ignoredFiles:
  - .git
  - .bashrc
  - assets
```

Any file or directory whose name matches an entry in `ignoredFiles` will not appear in the UI.
