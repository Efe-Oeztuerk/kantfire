FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000 DATA_DIR=/data LOG_DIR=/data/logs
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
