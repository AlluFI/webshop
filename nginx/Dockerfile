FROM nginx:1.27-alpine

RUN apk add --no-cache openssl
COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 443
ENTRYPOINT ["/docker-entrypoint.sh"]
