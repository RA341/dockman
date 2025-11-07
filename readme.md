<div align="center">
  <img src="website/static/img/dockman.svg" alt="Logo" width="200" height="200">
  <h1>Dockman</h1>
  <p>
    A Docker management tool for users who want unfiltered access to their Docker Compose files.
  </p>
  <img src="https://github.com/RA341/assets/releases/download/dockman/dockman-demo.gif" alt="Dockman Demo" width="800">
</div>

## Contents

- [Install](#install)
- [Docs](#docs)
- [Contributing](#contributing)
- [License](#license)

## Install

To see full documentation go: https://dockman.radn.dev/docs/category/install

### Docker Run

Try Dockman with this docker run command

> [!WARNING]
> This quick-start command will **delete all dockman data** when the container stops. Use only for testing.
>
> For a more persistent setup, see the [compose](#docker-compose) section below.

```bash title="Bash"
docker run --rm -p 8866:8866 -v /var/run/docker.sock:/var/run/docker.sock ghcr.io/ra341/dockman:latest
```

Access at http://localhost:8866

### Docker Compose

> [!IMPORTANT]
> The stacks directory path must be absolute and identical in all three locations:
> * 1️⃣ Environment variable: `DOCKMAN_COMPOSE_ROOT=/path/to/stacks`
> * 2️⃣ The host side of the volume `/path/to/stacks`
> * 3️⃣ The container side of the volume `/path/to/stacks`
    This path consistency is essential for Dockman to locate and manage your compose files properly.

```yaml title="docker-compose.yaml"
services:
  dockman:
    container_name: dockman
    image: ghcr.io/ra341/dockman:latest
    environment:
      # 1️⃣
      - DOCKMAN_COMPOSE_ROOT=/path/to/stacks
    volumes:
      #  2️⃣              3️⃣                
      - /path/to/stacks:/path/to/stacks
      - /path/to/dockman/config:/config
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "8866:8866"
    restart: always
```

## Docs

To see full documentation go: https://dockman.radn.dev/docs/intro

## Contributing

See [Contributing.md](CONTRIBUTING.md)

## License

This project is licensed under the GNU AFFERO GENERAL PUBLIC LICENSE v3.0. See the [LICENSE](LICENSE) file for details.
