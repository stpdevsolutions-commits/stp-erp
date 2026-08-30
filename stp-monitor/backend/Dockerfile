FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:20-alpine
# git: ProjectsService corre "git status"/"git log" contra los repos montados en /repos.
# safe.directory '*': los repos son del host (otro UID) montados de solo lectura — sin esto
# git rechaza operar por "dubious ownership" en cada uno.
RUN apk add --no-cache git && git config --system --add safe.directory '*'
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3002
CMD ["node", "dist/main"]
