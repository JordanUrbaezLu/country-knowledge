# Universal container image — works on Railway, Fly.io, Cloud Run, or any host.
# Serves the built SPA + the realtime WebSocket on $PORT (default 1999).
FROM node:22-slim

WORKDIR /app

# Install deps (include dev for the build). Keep optional deps: Vite 8's bundler
# (rolldown) ships its platform binding as an optionalDependency, so omitting
# optional breaks the build. (The optional cloudflared tunnel tool also installs
# here but is unused by the server — harmless.)
COPY package*.json ./
RUN npm ci --include=dev

# Build the SPA, then run the server (tsx runs the TS entry directly).
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 1999
CMD ["npm", "start"]
