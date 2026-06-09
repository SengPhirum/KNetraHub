docker build -t dockhub:latest .
docker stack deploy -c docker-compose.yml dockhub