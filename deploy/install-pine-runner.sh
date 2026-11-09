#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/forextestlab
install -d -o root -g root -m 0755 /opt/forextestlab-pine/node_modules/@nullarch
cp -r node_modules/@nullarch/resin /opt/forextestlab-pine/node_modules/@nullarch/
install -o root -g root -m 0644 workers/pine-resin-worker.mjs /opt/forextestlab-pine/worker.mjs
chown -R root:root /opt/forextestlab-pine
chmod -R go-w /opt/forextestlab-pine
install -o root -g root -m 0644 deploy/forextestlab-pine.socket /etc/systemd/system/forextestlab-pine.socket
install -o root -g root -m 0644 deploy/forextestlab-pine@.service /etc/systemd/system/forextestlab-pine@.service
systemctl daemon-reload
systemctl enable --now forextestlab-pine.socket
