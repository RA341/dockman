---
sidebar_position: 1
title: Overview
---

Dockman's multihost feature lets you manage remote Docker hosts from one centralized interface.
Jump between servers, keep your configurations perfectly organized, and deploy across your entire infrastructure
seamlessly.

## How It Works

```
                    ┌─────────────────────────────────┐
                    │        Dockman Instance         │
                    │                                 │
                    │  ┌───────────────────────────┐  │
                    │  │      Git Repository       │  │
                    │  │                           │  │
                    │  │  ┌─ main branch           │  │
                    │  │  ├─ host-a branch ────┐   │  │
                    │  │  ├─ host-b branch ────┼── ┼──┼─── docker-compose.yml
                    │  │  └─ host-c branch ────┘   │  │    .env files
                    │  │                           │  │    bind mount files
                    │  └───────────────────────────┘  │
                    └─────────────────┬───────────────┘
                                      │
                          ┌───────────┼───────────┐
                          │           │           │
                 Compose via API      │      Compose via API
                  + File Transfer     │       + File Transfer
                          │           │           │
                          ▼           ▼           ▼
                   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
                   │   Host A    │ │   Host B    │ │   Host C    │
                   │             │ │             │ │             │
                   │ Docker      │ │ Docker      │ │ Docker      │
                   │ API/Daemon  │ │ API/Daemon  │ │ API/Daemon  │
                   │             │ │             │ │             │
                   │ ┌─────────┐ │ │ ┌─────────┐ │ │ ┌─────────┐ │
                   │ │Container│ │ │ │Container│ │ │ │Container│ │
                   │ │ Stack   │ │ │ │ Stack   │ │ │ │ Stack   │ │
                   │ └─────────┘ │ │ └─────────┘ │ │ └─────────┘ │
                   │             │ │             │ │             │
                   │ bind mounts │ │ bind mounts │ │ bind mounts │
                   │ (transferred│ │ (transferred│ │ (transferred│
                   │  from local)│ │  from local)│ │  from local)│
                   └─────────────┘ └─────────────┘ └─────────────┘
```

This architecture provides centralized management of all your remote Docker Compose setups from a single interface, with
all configurations version-controlled in Git. Dockman keeps your compose files local and sends them directly to the
remote Docker API, only transferring necessary bind mount files via SSH.

## Key Features

### Agentless Architecture

```
    Dockman ──SSH + Docker API──> Remote Host
       │                            │
       │                            ├─ No agents installed
       │                            ├─ No background processes  
       │                            ├─ Compose files never transferred
       └─ Local compose files       └─ Only bind mounts transferred
         sent via Docker API
```

No bloated agents cluttering your servers—Dockman keeps it clean with **SSH-only connections** to the Docker API. Your
`docker-compose.yml` and `.env` files never leave your local machine.

Instead, Dockman sends the compose configuration directly to the remote Docker daemon via its API, only transferring the
specific bind mount files that your containers need.

**What gets transferred vs. what stays local:**

```yaml
# docker-compose.yaml -> (sent to Docker daemon directly)
services:
  nginx:
  image: nginx
  environment_file:
    - .env # -> (sent to Docker daemon directly)
  volumes:
    - ./config/nginx.conf:/etc/nginx/nginx.conf # -> automatically transferred via sftp
    - /home/zaphodb/data:/var/lib/data # -> this will not be transferred since its outside of compose root
```

### Git-Based Configuration Management

Each host gets its own **Git branch** for complete isolation.
Modify one host's setup without affecting others.

When you switch hosts, Dockman automatically:

- Saves your current work on branch
- Switches to the target host's branch
- Connects to the remote server
- Loads the host-specific configuration

Your Docker Compose files, environment variables,
and deployment settings stay perfectly isolated per host,
while still allowing you to sync configurations between branches when needed.

```
Compose Root/
├── local/ <- git branch for local docker
│   ├── docker-compose.yml
│   ├── .env
│   └── config.yaml
│
├── apollo/ <- git branch for host: apollo
│   ├── .env
│   ├── README.md
│   ├── caddy/
│   │   ├── docker-compose.yml
│   │   ├── Caddyfile
│   │   └── .env
│   ├── calibre/
│   │   ├── docker-compose.yml
│   │   ├── config.json
│   │   └── .env
│   └── prometheus/
│       ├── docker-compose.yml
│       ├── prometheus.yml
│       └── rules.yml
│
├── ares/  <- git branch for host: ares
│   ├── .env
│   ├── README.md
│   ├── docker-compose.yml
│   ├── grafana/
│   │   ├── docker-compose.yml
│   │   ├── provisioning/
│   │   │   └── dashboards/
│   │   │       └── default.json
│   │   └── grafana.ini
│
├── artemis/ <- git branch for host artemis
│   ├── .env
│   ├── README.md
│   ├── docker-compose.yml
│   ├── node-exporter/
│   │   ├── docker-compose.yml
│   │   └── config.yaml
│   └── settings.json

```
