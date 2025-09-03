// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const B2 = require('backblaze-b2');
const multer = require('multer');
const path = require('path');
const mime = require('mime-types');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Multer (memory storage) ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB cap
});

// ---- Backblaze Setup ----
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID2,
  applicationKey: process.env.B2_APP_KEY2
});

const B2_BUCKET_ID   = process.env.B2_BUCKET_ID2;
const PUBLIC_BUCKET  = process.env.B2_BUCKET_NAME2;
const PUBLIC_DOMAIN  = process.env.PUBLIC_DOMAIN2;

async function ensureAuth() {
  try {
    await b2.getAccountAuthorization();
  } catch {
    await b2.authorize();
  }
}

// ---- Health check ----
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---- Upload route ----
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const kind = String(req.body.kind || '');
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const ext = mime.extension(req.file.mimetype) 
      || path.extname(req.file.originalname).slice(1);
    const safeName = sanitizeName(req.file.originalname.replace(/\.[^.]+$/, '')) || 'file';
    const key = `${Date.now()}-${safeName}.${ext}`;

    await ensureAuth();
    const { data: upUrl } = await b2.getUploadUrl({ bucketId: B2_BUCKET_ID });

    await b2.uploadFile({
      uploadUrl: upUrl.uploadUrl,
      uploadAuthToken: upUrl.authorizationToken,
      fileName: key,
      data: req.file.buffer,
      mime: req.file.mimetype,
      info: { kind }
    });

    const publicUrl = `${PUBLIC_DOMAIN.replace(/\/$/, '')}/file/${PUBLIC_BUCKET}/${encodeURIComponent(key)}`;
    res.json({ publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'upload_failed' });
  }
});

function sanitizeName(s) {
  return s.toLowerCase()
          .replace(/[^a-z0-9\\-]+/g, '-')   // only keep alphanum + dashes
          .replace(/^-+|-+$/g, '')          // trim leading/trailing dashes
          .slice(0, 120);                   // safety limit
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('API running on :' + PORT));
