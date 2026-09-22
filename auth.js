require('dotenv').config();
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || `http://localhost:${PORT}/callback`;

const ENV_PATH = path.join(__dirname, '.env');

function updateEnvFile(updates) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf-8');
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(ENV_PATH, content.trim() + '\n');
}

async function startAuthFlow() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('\n======================================================');
    console.error('⚠️  MISSING LINKEDIN CREDENTIALS IN .env');
    console.error('======================================================');
    console.error('Please open .env and enter your LinkedIn Developer credentials:');
    console.error('  LINKEDIN_CLIENT_ID=your_client_id_here');
    console.error('  LINKEDIN_CLIENT_SECRET=your_client_secret_here');
    console.error('\nHow to get them:');
    console.error('1. Go to: https://www.linkedin.com/developers/apps');
    console.error('2. Create an App (or open existing).');
    console.error('3. In "Products" tab, request:');
    console.error('   - "Share on LinkedIn"');
    console.error('   - "Sign In with LinkedIn using OpenID Connect"');
    console.error('4. In "Auth" tab, copy Client ID & Client Secret.');
    console.error(`5. Under "Authorized redirect URLs for your app", add:\n   ${REDIRECT_URI}`);
    console.error('======================================================\n');
    process.exit(1);
  }

  const scopes = encodeURIComponent('openid profile email w_member_social');
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}`;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === '/callback') {
      const code = parsedUrl.query.code;
      const error = parsedUrl.query.error;
      const errorDesc = parsedUrl.query.error_description;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>❌ LinkedIn Authorization Failed</h2><p>${error}: ${errorDesc}</p>`);
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h2>❌ Missing authorization code</h2>');
        return;
      }

      try {
        console.log('\nExchanging authorization code for Access Token...');

        // Exchange code for token
        const tokenRes = await axios.post(
          'https://www.linkedin.com/oauth/v2/accessToken',
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );

        const accessToken = tokenRes.data.access_token;
        const expiresIn = tokenRes.data.expires_in;

        console.log('✅ Access Token acquired successfully! (Expires in ' + Math.round(expiresIn / 86400) + ' days)');

        // Fetch user profile info
        console.log('Fetching LinkedIn user profile details...');
        const userinfoRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        const userInfo = userinfoRes.data;
        const personUrn = `urn:li:person:${userInfo.sub}`;
        const userName = userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim();

        // Update .env
        updateEnvFile({
          LINKEDIN_ACCESS_TOKEN: accessToken,
          LINKEDIN_PERSON_URN: personUrn
        });

        console.log(`✅ Connected LinkedIn account: ${userName} (${personUrn})`);
        console.log('✅ Updated .env automatically!\n');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>LinkedIn Connected!</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
              .card { background: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 480px; }
              h1 { color: #38bdf8; margin-bottom: 12px; }
              p { color: #94a3b8; line-height: 1.6; }
              .badge { display: inline-block; background: #0284c7; color: white; padding: 6px 14px; border-radius: 20px; font-weight: bold; margin-top: 15px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>🎉 LinkedIn Connected!</h1>
              <p>Welcome, <strong>${userName}</strong>!</p>
              <p>Your access token has been safely stored in <code>.env</code>.</p>
              <div class="badge">Ready to Post</div>
              <p style="margin-top: 25px; font-size: 14px;">You can now close this tab and return to your Telegram bot.</p>
            </div>
          </body>
          </html>
        `);

        setTimeout(() => {
          server.close();
          console.log('Authentication server closed. You are ready to launch "npm start"!');
          process.exit(0);
        }, 2000);

      } catch (tokenErr) {
        console.error('Error exchanging token:', tokenErr.response?.data || tokenErr.message);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>❌ Authentication Error</h2><p>${tokenErr.response?.data?.error_description || tokenErr.message}</p>`);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log('\n======================================================');
    console.log(`🚀 LinkedIn OAuth Server running on http://localhost:${PORT}`);
    console.log('======================================================');
    console.log('Please open the following link in your browser to authorize:');
    console.log('\n🔗 ' + authUrl + '\n');
    console.log('Waiting for approval in browser...');
    console.log('======================================================\n');

    // Auto-open browser on Windows
    require('child_process').exec(`start "" "${authUrl}"`, (err) => {
      if (err) {
        // Ignored if cannot auto-open, user can click the terminal link
      }
    });
  });
}

startAuthFlow();
