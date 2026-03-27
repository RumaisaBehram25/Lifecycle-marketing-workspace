# Deployment Guide

## Docker Setup

This project includes Docker configuration for containerized deployment.

### Prerequisites

- Docker and Docker Compose installed
- Supabase credentials (Project ID, Anon Key, Project URL)

### Environment Variables

Create a `.env` file with the following required variables:

```env
# Optional
```

### Build and Run with Docker Compose

```bash
# Build the Docker image
docker compose build

# Start the service
docker compose up -d

# View logs
docker compose logs -f web

# Stop the service
docker compose down
```

### Build Docker Image Manually

```bash
# Build the image
docker build -t client-dashboard:latest .

# Run the container
docker run -d \
  -p 8080:8080 \
  --env-file .env \
  --name client-dashboard \
  client-dashboard:latest
```

### Verify Deployment

- Application should be accessible at `http://localhost:8080`
- Health check endpoint available at `http://localhost:8080` (returns 200 if healthy)

### Production Deployment

For production deployment to cloud services (AWS, GCP, Azure, etc.):

1. **Tag and push image to registry:**
   ```bash
   docker tag client-dashboard:latest your-registry.com/client-dashboard:latest
   docker push your-registry.com/client-dashboard:latest
   ```

2. **Deploy with environment variables:**
   - Set `VITE_SUPABASE_PROJECT_ID`
   - Set `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Set `VITE_SUPABASE_URL`
   - Optionally set `VITE_SUPABASE_ANON_KEY`

3. **Scale and manage:**
   - Use container orchestration (Kubernetes, Docker Swarm, ECS, etc.)
   - Configure load balancing as needed
   - Set up monitoring and alerting

### Troubleshooting

- **"Edge Functions will fail to invoke"**: Ensure `VITE_SUPABASE_PUBLISHABLE_KEY` uses the anon/public key (JWT starting with `eyJ`), not a Lovable key.
- **RLS errors**: Verify user is approved in Supabase: `UPDATE public.profiles SET is_approved = true WHERE id = 'USER_UUID'`
- **Cannot reach Functions**: Check if the function is deployed and the Supabase URL is correctly set.

### Optimization Tips

- Use Alpine Linux base image for minimal size
- Layer caching is optimized by copying `package.json` before source code
- Multi-stage build keeps production image small (only contains `dist/`)
- Health checks ensure container restarts if the app crashes

## Local Development with Docker

```bash
# For development with hot reload, use npm directly:
npm install
npm run dev
```

## References

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Supabase JavaScript Guide](https://supabase.com/docs/reference/javascript)
- [Docker Documentation](https://docs.docker.com/)
