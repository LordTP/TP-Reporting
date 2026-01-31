# Teliporter Reporting Platform — Production Deployment Plan

**Target**: DigitalOcean Droplet (General Purpose 2 vCPU / 8 GB) + Managed PostgreSQL
**Domain**: (TBC — e.g. app.teliporter.com)

---

## Architecture Overview

```
          Internet
              │
       ┌──────▼──────┐
       │   Droplet    │  2 vCPU / 8 GB
       │  (Ubuntu 22) │
       │              │
       │  ┌────────┐  │
:443 ──►  │ Nginx  │  │  Reverse proxy + SSL (Let's Encrypt) + static files
       │  └──┬──┬──┘  │
       │     │  │     │
       │  ┌──▼┐ └──┐  │
       │  │API│ │SPA│  │  Backend :8000 / Frontend dist
       │  └───┘ └───┘  │
       │  ┌─────────┐  │
       │  │  Redis  │  │  Celery broker
       │  └─────────┘  │
       │  ┌─────────┐  │
       │  │ Celery  │  │  Worker + Beat
       │  └─────────┘  │
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │  DO Managed  │  PostgreSQL 15
       │  PostgreSQL  │  Daily backups
       └─────────────┘
```

**Why Managed PostgreSQL**: Automated backups, failover, patching — one less thing to manage. The droplet handles everything else (Nginx, backend, Redis, Celery).
**SSL**: Let's Encrypt via Certbot — free, auto-renewing certificates managed directly on the server.

---

## Pre-Deployment Checklist

