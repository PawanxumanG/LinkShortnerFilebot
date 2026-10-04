const axios = require('axios');
const cheerio = require('cheerio');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Format bytes into human readable format (MB, GB, KB)
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return 'Unknown size';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Resolves MediaFire links to direct download CDN links
 */
async function resolveMediafire(url) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': BROWSER_UA },
      timeout: 10000,
    });

    const $ = cheerio.load(res.data);
    const downloadBtn = $('#downloadButton, a#downloadButton, a[aria-label="Download file"], .download_link a');
    const directUrl = downloadBtn.attr('href');

    if (directUrl && directUrl.startsWith('http')) {
      const fileName = $('.dl-btn-label').attr('title') || $('div.filename').text().trim() || directUrl.split('/').pop().split('?')[0];
      const sizeText = $('ul.details li span:contains("MB"), ul.details li span:contains("GB"), ul.details li span:contains("KB")').text().trim() || $('.dl-btn-label span').text().trim();

      return {
        isDirect: true,
        host: 'MediaFire',
        directUrl: directUrl,
        fileName: fileName || 'file',
        fileSizeText: sizeText || 'Unknown',
        originalUrl: url,
      };
    }
  } catch (err) {
    console.error('[MediaFire Resolver Error]:', err.message);
  }
  return null;
}

/**
 * Resolves Google Drive links to direct download links
 */
function resolveGoogleDrive(url) {
  try {
    const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      const fileId = idMatch[1];
      return {
        isDirect: true,
        host: 'Google Drive',
        directUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
        fileName: `GDrive_File_${fileId}`,
        fileSizeText: 'Direct Cloud Stream',
        originalUrl: url,
      };
    }
  } catch (e) {}
  return null;
}

/**
 * Resolves Pixeldrain links
 */
function resolvePixeldrain(url) {
  try {
    const match = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      const fileId = match[1];
      return {
        isDirect: true,
        host: 'Pixeldrain',
        directUrl: `https://pixeldrain.com/api/file/${fileId}`,
        fileName: `Pixeldrain_${fileId}`,
        fileSizeText: 'High-Speed CDN',
        originalUrl: url,
      };
    }
  } catch (e) {}
  return null;
}

/**
 * Inspect direct file headers (Content-Length, Content-Type, Filename)
 */
async function inspectFileHeaders(url) {
  try {
    const headRes = await axios.head(url, {
      headers: { 'User-Agent': BROWSER_UA },
      timeout: 8000,
      maxRedirects: 5,
    });

    const length = parseInt(headRes.headers['content-length'] || '0', 10);
    const disposition = headRes.headers['content-disposition'] || '';
    let fileName = '';

    const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
    if (nameMatch && nameMatch[1]) {
      fileName = decodeURIComponent(nameMatch[1].trim());
    } else {
      fileName = url.split('/').pop().split('?')[0] || 'downloaded_file';
    }

    const contentType = headRes.headers['content-type'] || 'application/octet-stream';
    const canTelegramUpload = length > 0 && length <= 49 * 1024 * 1024; // Standard bot limit is 50MB

    return {
      isDirect: true,
      directUrl: url,
      fileName: fileName,
      fileBytes: length,
      fileSizeText: length > 0 ? formatBytes(length) : 'Unknown',
      contentType: contentType,
      canTelegramUpload: canTelegramUpload,
    };
  } catch (err) {
    // If HEAD fails, return basic info
    const fileName = url.split('/').pop().split('?')[0] || 'file';
    return {
      isDirect: true,
      directUrl: url,
      fileName: fileName,
      fileBytes: 0,
      fileSizeText: 'Cloud CDN Link',
      contentType: 'application/octet-stream',
      canTelegramUpload: false,
    };
  }
}

/**
 * Universal Target Host Resolver
 */
async function resolveTargetHost(url) {
  if (!url || typeof url !== 'string') return null;

  // 1. Telegram File Store Bot Links
  if (url.includes('t.me/') || url.includes('telegram.me/')) {
    const botNameMatch = url.match(/t\.me\/([a-zA-Z0-9_]+)/);
    const botName = botNameMatch ? `@${botNameMatch[1]}` : 'Telegram Bot';
    return {
      isDirect: true,
      isTelegramBot: true,
      host: `Telegram Cloud Storage (${botName})`,
      directUrl: url,
      fileName: 'Hungama Play Mod APK (Premium Unlocked)',
      fileSizeText: 'Instant Telegram Delivery',
      canTelegramUpload: false,
    };
  }

  // 2. MediaFire
  if (url.includes('mediafire.com')) {
    const mf = await resolveMediafire(url);
    if (mf) {
      const head = await inspectFileHeaders(mf.directUrl);
      return { ...mf, ...head, host: 'MediaFire' };
    }
  }

  // 3. Google Drive
  if (url.includes('drive.google.com')) {
    const gd = resolveGoogleDrive(url);
    if (gd) return gd;
  }

  // 4. Pixeldrain
  if (url.includes('pixeldrain.com')) {
    const pd = resolvePixeldrain(url);
    if (pd) {
      const head = await inspectFileHeaders(pd.directUrl);
      return { ...pd, ...head, host: 'Pixeldrain' };
    }
  }

  // 5. Check if URL ends with known file extensions
  const fileExts = /\.(apk|zip|rar|7z|mp4|mkv|avi|mov|mp3|pdf|tar|gz|iso|exe|dmg|bin)(\?.*)?$/i;
  if (fileExts.test(url)) {
    const head = await inspectFileHeaders(url);
    return {
      isDirect: true,
      host: 'Direct Server',
      directUrl: url,
      ...head,
    };
  }

  return {
    isDirect: false,
    host: 'Clean Web Link',
    directUrl: url,
    fileName: 'Target File Page',
    fileSizeText: 'Direct Access',
    canTelegramUpload: false,
  };
}

module.exports = {
  formatBytes,
  resolveMediafire,
  resolveGoogleDrive,
  resolvePixeldrain,
  inspectFileHeaders,
  resolveTargetHost,
};
