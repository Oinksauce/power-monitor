# Securing Power Monitor with HTTPS

The Power Monitor dashboard and API run over plain HTTP by default for simplicity on modern local networks. However, if you are exposing your dashboard to the internet or prefer encrypted local traffic, you should set up HTTPS.

The recommended approach is to run a **reverse proxy** in front of the application. This guide covers two popular options: **Caddy** (easiest, automatic HTTPS) and **Nginx** (industry standard).

## Option 1: Caddy (Recommended)

[Caddy](https://caddyserver.com/) is a modern web server that automatically provisions and renews TLS certificates (via Let's Encrypt or ZeroSSL) without manual configuration.

### Installation & Setup

1. Install Caddy following the official instructions for your OS.
2. Create or edit your `Caddyfile` (usually located at `/etc/caddy/Caddyfile` on Linux).
3. Use this configuration (replace `power.yourdomain.com` with your domain, and `8000` with your FastAPI port if different):

```caddyfile
power.yourdomain.com {
    # Proxy requests to the FastAPI backend
    reverse_proxy localhost:8000
}
```

4. Restart Caddy: `sudo systemctl restart caddy`

Caddy will automatically fetch a certificate and start serving your site securely.

---

## Option 2: Nginx with Let's Encrypt (Certbot)

[Nginx](https://nginx.org/) is extremely robust but requires more manual setup.

### Installation & Setup

1. Install Nginx and Certbot:
   ```bash
   sudo apt update
   sudo apt install nginx certbot python3-certbot-nginx
   ```
2. Create a new Nginx configuration file (`/etc/nginx/sites-available/power_monitor`):

```nginx
server {
    listen 80;
    server_name power.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Enable the site and test the configuration:
   ```bash
   sudo ln -s /etc/nginx/sites-available/power_monitor /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```
4. Run Certbot to acquire testing certificates and automatically update your Nginx config:
   ```bash
   sudo certbot --nginx -d power.yourdomain.com
   ```

---

## Option 3: Local Self-Signed Certificates

If you are only accessing the dashboard on your local network (e.g., via IP address or `.local` hostname) and cannot use Let's Encrypt, you can generate a self-signed certificate and run FastAPI with SSL directly using Uvicorn.

1. Generate a certificate:
   ```bash
   openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365
   ```
2. Start the Uvicorn server with the SSL flags:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
   ```
   
> **Note:** Browsers will show a warning about an untrusted certificate when using self-signed certs. You will need to click "Proceed anyway" to view the dashboard securely.
