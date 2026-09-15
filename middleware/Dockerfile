FROM node:20-alpine

# Necessário para timezones (São Paulo) e inicialização segura no Docker (dumb-init)
RUN apk add --no-cache tzdata dumb-init && \
    cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime && \
    echo "America/Sao_Paulo" > /etc/timezone

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --omit=dev

COPY src ./src

EXPOSE 3200

# Executar como usuário não root (best practice de segurança)
USER node

CMD ["dumb-init", "node", "src/index.js"]
