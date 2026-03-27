FROM nginx:1-alpine
COPY . /usr/share/nginx/html/
EXPOSE 80
