FROM node:20-alpine

# git: alguna dependencia transitiva de @whiskeysockets/baileys se instala
# desde una URL de git, no del registro npm.
RUN apk add --no-cache git

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

VOLUME /data/auth
EXPOSE 3900

CMD ["node", "index.js"]
