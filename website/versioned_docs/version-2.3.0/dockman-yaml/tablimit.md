---
sidebar_position: 2
---

# Stack Tab Limits

You can limit the number of tabs that can be opened on the **Stack** page.

## Configuration

Add a `tabLimit` key to your `.dockman.yml` file:

```yaml title=".dockman.yml"
tabLimit: 5 # max 5 tabs open
```

* `tabLimit` specifies the maximum number of tabs that can be open at the same time.
* If omitted, there is a default limit of 5 tabs.
