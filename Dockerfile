# Remote Support app - Node backend + React frontend, served at /remote
FROM node:20-bookworm-slim

WORKDIR /app

# Root package (backend deps)
COPY package*.json ./
RUN npm ci --omit=dev

# App code
COPY . .

# Frontend build (base: /remote/ in vite.config.cjs)
RUN cd frontend && npm ci && npm run build && cd ..

RUN mkdir -p uploads

EXPOSE 3500
ENV PORT=3500
ENV NODE_ENV=production

CMD ["node", "backend/server.js"]
