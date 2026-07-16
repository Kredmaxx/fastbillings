# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --loglevel=warn

COPY . .

ARG VITE_API_BASE_URL=
ARG VITE_TENANT_APP_URL=
RUN VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_TENANT_APP_URL=$VITE_TENANT_APP_URL npm run build

FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
