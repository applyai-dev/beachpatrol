# Use the official Node.js Alpine image as a base
FROM node:22-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Change APK repository to a faster mirror
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install OS-level dependencies for Playwright on Alpine
# See: https://playwright.dev/docs/ci#alpine-linux
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    npm


# Copy dependency-related files
COPY package*.json ./
COPY .internal-scripts/ ./.internal-scripts/

# Install npm dependencies, skipping the interactive postinstall script
RUN npm install --ignore-scripts

# The browser is already installed via apk, so we don't need to run playwright install.
# We keep this commented out in case the base image changes in the future.
# RUN npx playwright install chromium

# Copy the rest of the application code to the working directory
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD [ "node", "api-server.js" ]
