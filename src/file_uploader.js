const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TEMP_DOWNLOAD_DIR = process.env.TEMP_DOWNLOAD_DIR || '/tmp/shortlink_bot_downloads';
if (!fs.existsSync(TEMP_DOWNLOAD_DIR)) {
  fs.mkdirSync(TEMP_DOWNLOAD_DIR, { recursive: true });
}

/**
 * Downloads a direct file stream to temporary storage
 */
async function downloadFile(url, fileName, onProgress) {
  const safeName = (fileName || 'downloaded_file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(TEMP_DOWNLOAD_DIR, `${Date.now()}_${safeName}`);

  const writer = fs.createWriteStream(filePath);

  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
    timeout: 30000,
  });

  const totalLength = parseInt(response.headers['content-length'] || '0', 10);
  let downloadedBytes = 0;

  response.data.on('data', (chunk) => {
    downloadedBytes += chunk.length;
    if (totalLength > 0 && onProgress) {
      const percent = Math.min(100, Math.round((downloadedBytes / totalLength) * 100));
      onProgress(percent, downloadedBytes, totalLength);
    }
  });

  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', () => resolve({ filePath, totalBytes: downloadedBytes }));
    writer.on('error', (err) => {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
      reject(err);
    });
  });
}

/**
 * Clean up a local temporary file
 */
function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('[Cleanup Error]:', err.message);
  }
}

module.exports = {
  downloadFile,
  cleanupFile,
  TEMP_DOWNLOAD_DIR,
};
