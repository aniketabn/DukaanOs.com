# DukaanOS database API for Fly.io
FROM node:22-slim
WORKDIR /app
COPY server/server.js ./server/server.js
ENV NODE_ENV=production PORT=8787 DB_FILE=/data/dukaanos.db
EXPOSE 8787
CMD ["node", "--no-warnings", "server/server.js"]
