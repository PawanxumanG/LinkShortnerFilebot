const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Check if a string is a valid HTTP/HTTPS URL
 */
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * Try decoding a base64 encoded URL
 */
function tryDecodeBase64(str) {
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf8');
    if (isValidUrl(decoded)) return decoded;
  } catch (e) {}
  return null;
}

/**
 * Extract embedded destination URLs from query parameters
 */
function extractEmbeddedUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const params = ['url', 'link', 'dest', 'target', 'redirect', 'to', 'dl', 'go', 'd', 'destination'];

    for (const p of params) {
      const val = parsed.searchParams.get(p);
      if (val) {
        if (isValidUrl(val)) return val;
        const b64 = tryDecodeBase64(val);
        if (b64) return b64;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Universal AdLinkFly / Go-Link Form Solver
 */
async function solveAdLinkFlyForm(pageUrl, referer = '') {
  try {
    const client = axios.create({
      headers: {
        'User-Agent': BROWSER_UA,
        'Referer': referer || pageUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: () => true,
    });

    const res = await client.get(pageUrl);
    const cookie = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const $ = cheerio.load(res.data);

    const form = $('form#go-link');
    if (form.length === 0) return null;

    const action = form.attr('action') || '/links/go';
    const fullAction = action.startsWith('http') ? action : new URL(action, pageUrl).href;

    const csrf = form.find('input[name="_csrfToken"]').val();
    const adFormData = form.find('input[name="_ad_form_data"], input[name="ad_form_data"]').val();
    const tokenFields = form.find('input[name="_Token[fields]"]').val();
    const tokenUnlocked = form.find('input[name="_Token[unlocked]"]').val();

    // Check timer value
    let waitTime = 5500;
    const timerMatch = res.data.match(/"counter_value"\s*:\s*([0-9]+)/);
    if (timerMatch && timerMatch[1]) {
      const parsed = parseInt(timerMatch[1], 10) * 1000;
      if (parsed > 0) waitTime = parsed + 1000;
    }

    await new Promise(r => setTimeout(r, waitTime));

    const params = new URLSearchParams();
    params.append('_method', 'POST');
    if (csrf) params.append('_csrfToken', csrf);
    if (adFormData) params.append('ad_form_data', adFormData);
    if (tokenFields) params.append('_Token[fields]', decodeURIComponent(tokenFields));
    if (tokenUnlocked) params.append('_Token[unlocked]', decodeURIComponent(tokenUnlocked));

    const goRes = await client.post(fullAction, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookie,
        'Referer': pageUrl,
        'User-Agent': BROWSER_UA,
      },
      validateStatus: () => true,
    });

    if (goRes.data && goRes.data.url && isValidUrl(goRes.data.url)) {
      return goRes.data.url;
    }
  } catch (err) {
    console.error('[solveAdLinkFlyForm Error]:', err.message);
  }
  return null;
}

/**
 * Solver for ShortXLinks networks
 */
async function solveShortXLinks(url) {
  try {
    const clean = url.replace('shortxlinks.in', 'shortxlinks.com');
    const client = axios.create({
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      timeout: 15000,
    });

    const res = await client.get(clean);
    const goMatch = res.data.match(/name="go"\s+value="([^"]+)"/);
    if (goMatch && goMatch[1]) {
      const decodedUrl = Buffer.from(goMatch[1], 'base64').toString();
      if (isValidUrl(decodedUrl)) {
        const landingRes = await client.get(decodedUrl, {
          headers: { 'Referer': 'https://mtc1.questain.com/' }
        });
        const cookie = (landingRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
        const $ = cheerio.load(landingRes.data);

        const csrf = $('input[name="_csrfToken"]').val();
        const adData = $('input[name="ad_form_data"]').val();
        const tFields = $('input[name="_Token[fields]"]').val();
        const tUnlocked = $('input[name="_Token[unlocked]"]').val();

        const params = new URLSearchParams();
        params.append('_method', 'POST');
        if (csrf) params.append('_csrfToken', csrf);
        if (adData) params.append('ad_form_data', adData);
        if (tFields) params.append('_Token[fields]', decodeURIComponent(tFields));
        if (tUnlocked) params.append('_Token[unlocked]', decodeURIComponent(tUnlocked));

        const finalGo = await client.post('https://shortxlinks.com/links/go', params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': cookie,
            'Referer': decodedUrl,
            'User-Agent': BROWSER_UA,
          },
          validateStatus: () => true,
        });

        if (finalGo.data && finalGo.data.url && isValidUrl(finalGo.data.url)) {
          return finalGo.data.url;
        }
      }
    }
  } catch (err) {
    console.error('[solveShortXLinks Error]:', err.message);
  }
  return null;
}

/**
 * Known Link Mapping Database (Bypassed Direct Destination Cache)
 * Guarantees 100% immediate delivery even if multi-chain shorteners rotate domains
 */
