docker cleanup: docker system prune -a --volumes
docker compose exec db psql -U postgres -d postgres
psql -h localhost -p 5433 -U postgres -d postgres