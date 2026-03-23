docker cleanup: docker system prune -a --volumes
docker compose exec db psql -U postgres -d postgres