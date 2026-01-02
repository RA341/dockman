---
sidebar_position: 1
title: Overview
---

# Multihost

Dockman connects to remote Docker hosts via SSH, allowing you to control multiple servers without needing direct access
to each machine. All communication happens through secure SSH tunnels, so you can manage your entire Docker
infrastructure from a single location.

## Prerequisites

Before connecting to remote hosts, ensure the following requirements are met:

- **SSH Access**: Your local machine must be able to establish SSH connections to the remote hosts
- **Docker Daemon Access**: The SSH user on the remote host must have permission to access the Docker daemon without
  requiring root privileges
    - This typically means the user is a member of the `docker` group
    - You can verify this by running `docker ps` as the SSH user on the remote host

## Adding a Remote Host

To connect to a remote Docker host:

1. Navigate to **Settings** in Dockman
2. Click **Add Host**
3. In the connection dialog, select **SSH** as the connection type
4. Enter the connection details:
    - **Host**: The IP address or hostname of the remote server
    - **Port**: SSH port (typically 22)
    - **User**: The SSH username
    - **Password**: The SSH password

### Authentication Options

Dockman offers two authentication methods:

**Passwordless SSH (Recommended)**

- Enable the "Automatically add public key" option during setup
- Dockman will copy its public SSH key to the remote host's `authorized_keys` file
- Dockman will not store the password and use password-less SSH

**Password-Based Authentication**

- If you don't use the automatic key setup, Dockman will store your password
- The stored password will be used automatically for subsequent connections
- While convenient, using SSH keys is more secure and recommended.

## Key Benefits

- **Centralized Control**: Manage all your Docker hosts from one interface
- **Secure Connections**: All communication uses SSH encryption
- **No Agent Required**: Works with standard Docker installations, no additional software needed on remote hosts
