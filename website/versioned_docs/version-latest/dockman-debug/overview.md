# Debugger

:::info
This feature is available v3+
:::

Dockman allows you to attach a custom toolkit to any running container. This enables you to `exec` into and inspect
containers even if they lack a shell (e.g., `scratch` or `distroless` images).

Functionally, this operates similarly to [`docker debug`](https://docs.docker.com/reference/cli/docker/debug/) or [
`cdebug`](https://github.com/iximiuz/cdebug).

## Usage

To start debugging, specify a **Debugger Image** in your configuration.

* **Custom Image:** Dockman will pull and start up the debugger container and then drop into the target container.
* **Default:** If left empty, Dockman attempts to use the target container's native shell/tools.

## Examples

You can use any Docker image as your debugging toolkit. Here are common use cases:

**1. General Purpose**
Lightweight shells for basic file manipulation.

```text
alpine:latest
# or
busybox
```

**2. Network Troubleshooting**
Access to tools like `tcpdump`, `dig`, and `nmap`.

```text
nicolaka/netshoot
```

**3. Ad-hoc Toolkits (via Nixery)**
Don't want to build a custom image? Use [Nixery](https://nixery.dev/) to generate an image with specific tools on the
fly.

```text
# Creates an image containing bash, curl, vim and htop, no need to prebuild the image
nixery.dev/shell/curl/vim/htop
```

## Credits

* Inspired by the work of [Ivan Velichko (iximiuz)](https://iximiuz.com/en/posts/docker-debug-slim-containers/).
* Based on the concepts behind [cdebug](https://github.com/iximiuz/cdebug).
