FROM node:20 as builder

WORKDIR /app
COPY package.json package.json
COPY tsconfig.json tsconfig.json
COPY vite.config.ts vite.config.ts
COPY index.html index.html
COPY public public
COPY src src
ENV NPM_CONFIG_HTTP_PROXY=
ENV NPM_CONFIG_HTTPS_PROXY=
ENV npm_config_http_proxy=
ENV npm_config_https_proxy=
RUN npm install -g npm@11.7.0
RUN npm config delete http-proxy
RUN npm config delete https-proxy
RUN npm install
RUN npm run build

FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
