---
sidebar_position: 0
---

# Setup

### Prerequisites

1. **SSH Access**: SSH connectivity to all target Docker hosts
    - SSH user should be in the `docker` group for daemon access

2. **Docker Access**: SSH user must have Docker daemon access without requiring root
    ```bash
    # Add user to docker group on remote hosts
    sudo usermod -aG docker $USER
    ```

3. **Network Connectivity**: Docker daemon running on remote hosts with network access from Dockman instance

4. Ensure you have added the following mounts in your docker-compose.yml:
    ```yaml title="docker-compose.yaml"
     name: dockman
     services:
       dockman:
         container_name: dockman
         image: ghcr.io/ra341/dockman:latest
         environment:
           - DOCKMAN_COMPOSE_ROOT=/path/to/stacks
         volumes:
           - /var/run/docker.sock:/var/run/docker.sock
           - /path/to/dockman/config:/config
         ports:
           - "8866:8866"
         restart: always
    ```

### Add Hosts via Web UI

1. **Navigate to the Settings page by clicking the settings icon on the top right** and click "Add New Machine"

2. **Configure your host** with the following fields:

- <img height="300" alt="image" src="https://github.com/user-attachments/assets/7ef19e3a-0589-4ca5-b6f8-fe479c711375" />
- **Name** : A friendly name for your host (e.g., "apollo", "production-server")
- **Host** : IP address or hostname of your Docker host
- **Port** :
  SSH port (default: 22)
- **User** : SSH username that has Docker access
- **Enable Machine**: Toggle to enable/disable this host
- **Authentication** : Choose between Password or Public Key authentication

### Authentication Methods

#### 1. SSH Keys (Recommended)

- Toggle **"Public Key"** to enabled
- Dockman generates its own SSH key pair when it first runs
- **Automatic Key transfer**: Dockman will automatically copy the public key to your target host during the initial
  connection
- These are separate from your personal SSH keys in `~/.ssh/`

#### 2. Password Authentication

- Toggle **"Public Key"** to disabled
- Enter your password in the **Password** field
- Your password will be stored and used for subsequent connections
