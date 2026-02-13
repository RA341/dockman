---
title: Templates
sidebar_position: 1
---

Templates allow you to create custom file creation logic, powered by [Go templates](https://pkg.go.dev/text/template).

Use templates to bundle `docker-compose.yml` files, environment configurations, and initialization scripts into a single
reusable "stack" to get your applications started in seconds.

## Setup

1. Create a folder named `templates` in your project root.
2. Dockman automatically scans this folder for template files.

:::important
Dockman only reads **top-level files** within the `templates` folder. Subdirectories are currently ignored.
:::

## Extensions

Templates are plain text files. While you can use any extension, we recommend `.tmpl` for clarity. Dockman will process
the content regardless of the extension used.

## Generating Multiple Files

A single template can generate multiple output files using Go's `{{ define }}` blocks. This allows you to create a
directory structure (like a service folder and its config) from one single template file.

### Directory Context

Files are created **relative** to the folder where the creation dialog was opened. You do not need to specify absolute
paths.

Dockman will automatically create any missing subdirectories defined in your template.

If a file is found with the same name while running the template, it will be overwritten with the new content.

### Example

Below is an example of a template (`templates/web.tmpl`) that generates a service folder containing both a Compose file
and an `.env` file.

```
{{ define "$DIR$/compose.yml" }}
services:
  {{ .Name }}:
    image: {{ .Image }}
    restart: unless-stopped
    env_file: .env
    volumes:
      - {{ .Volume }}:/data
volumes:
  {{ .Volume }}: {}
{{ end }}

{{ define "$DIR$/.env" }}
PORT={{ .Port }}
APP_NAME={{ .Name }}
{{ end }}
```

### Syntax

There are two layers of logic in a Dockman template: **Path Placeholders** (for filenames) and **Go Template Logic** (
for file content).

### 1. Path Placeholders

Because Go Templates do not allow dynamic logic inside a `{{ define }}` statement, Dockman uses a placeholder syntax for
filenames.

* Use `$variable$` (e.g., `$DIR$`).
* Standard Go templating (like `{{ .Name }}`) **is not allowed** inside the `define` quotes.
* Dockman replaces these placeholders before rendering the file to disk.

### 2. File Body

Everything between the `{{ define "..." }}` and `{{ end }}` tags is the content of your file.

* Full [Go Template syntax](https://pkg.go.dev/text/template).
* You can access all application variables (e.g., `{{ .Name }}`, `{{ .Image }}`, `{{ .Port }}`).
* A define block can be empty if you simply want to create the file.
* Anything outside the `{{define}}`/`{{end}}` blocks is not parsed by Dockman. 
