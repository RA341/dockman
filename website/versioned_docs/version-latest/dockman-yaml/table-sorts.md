---
sidebar_position: 5
---

# Table Sorts

You can configure default table sorting for all views: **Containers**, **Images**, **Volumes**, and **Networks**.

## Usage

Each table has labeled columns.  
To set a default sort, specify:

- **field** -> must exactly match the column label (case-sensitive).
- **order** -> either
    - `asc` - ascending
    - `desc` - descending

:::info
Make sure the field name matches the label shown in the table header.
:::

![table-label.png](img/table-label.png)

## Example

```yaml title=".dockman.yml"
containers:
  sort:
    order: asc
    field: Status

networks:
  sort:
    order: desc
    field: Network Name

volumes:
  sort:
    order: desc
    field: Volume Name

images:
  sort:
    field: Size
    order: desc
```