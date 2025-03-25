const { SMTPServer } = require('smtp-server');
const express = require('express');
const { simpleParser } = require('mailparser');
const path = require('path');
const fs = require('fs');
const https = require('https');

// 配置
const PORT_WEB = 3000;
const PORT_SMTP = 25;
const MAIN_DOMAIN = 'email.yourdomain.com'; // 替换为主域名
const FIXED_DOMAINS = ['yourdomain1.com', 'yourdomain2.com', 'yourdomain3.com']; // 替换为固定域名
const EMAIL_TTL = 24 * 60 * 60 * 1000; // 文件存储 24 小时
const EMAIL_LIFETIME = 10 * 60 * 1000; // 邮箱默认 10 分钟有效期
const EMAIL_DIR = path.join(__dirname, 'emails');

if (!fs.existsSync(EMAIL_DIR)) {
  fs.mkdirSync(EMAIL_DIR);
}

const emailLifetimes = new Map();

function generateEmail(prefix, domain) {
  const randomStr = prefix || Math.random().toString(36).substring(2, 10);
  const cleanPrefix = randomStr.replace(/[^a-zA-Z0-9]/g, '');
  if (!cleanPrefix) throw new Error('Invalid prefix');
  return `${cleanPrefix}@${domain}`;
}

function loadEmails(email) {
  const filePath = path.join(EMAIL_DIR, `${email.replace('@', '_')}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return [];
}

function saveEmails(email, emails) {
  const filePath = path.join(EMAIL_DIR, `${email.replace('@', '_')}.json`);
  fs.writeFileSync(filePath, JSON.stringify(emails, null, 2));
}

function cleanupEmails() {
  const now = Date.now();
  fs.readdirSync(EMAIL_DIR).forEach(file => {
    const email = file.replace('_', '@').replace('.json', '');
    const emails = loadEmails(email);
    const filtered = emails.filter(e => now - e.timestamp < EMAIL_TTL);
    if (filtered.length > 0) {
      saveEmails(email, filtered);
    } else {
      fs.unlinkSync(path.join(EMAIL_DIR, file));
    }
  });
}
setInterval(cleanupEmails, 60 * 1000);

const smtpServer = new SMTPServer({
  authOptional: true,
  onRcptTo(address, session, callback) {
    callback(null);
  },
  onData(stream, session, callback) {
    let emailData = '';
    stream.on('data', chunk => (emailData += chunk));
    stream.on('end', async () => {
      try {
        const parsed = await simpleParser(emailData);
        const to = session.envelope.rcptTo[0].address;

        const expiration = emailLifetimes.get(to);
        if (expiration && Date.now() > expiration) {
          return callback(new Error('Email address expired'));
        }

        const emailEntry = {
          from: parsed.from?.value[0]?.address || 'unknown@example.com',
          fromName: parsed.from?.value[0]?.name || '',
          subject: parsed.subject || 'No Subject',
          body: parsed.text || parsed.html || 'No Content',
          timestamp: Date.now(),
          receivedAt: new Date().toLocaleString()
        };

        const emails = loadEmails(to);
        emails.push(emailEntry);
        saveEmails(to, emails);
        callback(null);
      } catch (err) {
        console.error('Error parsing email:', err);
        callback(err);
      }
    });
  }
});

smtpServer.listen(PORT_SMTP, () => {
  console.log(`SMTP Server running on port ${PORT_SMTP}`);
});

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/main-domain', (req, res) => {
  res.json({ domain: MAIN_DOMAIN });
});

app.get('/api/domains', (req, res) => {
  res.json(FIXED_DOMAINS);
});

app.get('/api/new-email', (req, res) => {
  const domain = req.query.domain || FIXED_DOMAINS[0]; // 如果没有提供 domain，使用默认域名
  const prefix = req.query.prefix || '';
  console.log(`Received domain: ${domain}`); // 调试日志
  try {
    const email = generateEmail(prefix, domain);
    emailLifetimes.set(email, Date.now() + EMAIL_LIFETIME);
    res.json({ email, expiresAt: emailLifetimes.get(email) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/emails/:email', (req, res) => {
  const email = req.params.email;
  const emails = loadEmails(email);
  const expiration = emailLifetimes.get(email) || 0;
  res.json({
    emails: emails.filter(e => Date.now() - e.timestamp < EMAIL_TTL),
    expiresAt: expiration
  });
});

app.get('/api/extend/:email', (req, res) => {
  const email = req.params.email;
  if (emailLifetimes.has(email)) {
    const newExpiration = (emailLifetimes.get(email) || Date.now()) + EMAIL_LIFETIME;
    emailLifetimes.set(email, newExpiration);
    res.json({ expiresAt: newExpiration });
  } else {
    res.status(404).json({ error: 'Email not found or already expired' });
  }
});

const useHttps = fs.existsSync(path.join(__dirname, 'cert', 'server.key')) && 
                 fs.existsSync(path.join(__dirname, 'cert', 'server.crt'));

if (useHttps) {
  const options = {
    key: fs.readFileSync(path.join(__dirname, 'cert', 'server.key')),
    cert: fs.readFileSync(path.join(__dirname, 'cert', 'server.crt'))
  };
  https.createServer(options, app).listen(PORT_WEB, 'localhost', () => {
    console.log(`HTTPS Server running on https://localhost:${PORT_WEB}`);
  });
} else {
  app.listen(PORT_WEB, 'localhost', () => {
    console.log(`HTTP Server running on http://localhost:${PORT_WEB}`);
  });
}
