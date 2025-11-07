---
sidebar_position: 7
title: Security Considerations
---

### **AKA Don't Be a Dumb Dumb**

### Exposing Dockman

#### Why Exposing Dockman to the Internet Is a Terrible Idea

Dockman has access to your Docker socket, which is essentially root access to your entire system. One compromised
Dockman instance means a bad day for you.

It gets worse if you're using Dockman to manage remote Docker hosts. Since it connects via SSH, a breach doesn't just
compromise one server it potentially compromises every connected machine in your setup.

#### How to Secure Dockman

Keep dockman local only. It's designed for your private network, not the wild west of the internet. When you need remote
access, use a VPN like [Netbird](https://netbird.io/) or [Tailscale](https://tailscale.com/) to securely tunnel into
your network.

Also, enable Dockman's built-in authentication. On a private network, this gives you sufficient protection for most home
setups without making things overly complicated.

### **Git Repository Security**

#### Why Secrets in Git Are Usually Bad (But OK Here)

Your dockman repo breaks the usual rules about secrets in git repositories, and that's intentional. Unlike most
projects, this repository lives permanently on your homelab server, which changes everything about secret management.

Git makes secret tracking easier here. When you update your Plex API key or database password and something
breaks, you can roll back to the previous working configuration. Since this isn't a collaboration repo, the typical
concerns about team access don't apply.

#### How People Usually Mess This Up

The stories about secrets in git involve one mistake: pushing to public repositories. Don't accidentally commit
API keys to public GitHub repos. If you need remote backup, use private self-hosted solutions
like [Gitea](https://about.gitea.com/) on a VPS.

#### What Works

Keep secrets directly in your local repository; it makes change tracking easier. Your homelab repo should never touch
public services like GitHub or GitLab.

If you prefer .env files with `.gitignore`, that works too; dockman doesn't enforce any particular convention.
