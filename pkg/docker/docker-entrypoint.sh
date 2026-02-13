#!/bin/sh
set -e

echo "Dockman entrypoint"

# Ensure we are in the /app folder
cd /app

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# If Root (PUID 0)
if [ "$PUID" -eq 0 ]; then
    echo "Running as root..."
    # no perm changed needed
    # Run the app directly
    exec "$@"
fi

# Create the Group
if ! getent group appgroup >/dev/null; then
    addgroup -g "$PGID" appgroup
fi

# Create the User
if ! getent passwd appuser >/dev/null; then
    adduser -u "$PUID" -G appgroup -h /app -D appuser
fi

# Docker Socket Permissions
# if the socket exists
if [ -S /var/run/docker.sock ]; then
    # Get the group ID of the host's docker socket
    DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)

    # Check if a group with that GID already exists in the container
    DOCKER_GROUP=$(getent group "$DOCKER_GID" | cut -d: -f1)

    if [ -z "$DOCKER_GROUP" ]; then
        # Create the group if it doesn't exist
        addgroup -g "$DOCKER_GID" dockerhost
        DOCKER_GROUP="dockerhost"
    fi

    # Add our appuser to the docker group
    addgroup appuser "$DOCKER_GROUP"
fi

APP_DIRS="DOCKMAN_COMPOSE_ROOT DOCKMAN_CONFIG DOCKMAN_UI_PATH"

# Initialize Directories
# loop through the env variables
for DIR_VAR in $APP_DIRS; do
    # value of the variable name
    DIR_PATH=$(eval echo "\$$DIR_VAR")

    if [ -n "$DIR_PATH" ]; then
        echo "Setting dir permissions: $DIR_PATH"
        mkdir -p "$DIR_PATH"
        chown "$PUID:$PGID" "$DIR_PATH"
    else
        echo "Warning: $DIR_VAR is not set, skipping..."
    fi
done

# Drop permissions and run the application
echo "Launching Dockman as $PUID:$PGID"
exec su-exec appuser "$@"