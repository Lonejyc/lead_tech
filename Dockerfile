FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

FROM node:20-alpine

WORKDIR /app

COPY --from=build /app .

ENV PORT=3000
EXPOSE 3000

USER node

CMD ["node", "app/server.js"]
