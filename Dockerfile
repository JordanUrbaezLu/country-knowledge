# Universal container image — works on Railway, Fly.io, Cloud Run, or any host.
# Serves the built SPA + the realtime WebSocket on $PORT (default 1999).
FROM node:22-slim

WORKDIR /app

# Install deps (include dev for the build; skip the optional cloudflared tunnel
# tool, which is only used by the local `npm run share`).
COPY package*.json ./
RUN npm ci --include=dev --omit=optional

# Build the SPA, then run the server (tsx runs the TS entry directly).
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 1999
CMD ["npm", "start"]
