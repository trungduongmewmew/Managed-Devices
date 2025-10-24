#!/bin/bash


DB_IMAGE_NAME="postgres:14-alpine"

APP_CONTAINER_NAME=$(docker ps --filter "status=running" --format "{{.Names}}" | grep 'app' | head -n 1)
if [ -z "$APP_CONTAINER_NAME" ]; then
    APP_CONTAINER_NAME=$(docker ps --filter "status=running" --filter "ancestor=node" --format "{{.Names}}" | head -n 1)
fi
DB_USER="myuser"
DB_NAME="network_db"


find_db_container() {
    local image_name=$1; local container_name;
    container_name=$(docker ps --filter "status=running" --filter "ancestor=${image_name}" --format "{{.Names}}" | head -n 1)
    if [ -z "$container_name" ]; then echo "Error: No running container found for image '${image_name}'." >&2; exit 1; fi
    echo "$container_name"
}


DB_CONTAINER_NAME=$(find_db_container "$DB_IMAGE_NAME"); if [ $? -ne 0 ]; then exit 1; fi
echo "Found DB container: $DB_CONTAINER_NAME"
if [ -z "$APP_CONTAINER_NAME" ]; then echo "Error: Could not find running App container." >&2; exit 1; fi
echo "Found App container: $APP_CONTAINER_NAME"


read -p "Enter the username to change password for: " TARGET_USERNAME
if [ -z "$TARGET_USERNAME" ]; then echo "Username cannot be empty." >&2; exit 1; fi

read -sp "Enter the NEW password: " NEW_PASSWORD
echo 
if [ -z "$NEW_PASSWORD" ]; then echo "Password cannot be empty." >&2; exit 1; fi


echo "Generating password hash..."

HASH_COMMAND="cd /usr/src/app && node -e \"const bcrypt=require('bcryptjs'); process.stdout.write(bcrypt.hashSync('${NEW_PASSWORD}', 10));\""

NEW_HASH=$(docker exec "$APP_CONTAINER_NAME" sh -c "$HASH_COMMAND" 2>/dev/null)

if [ -z "$NEW_HASH" ] || [[ "$NEW_HASH" == *"Error"* ]]; then
    echo "Error: Could not generate password hash." >&2
    echo "Check error details:" >&2
    docker exec "$APP_CONTAINER_NAME" sh -c "$HASH_COMMAND" r
    exit 1
fi
echo "Hash generated successfully."


echo "Updating password in database for user '$TARGET_USERNAME'..."
SQL_COMMAND="UPDATE users SET password_hash = '${NEW_HASH}' WHERE username = '${TARGET_USERNAME}';"
docker exec "$DB_CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "$SQL_COMMAND"

if [ $? -eq 0 ]; then echo "Password updated successfully for user '$TARGET_USERNAME'!"; else echo "Error: Password update failed." >&2; exit 1; fi
exit 0