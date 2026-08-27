# DailyWords — nginx 静态服务器（app/ 即静态站点）
FROM nginx:1.27-alpine
COPY app/ /usr/share/nginx/html/
EXPOSE 80
