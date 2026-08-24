FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

# PROJECTS_ROOT is a volume shared with code-server, whose repos aren't owned by this
# container's user (root) — git refuses to touch them ("dubious ownership") without this.
# --system (not --global) so it applies regardless of HOME/volume mounts.
RUN git config --system --add safe.directory '*'

COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

# claude --dangerously-skip-permissions refuses to run as root, and PROJECTS_ROOT (shared
# with code-server) needs a stable non-root writer — the `node` user ships with this image.
RUN mkdir -p /projects && chown node:node /projects

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

# Sets git's committer/author identity from GIT_AUTHOR_NAME/EMAIL on every start — git commit
# needs both, and only the author half is otherwise covered by env vars alone.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
