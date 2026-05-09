const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { PDFDocument } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000; // Node will listen on localhost:3000

// Rate limiting (protect from abuse)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50
});

app.use(limiter);
app.use(cors());
app.use(express.static('public'));
app.use(express.json({ limit: '100mb' })); // Increased for large files

// Ensure temp directories exist
const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'outputs');
[uploadDir, outputDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const pendingDownloads = new Map();

// Cleanup old files every hour
setInterval(() => {
  [uploadDir, outputDir].forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (Date.now() - stats.mtimeMs > 3600000) { // 1 hour
            fs.unlink(filePath, () => {});
          }
        });
      });
    });
  });
}, 3600000);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max for large files
});

// Helper: Run LibreOffice conversion
function convertWithLibreOffice(inputPath, outputFormat, callback) {
  const startedAt = Date.now();
  const outputPath = path.join(outputDir, `${Date.now()}.${outputFormat}`);
  
  // Try to find LibreOffice (Windows: soffice.exe, Linux/Mac: libreoffice)
  const libreOfficeCmd = process.platform === 'win32' 
    ? 'soffice' 
    : 'libreoffice';
  
  const command = `${libreOfficeCmd} --headless --convert-to ${outputFormat} "${inputPath}" --outdir "${outputDir}"`;
  
  console.log(`[CONVERSION] Running: ${command}`);
  
  exec(command, { timeout: 600000 }, (error, stdout, stderr) => { // Increased to 10 minutes
    if (error) {
      console.error(`[ERROR] LibreOffice failed:`, error.message);
      console.error(`[STDERR]`, stderr);
      callback(new Error(`LibreOffice error: ${error.message}`), null);
    } else {
      const generatedFile = findLatestConvertedFile(outputDir, outputFormat, startedAt);
      console.log(`[SUCCESS] Checking for output at: ${generatedFile || '(not found)'}`);

      if (!generatedFile) {
        console.error(`[ERROR] Output file not found for ${inputPath}`);
        callback(new Error('LibreOffice did not generate output file'), null);
        return;
      }

      fs.renameSync(generatedFile, outputPath);
      console.log(`[SUCCESS] File converted and moved to: ${outputPath}`);
      callback(null, outputPath);
    }
  });
}

function findLatestConvertedFile(directory, extension, startedAt) {
  if (!fs.existsSync(directory)) return null;
  
  const matches = fs.readdirSync(directory)
    .filter(file => file.toLowerCase().endsWith(`.${extension.toLowerCase()}`))
    .map(file => {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);
      return { filePath, mtimeMs: stats.mtimeMs };
    })
    .filter(entry => entry.mtimeMs >= startedAt - 1000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return matches[0]?.filePath || null;
}

function cleanupPath(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (_) {}
}

function registerDownload(outputPath, downloadName) {
  const token = crypto.randomUUID();
  pendingDownloads.set(token, {
    outputPath,
    downloadName,
    createdAt: Date.now()
  });
  
  // Clean up after 1 hour
  setTimeout(() => {
    if (pendingDownloads.has(token)) {
      pendingDownloads.delete(token);
      try { fs.unlinkSync(outputPath); } catch(_) {}
    }
  }, 3600000);
  
  return token;
}

app.get('/download/:token', (req, res) => {
  const entry = pendingDownloads.get(req.params.token);
  if (!entry) {
    return res.status(404).json({ error: 'Download expired or not found' });
  }

  res.download(entry.outputPath, entry.downloadName, (error) => {
    pendingDownloads.delete(req.params.token);
    try { fs.unlinkSync(entry.outputPath); } catch (_) {}

    if (error && !res.headersSent) {
      res.status(500).json({ error: 'Download failed' });
    }
  });
});

app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'Document Converter API is live' });
});

// Endpoint 1: Convert DOC/DOCX to PDF
app.post('/convert/doc-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.doc', '.docx'].includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only .doc or .docx files allowed' });
    }
    
    convertWithLibreOffice(req.file.path, 'pdf', (error, outputPath) => {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      
      if (error) {
        console.error('[ERROR] doc-to-pdf failed:', error.message);
        return res.status(500).json({ error: error.message });
      }
      
      const downloadName = `${path.basename(req.file.originalname, ext)}.pdf`;
      const token = registerDownload(outputPath, downloadName);
      res.json({
        fileName: downloadName,
        sourceName: req.file.originalname,
        outputExt: 'pdf',
        size: fs.statSync(outputPath).size,
        downloadUrl: `/download/${token}`
      });
    });
  } catch (error) {
    console.error('[ERROR] doc-to-pdf exception:', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Endpoint 2: Convert Image to PDF
app.post('/convert/image-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!validExts.includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid image format' });
    }
    
    convertWithLibreOffice(req.file.path, 'pdf', (error, outputPath) => {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      
      if (error) {
        console.error('[ERROR] image-to-pdf failed:', error.message);
        return res.status(500).json({ error: error.message });
      }
      
      const downloadName = `${path.basename(req.file.originalname, ext)}.pdf`;
      const token = registerDownload(outputPath, downloadName);
      res.json({
        fileName: downloadName,
        sourceName: req.file.originalname,
        outputExt: 'pdf',
        size: fs.statSync(outputPath).size,
        downloadUrl: `/download/${token}`
      });
    });
  } catch (error) {
    console.error('[ERROR] image-to-pdf exception:', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Endpoint 3: Convert PPT/PPTX to PDF
app.post('/convert/ppt-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.ppt', '.pptx'].includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only .ppt or .pptx files allowed' });
    }

    convertWithLibreOffice(req.file.path, 'pdf', (error, outputPath) => {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      
      if (error) {
        console.error('[ERROR] ppt-to-pdf failed:', error.message);
        return res.status(500).json({ error: error.message });
      }

      const downloadName = `${path.basename(req.file.originalname, ext)}.pdf`;
      const token = registerDownload(outputPath, downloadName);
      res.json({
        fileName: downloadName,
        sourceName: req.file.originalname,
        outputExt: 'pdf',
        size: fs.statSync(outputPath).size,
        downloadUrl: `/download/${token}`
      });
    });
  } catch (error) {
    console.error('[ERROR] ppt-to-pdf exception:', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Endpoint 4: Merge PDFs
app.post('/convert/merge-pdf', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: 'Upload at least 2 PDF files' });
    }
    
    const mergedPdf = await PDFDocument.create();
    
    for (const file of req.files) {
      if (!file.originalname.toLowerCase().endsWith('.pdf')) {
        req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(_) {} });
        return res.status(400).json({ error: 'All files must be PDF' });
      }
      
      const pdfBytes = fs.readFileSync(file.path);
      const pdf = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
      try { fs.unlinkSync(file.path); } catch(_) {}
    }
    
    const mergedPdfBytes = await mergedPdf.save();
    const outputPath = path.join(outputDir, `merged_${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, mergedPdfBytes);
    
    const token = registerDownload(outputPath, 'merged.pdf');
    res.json({
      fileName: 'merged.pdf',
      sourceName: `${req.files.length} files`,
      outputExt: 'pdf',
      size: fs.statSync(outputPath).size,
      downloadUrl: `/download/${token}`
    });
  } catch (error) {
    console.error('[ERROR] merge failed:', error.message);
    res.status(500).json({ error: 'Merge failed: ' + error.message });
  }
});

// Increase server timeout
app.use((req, res, next) => {
  req.setTimeout(600000); // 10 minutes
  res.setTimeout(600000);
  next();
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Node server running on http://127.0.0.1:${PORT}`);
  console.log(`📁 Upload directory: ${uploadDir}`);
  console.log(`📄 Output directory: ${outputDir}`);
});