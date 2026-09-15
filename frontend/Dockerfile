# Estágio de Build (Node)
FROM node:20-alpine AS builder

WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia o código-fonte inteiro
COPY . .

# Faz o build de produção (Vite criará a pasta /app/dist)
RUN npm run build


# Estágio de Serviço (Nginx)
FROM nginx:alpine

# Remove o default config
RUN rm /etc/nginx/conf.d/default.conf

# Copia o config customizado para SPA
COPY nginx.conf /etc/nginx/conf.d/

# Copia os arquivos estáticos do builder passado
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
