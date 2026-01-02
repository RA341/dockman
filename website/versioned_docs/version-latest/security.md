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
