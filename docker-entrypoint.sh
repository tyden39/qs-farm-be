#!/bin/sh
set -e

# Ensure upload directories exist at runtime (named volumes shadow image-layer dirs)
mkdir -p /app/files/firmware

exec dumb-init -- "$@"
