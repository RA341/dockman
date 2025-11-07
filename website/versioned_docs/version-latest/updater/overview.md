---
title: Overview
sidebar_position: 1
---

:::warning
Dockman updater is only available on ```ghcr.io/ra341/dockman:main``` tag only
and is currently in testing expect bugs
:::

Dockman provides a Docker container and image updater, serving as a complete replacement for
Watchtower.

### Features

- **Automated Updates**: Keep your containers running the latest versions automatically
- **Flexible Notification System**: Choose to receive notifications about updates or run silently
- **Smart Rollback**: Automatically rollback containers when updates fail or cause issues
- **Watchtower Replacement**: Drop-in replacement with enhanced functionality

### Update Options

* **Notify Only**: Receive alerts about available updates without automatic deployment
* **Auto-Update**: Automatically pull and deploy new container versions on a configurable schedule
* **Manual Update**: Update containers directly through the web UI

#### Rollback Protection

Dockman includes built-in safety mechanisms to protect against failed updates:

**Health Check Monitoring**

* Configure HTTP endpoint monitoring to verify container health after updates
* Set a custom endpoint that Dockman will ping X seconds after container startup
* Automatic rollback triggers if the health check fails

**Runtime Stability Checks**

* Define minimum runtime requirements for containers
* Example: Container must run continuously for 5 minutes post-update
* Automatic rollback to previous configuration if stability threshold isn't met
* Notifications sent for all rollback events

These safety features ensure your services remain stable and minimize downtime during updates.
