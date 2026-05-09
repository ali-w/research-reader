# Deployment Guide

## Quick Deploy Options

### Option 1: Netlify (Easiest)

1. **Via Netlify Drop**
   ```bash
   npm run build
   ```
   - Go to [app.netlify.com/drop](https://app.netlify.com/drop)
   - Drag the `dist` folder onto the page
   - Done! Your app is live

2. **Via Git Integration**
   - Push your code to GitHub
   - Go to [netlify.com](https://netlify.com)
   - Click "New site from Git"
   - Choose your repository
   - Build settings:
     - Build command: `npm run build`
     - Publish directory: `dist`
   - Click "Deploy site"

### Option 2: Vercel

1. **Via Vercel CLI**
   ```bash
   npm install -g vercel
   vercel
   ```

2. **Via Git Integration**
   - Push to GitHub
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Vercel auto-detects Vite settings
   - Click "Deploy"

### Option 3: GitHub Pages

1. **Install gh-pages**
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Update package.json**
   ```json
   {
     "scripts": {
       "deploy": "npm run build && gh-pages -d dist"
     }
   }
   ```

3. **Configure base path in vite.config.ts**
   ```typescript
   export default defineConfig({
     base: '/research-reader/', // Replace with your repo name
     // ... rest of config
   });
   ```

4. **Deploy**
   ```bash
   npm run deploy
   ```

5. **Enable GitHub Pages**
   - Go to your repo settings
   - Pages section
   - Source: gh-pages branch
   - Save

### Option 4: Cloudflare Pages

1. Push to GitHub
2. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
3. Connect your repository
4. Build settings:
   - Build command: `npm run build`
   - Build output: `dist`
5. Deploy

### Option 5: Docker

1. **Create Dockerfile**
   ```dockerfile
   FROM node:18-alpine as build
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build

   FROM nginx:alpine
   COPY --from=build /app/dist /usr/share/nginx/html
   EXPOSE 80
   CMD ["nginx", "-g", "daemon off;"]
   ```

2. **Build and run**
   ```bash
   docker build -t research-reader .
   docker run -p 8080:80 research-reader
   ```

### Option 6: Self-Hosted VPS

1. **Build the app**
   ```bash
   npm run build
   ```

2. **Upload dist folder to your server**
   ```bash
   scp -r dist/* user@your-server:/var/www/research-reader/
   ```

3. **Configure nginx**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /var/www/research-reader;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       # Enable gzip
       gzip on;
       gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
   }
   ```

4. **Reload nginx**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## HTTPS Setup

PWAs require HTTPS in production. All the hosting providers above provide automatic HTTPS.

For self-hosting, use [Let's Encrypt](https://letsencrypt.org/):

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Environment Variables

This app doesn't need build-time environment variables since the API key is entered by users at runtime. However, if you want to pre-configure anything:

1. Create `.env.local`:
   ```
   VITE_DEFAULT_RSS_URL=https://your-feed.xml
   ```

2. Access in code:
   ```typescript
   const defaultFeed = import.meta.env.VITE_DEFAULT_RSS_URL;
   ```

## Performance Optimization

The build is already optimized, but for even better performance:

1. **Enable compression** on your server (gzip/brotli)
2. **Set cache headers** for static assets
3. **Use a CDN** like Cloudflare or CloudFront
4. **Optimize images** if you add any custom icons

## Monitoring

For production deployments, consider:

- **Error tracking**: Sentry, LogRocket
- **Analytics**: Plausible, Fathom (privacy-friendly)
- **Uptime monitoring**: UptimeRobot, Pingdom

## Custom Domain

Most hosting providers support custom domains:

1. Add your domain in the hosting dashboard
2. Update your DNS records:
   - For Netlify/Vercel: Add CNAME to their servers
   - For static hosting: Add A record to server IP
3. Wait for DNS propagation (can take up to 48 hours)

## Updates

To update your deployed app:

1. Make changes locally
2. Commit and push to Git
3. Most hosts auto-deploy on push
4. Or run `npm run build` and re-upload `dist/`

The PWA service worker will auto-update for users on their next visit.

## Security Considerations

- API keys are client-side only - this is acceptable for personal use
- For team use, consider a backend proxy for the Anthropic API
- Always use HTTPS in production
- Keep dependencies updated: `npm audit` and `npm update`

## Scaling

This is a single-user app with local storage. For multi-user:

1. Add authentication (Auth0, Clerk, etc.)
2. Replace IndexedDB with a backend (Firebase, Supabase, PocketBase)
3. Add server-side RSS fetching
4. Implement real sync instead of local-only storage

## Support

If deployment fails:
1. Check build logs for errors
2. Verify all dependencies installed correctly
3. Test the build locally with `npm run preview`
4. Check browser console for runtime errors
