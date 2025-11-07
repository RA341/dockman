---
title: Healthchecks
sidebar_position: 2
---

## Update Healthchecks

### Container Uptime Check

The container stability check verifies that a running container has maintained the minimum required uptime after waiting
for a specified duration.

If the container crashes, restarts, or summons eldritch horrors, dockman rolls back to the old container.

Basically prevents the classic "it works on my machine... oh wait, it just died" scenario.

> [!CAUTION]
> Be careful when using longer times here as it will pause
> the update process until the uptime requirements are met,
> especially when running via the UI, you dont want to see a loading spinner for 1 hour

#### Behavior

* Skips if label missing or time invalid.
* Waits for the specified uptime duration.
* Passes if the container stays running.
* Fails if the container crashes/restarts → triggers rollback + notification.

#### Labels

> [!IMPORTANT]
> The `uptime` value uses Go's [time.ParseDuration](https://pkg.go.dev/time#ParseDuration) format,
> See [usage examples](#valid-duration-examples) for more info

```yaml
dockman.update.healthcheck.uptime=<uptime>
```

#### Examples

```yaml
labels:
  # Wait for 30 seconds of uptime
  dockman.update.healthcheck.uptime=30s
  # Wait for 2 hours and 30 minutes
  dockman.update.healthcheck.uptime=2h30m
```

### Container Ping Check

This health check pings a container after a specified delay using labels.
If the configured endpoint returns a `2xx` status code, the update is considered successful.

#### Labels

* **`dockman.update.healthcheck.ping`** – HTTP endpoint to ping.
* **`dockman.update.healthcheck.time`** – Delay before ping ([Valid Duration Examples](#valid-duration-examples)).

#### Behavior

1. Skips check if endpoint missing or time invalid.
2. Waits for the given duration.
3. Sends `GET` request to endpoint.
4. Passes only on `2xx` responses.
5. Rolls back container to old image if it fails

#### Example

```yaml
labels:
  dockman.update.healthcheck.ping: "http://localhost:8080/health"
  dockman.update.healthcheck.time: "30s"
```

### Valid Duration Examples

GoDoc: [time.ParseDuration](https://pkg.go.dev/time#ParseDuration) format

- **Units**: `ns`, `us` (or `µs`), `ms`, `s`, `m`, `h`
- **Format**: Decimal numbers with optional fractions and unit suffixes
- **Examples**: `300ms`, `1.5h`, `2h45m`, `30s`

| Duration String | Description                        |
|-----------------|------------------------------------|
| `30s`           | 30 seconds                         |
| `5m`            | 5 minutes                          |
| `1h`            | 1 hour                             |
| `2h30m`         | 2 hours and 30 minutes             |
| `1h10m10s`      | 1 hour, 10 minutes, and 10 seconds |
| `500ms`         | 500 milliseconds                   |
| `1.5h`          | 1.5 hours (90 minutes)             |

- Negative durations (e.g., `-1.5h`) are technically valid in Go's parser but should be avoided in this context
- Both `us` and `µs` are accepted for microseconds


