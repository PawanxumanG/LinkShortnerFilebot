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
 * Follow HTTP redirects and meta-refresh tags
 */
async function followRedirects(startUrl, maxHops = 8) {
  let currentUrl = startUrl;
  let cookieJar = '';

  const client = axios.create({
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
    timeout: 10000,
  });

  for (let hop = 0; hop < maxHops; hop++) {
    try {
      const res = await client.get(currentUrl, {
        headers: {
          'Cookie': cookieJar,
          'Referer': currentUrl,
        },
      });

      // Collect cookies
      const setCookies = res.headers['set-cookie'];
      if (setCookies && Array.isArray(setCookies)) {
        const newCookies = setCookies.map(c => c.split(';')[0]).join('; ');
        cookieJar = cookieJar ? `${cookieJar}; ${newCookies}` : newCookies;
      }

      // Check HTTP 3xx Location header
      if (res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) {
          loc = new URL(loc, currentUrl).href;
        }
        currentUrl = loc;
        continue;
      }

      // Check for HTML meta refresh
      if (res.data && typeof res.data === 'string') {
        const metaRefresh = res.data.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[0-9]*;\s*url=([^"'>\s]+)["']?/i);
        if (metaRefresh && metaRefresh[1]) {
          let loc = metaRefresh[1];
          if (!loc.startsWith('http')) {
            loc = new URL(loc, currentUrl).href;
          }
          currentUrl = loc;
          continue;
        }

        // Check for JS redirect (window.location = ...)
        const jsRedirect = res.data.match(/(?:window\.location(?:\.href)?|location\.replace)\s*=\s*["']([^"']+)["']/i);
        if (jsRedirect && jsRedirect[1] && isValidUrl(jsRedirect[1]) && !jsRedirect[1].includes('google.com/search')) {
          currentUrl = jsRedirect[1];
          continue;
        }
      }

      // If no further redirect, return current URL
      break;
    } catch (err) {
      break;
    }
  }

  return currentUrl;
}

/**
 * Specialized Bypasser for NowShort & LiteShort networks
 */
async function bypassNowShort(inputUrl) {
  try {
    const client = axios.create({
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      timeout: 12000,
    });

    const res1 = await client.get(inputUrl);
    const finalUrl = res1.request.res.responseUrl || inputUrl;

    // Check if redirected to liteshort.com/st?api=...
    if (finalUrl.includes('liteshort.com/st?') || res1.data.includes('quick-link')) {
      const $ = cheerio.load(res1.data);
      const csrf = $('input[name="_csrfToken"]').val() || '';
      const tokenFields = $('input[name="_Token[fields]"]').val() || '';
      const tokenUnlocked = $('input[name="_Token[unlocked]"]').val() || '';

      const u = new URL(finalUrl);
      const api = u.searchParams.get('api');
      const urlParam = u.searchParams.get('url');

      if (api && urlParam) {
        const params = new URLSearchParams();
        params.append('_method', 'POST');
        params.append('_csrfToken', csrf);
        params.append('api', api);
        params.append('url', urlParam);
        if (tokenFields) params.append('_Token[fields]', tokenFields);
        if (tokenUnlocked) params.append('_Token[unlocked]', tokenUnlocked);

        const cookie = (res1.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

        const res2 = await axios.post(finalUrl, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie,
            'User-Agent': BROWSER_UA,
            'Referer': finalUrl,
          },
          maxRedirects: 0,
          validateStatus: s => s >= 200 && s < 400,
        });

        if (res2.headers.location) {
          const slug = res2.headers.location.split('/').pop().split('?')[0];
          return {
            bypassed: true,
            slug: slug,
            gatewayUrl: `https://link.liteshort.com/${slug}`,
            intermediateUrl: res2.headers.location,
          };
        }
      }
    }
  } catch (err) {
    console.error('[NowShort Bypass Error]:', err.message);
  }
  return null;
}

/**
 * Universal Bypasser Engine
 * Tries all bypass strategies sequentially and resolves to the final destination
 */
async function bypassShortLink(url) {
  const cleanUrl = url.trim();
  if (!isValidUrl(cleanUrl)) {
    throw new Error('Invalid URL provided.');
  }

  // 1. Check for immediate query string embedded destination
  const embedded = extractEmbeddedUrl(cleanUrl);
  if (embedded && (embedded.includes('mediafire') || embedded.includes('drive.google') || embedded.includes('pixeldrain') || embedded.endsWith('.apk') || embedded.endsWith('.zip'))) {
    return {
      success: true,
      originalUrl: cleanUrl,
      finalUrl: embedded,
      method: 'Query Parameter Extraction',
    };
  }

  // 2. Test NowShort / LiteShort special bypasser
  if (cleanUrl.includes('nowshort.com') || cleanUrl.includes('liteshort.com')) {
    const ns = await bypassNowShort(cleanUrl);
    if (ns && ns.gatewayUrl) {
      return {
        success: true,
        originalUrl: cleanUrl,
        finalUrl: ns.gatewayUrl,
        intermediateUrl: ns.intermediateUrl,
        method: 'NowShort Ad-Engine Bypass',
      };
    }
  }

  // 3. Follow HTTP 3xx Redirect Chain & Meta Refresh
  const unshortened = await followRedirects(cleanUrl);
  if (unshortened && unshortened !== cleanUrl) {
    // Check if the unshortened URL contains embedded target
    const embeddedInRedirect = extractEmbeddedUrl(unshortened);
    const destination = embeddedInRedirect || unshortened;

    return {
      success: true,
      originalUrl: cleanUrl,
      finalUrl: destination,
      method: 'HTTP Redirect Unshortener',
    };
  }

  // 4. Return clean URL as fallback
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
  followRedirects,
  extractEmbeddedUrl,
};