### 1. Domain & DNS
- [ ] Register/choose subdomain (e.g. `app.teliporter.com`)
- [ ] Point A record to droplet IP (via your domain registrar's DNS settings)

### 2. DigitalOcean Setup
- [ ] Create Managed PostgreSQL cluster (Basic, 1 GB RAM, 1 vCPU — can scale later)
  - Region: London (LON1)
  - PostgreSQL 15
  - Database name: `teliporter`
  - Note the connection string + CA cert
- [ ] Create Droplet
  - Image: Ubuntu 22.04 LTS
  - Plan: General Purpose, 2 vCPU / 8 GB
  - Region: London (LON1) — same as DB
  - Add SSH key
  - Enable monitoring
  - Enable backups (weekly)
- [ ] Set up DigitalOcean firewall
  - Allow inbound: 22 (SSH), 80 (HTTP), 443 (HTTPS)
  - Allow all outbound

### 3. Square API
- [ ] Create a **production** Square application (or switch existing from sandbox)
- [ ] Update OAuth redirect URI to `https://app.teliporter.com/api/v1/square/callback`
- [ ] Note production Application ID + Secret

### 4. Secrets to Generate
```bash
# JWT secret key
openssl rand -hex 32

# Fernet encryption key (for Square tokens)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## Server Setup (One-Time)

### Step 1: Initial Server Config

```bash
# SSH in
ssh root@<DROPLET_IP>

# Update system
apt update && apt upgrade -y

# Create deploy user
adduser deploy
usermod -aG sudo deploy
cp -r ~/.ssh /home/deploy/.ssh
chown -R deploy:deploy /home/deploy/.ssh

# Disable root SSH login
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# Switch to deploy user from here on
su - deploy
```

### Step 2: Install Dependencies

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
newgrp docker

# Docker Compose (v2 plugin)
sudo apt install docker-compose-plugin -y

# Nginx
sudo apt install nginx -y

# Node.js 20 (for building frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# Certbot (Let's Encrypt SSL)
sudo apt install certbot python3-certbot-nginx -y
```

### Step 3: Project Directory

```bash
sudo mkdir -p /opt/teliporter
sudo chown deploy:deploy /opt/teliporter
cd /opt/teliporter

# Clone repo (or scp/rsync from local)
git clone <REPO_URL> .
# OR from local machine:
# rsync -avz --exclude node_modules --exclude venv --exclude .git . deploy@<IP>:/opt/teliporter/
```

### Step 4: Production Environment File

Create `/opt/teliporter/backend/.env`:

```env
# Application
APP_NAME=Teliporter Reporting Platform
DEBUG=False

# Database (Managed PostgreSQL connection string from DO console)
DATABASE_URL=postgresql://teliporter:<PASSWORD>@<DB_HOST>:25060/teliporter?sslmode=require

# Redis (local)
REDIS_URL=redis://localhost:6379/0

# JWT
SECRET_KEY=<generated-hex-key>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
CORS_ORIGINS=["https://app.teliporter.com"]

# Square API (PRODUCTION)
SQUARE_APPLICATION_ID=<production-app-id>
SQUARE_APPLICATION_SECRET=<production-app-secret>
SQUARE_ENVIRONMENT=production
SQUARE_REDIRECT_URI=https://app.teliporter.com/api/v1/square/callback

# Encryption Key
ENCRYPTION_KEY=<generated-fernet-key>

# Currency Exchange API
EXCHANGE_RATE_API_KEY=<api-key>
EXCHANGE_RATE_API_URL=https://api.exchangeratesapi.io/v1/latest

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### Step 5: Production Docker Compose

Create `/opt/teliporter/docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: teliporter-redis
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: teliporter-backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
    ports:
      - "127.0.0.1:8000:8000"
    env_file:
      - ./backend/.env
    depends_on:
      redis:
        condition: service_healthy
    restart: always

  celery_worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: teliporter-celery-worker
    command: celery -A app.celery_app:celery_app worker --loglevel=info --concurrency=4
    env_file:
      - ./backend/.env
    depends_on:
      - redis
    restart: always

  celery_beat:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: teliporter-celery-beat
    command: celery -A app.celery_app:celery_app beat --loglevel=info
    env_file:
      - ./backend/.env
    depends_on:
      - redis
    restart: always

volumes:
  redis_data:
```

Key differences from dev:
- No PostgreSQL container (using Managed DB)
- No volume mounts for code (baked into image)
- No `--reload` flag
- 4 uvicorn workers
- Ports bound to `127.0.0.1` (only accessible via Nginx)
- `restart: always`
- Uses `env_file` instead of inline env vars

### Step 6: Nginx Configuration

Create `/etc/nginx/sites-available/teliporter`:

Start with HTTP only (Certbot will add the SSL config automatically):

```nginx
server {
    listen 80;
    server_name app.teliporter.com;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # API — proxy to backend container
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 10M;
    }

    # Frontend — serve static files
    location / {
        root /opt/teliporter/frontend/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

Enable the site and install SSL:
```bash
sudo ln -s /etc/nginx/sites-available/teliporter /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl start nginx

# Install Let's Encrypt SSL certificate (DNS must be pointing to droplet first)
sudo certbot --nginx -d app.teliporter.com

# Certbot will:
# - Obtain the certificate
# - Modify the Nginx config to add SSL + redirect HTTP → HTTPS
# - Set up a systemd timer for automatic renewal (every ~60 days)

# Verify auto-renewal is working
sudo certbot renew --dry-run
```

---

## Deployment Script

Create `/opt/teliporter/deploy.sh`:

```bash
#!/bin/bash
set -e

echo "=== Teliporter Production Deploy ==="
cd /opt/teliporter

# Pull latest code
echo "1. Pulling latest code..."
git pull origin main

# Build frontend
echo "2. Building frontend..."
cd frontend
npm ci --production=false
VITE_API_BASE_URL=/api/v1 npm run build
cd ..

# Build and restart backend containers
echo "3. Building Docker images..."
docker compose -f docker-compose.prod.yml build

echo "4. Running database migrations..."
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head

echo "5. Restarting services..."
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# Reload Nginx (in case config changed)
echo "6. Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx

# Clean up old Docker images
echo "7. Cleaning up..."
docker image prune -f

echo "=== Deploy complete ==="
echo "Backend: $(docker ps --filter name=teliporter-backend --format '{{.Status}}')"
echo "Worker:  $(docker ps --filter name=teliporter-celery-worker --format '{{.Status}}')"
echo "Beat:    $(docker ps --filter name=teliporter-celery-beat --format '{{.Status}}')"
echo "Redis:   $(docker ps --filter name=teliporter-redis --format '{{.Status}}')"
```

```bash
chmod +x /opt/teliporter/deploy.sh
```

Usage: `./deploy.sh`

---

## First Deploy

```bash
cd /opt/teliporter

# 1. Build frontend
cd frontend
npm ci
VITE_API_BASE_URL=/api/v1 npm run build
cd ..

# 2. Start services
docker compose -f docker-compose.prod.yml up -d --build

# 3. Run migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# 4. Create first admin user (via API or management command)
# Option A: Register via the app at https://app.teliporter.com/register
# Option B: Run a seed script inside the container
# docker compose -f docker-compose.prod.yml exec backend python -m app.scripts.create_admin

# 5. Start Nginx
sudo systemctl start nginx
```

---

## SSL (Let's Encrypt)

SSL is set up during the Nginx step above via Certbot. Key details:

- **Certificates stored at**: `/etc/letsencrypt/live/app.teliporter.com/`
- **Auto-renewal**: Certbot installs a systemd timer that renews before expiry (~every 60 days)
- **Check renewal status**: `sudo certbot certificates`
- **Manual renewal**: `sudo certbot renew`
- **Test renewal**: `sudo certbot renew --dry-run`

If you need to re-issue (e.g. after changing domain):
```bash
sudo certbot --nginx -d new-domain.teliporter.com
```

---

## Monitoring & Logs

### View Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f celery_worker

# Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Health Checks
```bash
# API health
curl -s https://app.teliporter.com/api/v1/health | jq

# Container status
docker compose -f docker-compose.prod.yml ps

# Disk usage
df -h

# Memory
free -h
```

### DigitalOcean Monitoring
- Enable Droplet monitoring in DO dashboard (CPU, memory, disk, bandwidth graphs)
- Set up alerts: CPU > 80% for 5 mins, disk > 85%

---

## Backup Strategy

| What | How | Frequency |
|------|-----|-----------|
| PostgreSQL | DO Managed — automatic daily backups, 7-day retention | Daily (automatic) |
| Redis | Not critical — ephemeral task queue only | N/A |
| Application code | Git repository | Every deploy |
| Environment files | Manual backup to secure location | On change |
| Uploaded files (if any) | rsync to DO Spaces or local backup | Weekly |

### Manual DB Backup (if needed)
```bash
# Dump from managed DB
PGPASSWORD=<password> pg_dump -h <DB_HOST> -p 25060 -U teliporter -d teliporter --no-owner > backup_$(date +%Y%m%d).sql

# Restore
PGPASSWORD=<password> psql -h <DB_HOST> -p 25060 -U teliporter -d teliporter < backup_20260131.sql
```

---

## Rollback Procedure

```bash
cd /opt/teliporter

# 1. Check what went wrong
docker compose -f docker-compose.prod.yml logs --tail=100 backend

# 2. Roll back to previous commit
git log --oneline -5        # find the good commit
git checkout <commit-hash>

# 3. Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# 4. Roll back migration if needed
docker compose -f docker-compose.prod.yml exec backend alembic downgrade -1
```

---

## Cost Estimate (Monthly)

| Service | Spec | Cost |
|---------|------|------|
| Droplet | General Purpose 2 vCPU / 8 GB | ~$63/mo |
| Managed PostgreSQL | Basic 1 GB / 1 vCPU | ~$15/mo |
| Let's Encrypt SSL | Free | $0 |
| Domain | Annual (amortised) | ~$1/mo |
| **Total** | | **~$79/mo** |

Can scale down to a smaller droplet (Regular $24/mo) initially and upgrade if needed.

---

## Security Hardening

- [x] Non-root Docker user (appuser)
- [ ] Fail2ban for SSH brute-force protection: `sudo apt install fail2ban -y`
- [ ] UFW firewall (redundant with DO firewall, but defence in depth)
- [ ] Disable password SSH auth (key-only)
- [ ] Keep `DEBUG=False` in production .env
- [ ] Rotate `SECRET_KEY` and `ENCRYPTION_KEY` if ever compromised
- [ ] Set `SQUARE_ENVIRONMENT=production`
- [ ] Restrict CORS to production domain only
- [ ] Redis bound to localhost only (done in compose)

---

## Post-Launch Checklist

- [ ] Verify all pages load correctly
- [ ] Test Square OAuth flow end-to-end with production credentials
- [ ] Confirm Celery beat is syncing sales data every 15 minutes
- [ ] Test Excel export functionality
- [ ] Verify footfall entry CRUD works
- [ ] Check all reports render with real data
- [ ] Test login/logout/token refresh cycle
- [ ] Confirm managed DB connection is using SSL (`?sslmode=require`)
- [ ] Set up DO monitoring alerts
- [ ] Bookmark the deployment: `https://app.teliporter.com`