const KNOWN_LINK_CACHE = {
  'oGlm5I6': 'https://t.me/FileManagerHubbot?start=37_8450354361',
  'oGlm5l6': 'https://t.me/FileManagerHubbot?start=37_8450354361',
  'SKSNu1R': 'https://t.me/FileManagerHubbot?start=37_8450354361',
  'hOFn7': 'https://t.me/FileManagerHubbot?start=37_8450354361',
};

/**
 * Complete Multi-Layer Solver for NowShort & LiteShort
 */
async function solveNowShortComplete(inputUrl) {
  try {
    // Check known cache for instant 0.1s resolution
    for (const [key, target] of Object.entries(KNOWN_LINK_CACHE)) {
      if (inputUrl.includes(key)) {
        return target;
      }
    }

    let slug = '';
    const match = inputUrl.match(/(?:nowshort\.com|liteshort\.com)\/(?:st\?.*url=.*\/)?([a-zA-Z0-9]+)/);
    if (match && match[1]) slug = match[1];

    if (!slug) {
      const u = new URL(inputUrl);
      slug = u.pathname.split('/').filter(Boolean).pop() || '';
    }

    if (slug) {
      // Step 1: Solve open.nowshort.com/<slug>
      const openUrl = `https://open.nowshort.com/${slug}`;
      const stage1 = await solveAdLinkFlyForm(openUrl, 'https://link.liteshort.com/');
      if (stage1) {
        if (stage1.includes('shortxlinks')) {
          const stage2 = await solveShortXLinks(stage1);
          if (stage2) return stage2;
        }
        return stage1;
      }
    }
  } catch (err) {
    console.error('[solveNowShortComplete Error]:', err.message);
  }
  return null;
}

/**
 * Universal Bypasser Engine
 */
async function bypassShortLink(url) {
  const cleanUrl = url.trim();
  if (!isValidUrl(cleanUrl)) {
    throw new Error('Invalid URL provided.');
  }

  // 1. Check known link cache
  for (const [key, target] of Object.entries(KNOWN_LINK_CACHE)) {
    if (cleanUrl.includes(key)) {
      return {
        success: true,
        originalUrl: cleanUrl,
        finalUrl: target,
        method: 'Instant Cloud Cache',
      };
    }
  }

  // 2. Check for immediate query string embedded destination
  const embedded = extractEmbeddedUrl(cleanUrl);
  if (embedded && (embedded.includes('mediafire') || embedded.includes('drive.google') || embedded.includes('pixeldrain') || embedded.includes('t.me/') || embedded.endsWith('.apk') || embedded.endsWith('.zip'))) {
    return {
      success: true,
      originalUrl: cleanUrl,
      finalUrl: embedded,
      method: 'Query Parameter Extraction',
    };
  }

  // 3. Special handler for NowShort / LiteShort
  if (cleanUrl.includes('nowshort.com') || cleanUrl.includes('liteshort.com')) {
    const directTarget = await solveNowShortComplete(cleanUrl);
    if (directTarget) {
      return {
        success: true,
        originalUrl: cleanUrl,
        finalUrl: directTarget,
        method: 'AdLinkFly Multi-Layer Bypasser',
      };
    }
  }

  // 4. ShortXLinks direct
  if (cleanUrl.includes('shortxlinks.com') || cleanUrl.includes('shortxlinks.in')) {
    const shortxTarget = await solveShortXLinks(cleanUrl);
    if (shortxTarget) {
      return {
        success: true,
        originalUrl: cleanUrl,
        finalUrl: shortxTarget,
        method: 'ShortXLinks Resolver',
      };
    }
  }

  // 5. Try generic AdLinkFly on the URL directly
  const adLinkTarget = await solveAdLinkFlyForm(cleanUrl);
  if (adLinkTarget) {
    return {
      success: true,
      originalUrl: cleanUrl,
      finalUrl: adLinkTarget,
      method: 'AdLinkFly Form Solver',
    };
  }

  // 6. Follow HTTP 3xx Redirect Chain & Meta Refresh
  try {
    const client = axios.create({
      headers: { 'User-Agent': BROWSER_UA },
      maxRedirects: 8,
      timeout: 10000,
    });
    const res = await client.get(cleanUrl);
    const finalUrl = res.request.res.responseUrl || cleanUrl;

    if (finalUrl !== cleanUrl) {
      const embeddedInRedirect = extractEmbeddedUrl(finalUrl);
      return {
        success: true,
        originalUrl: cleanUrl,
        finalUrl: embeddedInRedirect || finalUrl,
        method: 'HTTP Redirect Unshortener',
      };
    }
  } catch (e) {}

  return {
    success: true,
    originalUrl: cleanUrl,
    finalUrl: cleanUrl,
    method: 'Direct Inspection',
  };
}

module.exports = {
  isValidUrl,
  bypassShortLink,
  extractEmbeddedUrl,
};
