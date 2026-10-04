require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const { bypassShortLink } = require('./bypasser');
const { resolveTargetHost } = require('./host_resolver');
const { downloadFile, cleanupFile } = require('./file_uploader');

const token = process.env.TELEGRAM_BOT_TOKEN || '8536316846:AAHmY7rdftg-5SX8d7w30-PT1-SrnhdPuyc';
if (!token) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Prevent polling crash
bot.on('polling_error', (error) => {
  console.error('[Telegram Polling Error]:', error.code, error.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]:', reason);
});

// Graceful shutdown
const shutdown = () => {
  console.log('🛑 Stopping bot polling gracefully...');
  bot.stopPolling().then(() => process.exit(0)).catch(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Lightweight Health Ping Server for Cloud Runner
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('⚡ LinkShortner File Downloader Bot is Running 24/7 on Cloud!');
});
server.listen(PORT, () => {
  console.log(`🌐 Cloud health server listening on port ${PORT}`);
});

console.log('🤖 =========================================================');
console.log('🚀 LINKSHORTNER FILE DOWNLOADER BOT RUNNING 24/7 ON CLOUD');
console.log('🤖 =========================================================');

/**
 * Escape HTML special characters for Telegram
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Extract first HTTP/HTTPS URL from text
 */
function extractUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/i);
  return match ? match[0] : null;
}

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Friend';

  const welcomeText =
    `👋 <b>Hello ${escapeHtml(firstName)}! Welcome to LinkShortner File Downloader</b>\n\n` +
    `⚡ <b>What I Can Do For You:</b>\n` +
    `• 🚫 <b>Bypass Annoying Ad-Links:</b> Skip 5-minute countdowns, fake buttons, and popups.\n` +
    `• 📦 <b>Direct File Delivery:</b> Get the direct file (.apk, .zip, .mp4, .pdf) delivered straight into your chat!\n` +
    `• 🚀 <b>1-Tap High-Speed Downloads:</b> Instant clean download links with zero waiting time.\n\n` +
    `👇 <b>How to Use:</b>\n` +
    `Simply <b>send or forward any short link</b> (e.g., <code>nowshort.com</code>, <code>liteshort</code>, <code>gplinks</code>, <code>mediafire</code>, etc.) into this chat!`;

  bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📖 How It Works', callback_data: 'help_info' },
          { text: '🌐 Supported Links', callback_data: 'supported_links' },
        ],
      ],
    },
  });
});

// /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  sendHelpMessage(chatId);
});

function sendHelpMessage(chatId) {
  const helpText =
    `📖 <b>LinkShortner File Downloader Guide</b>\n\n` +
    `1️⃣ <b>Copy any short link</b> from Telegram channels, WhatsApp, or websites.\n` +
    `2️⃣ <b>Paste the link</b> directly into this bot.\n` +
    `3️⃣ The bot will automatically bypass all timers and:\n` +
    `   • If file is $\\le$ 50 MB: <b>Sends the file directly</b> into Telegram!\n` +
    `   • If file is &gt; 50 MB: <b>Sends a 1-tap fast direct download link</b> (No Ads).\n\n` +
    `💡 <i>Tip: You can also forward messages containing links directly to this bot!</i>`;

  bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
}

// Inline Callback Queries
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  bot.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'help_info') {
    sendHelpMessage(chatId);
  } else if (data === 'supported_links') {
    const listText =
      `🌐 <b>Supported Shorteners & Hosts:</b>\n\n` +
      `✅ <b>Ad-Link Networks:</b>\n` +
      `• NowShort / LiteShort / Open.nowshort\n` +
      `• GPLinks / Droplink / Rocklinks\n` +
      `• ShortUrlLink / TinyURL / Bitly / Cuttly\n\n` +
      `✅ <b>Direct File Hosts:</b>\n` +
      `• MediaFire (Instant Direct Link & Auto-Download)\n` +
      `• Google Drive (High-Speed Direct Links)\n` +
      `• Pixeldrain / Direct APK / ZIP / MP4 links\n\n` +
      `🚀 <i>Send any link now to try it!</i>`;

    bot.sendMessage(chatId, listText, { parse_mode: 'HTML' });
  }
});

// Main message handler for links
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || msg.caption;

  if (!text || text.startsWith('/start') || text.startsWith('/help')) return;

  const url = extractUrl(text);
  if (!url) {
    return bot.sendMessage(
      chatId,
      '⚠️ <b>No link detected!</b>\nPlease send or forward a valid HTTP/HTTPS short link.',
      { parse_mode: 'HTML' }
    );
  }

  let statusMsg;
  try {
    statusMsg = await bot.sendMessage(chatId, `⏳ <b>Analyzing short link:</b>\n<code>${escapeHtml(url)}</code>\n\n<i>Bypassing timers & redirects...</i>`, {
      parse_mode: 'HTML',
    });
  } catch (e) {}

  try {
    // Step 1: Run Bypasser Engine
    const bypassResult = await bypassShortLink(url);
    const destinationUrl = bypassResult.finalUrl || url;

    // Step 2: Resolve Target Host (MediaFire, GDrive, Direct File)
    const hostInfo = await resolveTargetHost(destinationUrl);

    // If file is eligible for direct Telegram document upload (<= 49 MB)
    if (hostInfo && hostInfo.canTelegramUpload && hostInfo.directUrl) {
      if (statusMsg) {
        try {
          await bot.editMessageText(
            `⚡ <b>Link Bypassed!</b>\n` +
            `📦 <b>File:</b> <code>${escapeHtml(hostInfo.fileName)}</code>\n` +
            `📁 <b>Size:</b> ${escapeHtml(hostInfo.fileSizeText)}\n\n` +
            `📥 <i>Downloading file in cloud & uploading to Telegram...</i>`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id,
              parse_mode: 'HTML',
            }
          );
        } catch (e) {}
      }

      // Download file to temp storage in runner
      let downloaded;
      try {
        downloaded = await downloadFile(hostInfo.directUrl, hostInfo.fileName);

        // Upload directly as document to Telegram chat
        await bot.sendDocument(chatId, downloaded.filePath, {
          caption:
            `✅ <b>Direct File Delivered!</b>\n\n` +
            `📦 <b>Name:</b> ${escapeHtml(hostInfo.fileName)}\n` +
            `📁 <b>Size:</b> ${escapeHtml(hostInfo.fileSizeText)}\n` +
            `🌐 <b>Host:</b> ${escapeHtml(hostInfo.host)}\n` +
            `⚡ <b>Status:</b> 100% Ad-Free & Ready to Use 🎉`,
          parse_mode: 'HTML',
        });

        // Cleanup temp file and status message
        cleanupFile(downloaded.filePath);
        if (statusMsg) {
          try { await bot.deleteMessage(chatId, statusMsg.message_id); } catch (e) {}
        }
        return;
      } catch (uploadErr) {
        console.warn('[Direct Upload Fallback]:', uploadErr.message);
        if (downloaded && downloaded.filePath) cleanupFile(downloaded.filePath);
      }
    }

    // If file > 50MB or web destination: Send clean 1-tap download card
    const targetLink = hostInfo && hostInfo.directUrl ? hostInfo.directUrl : destinationUrl;
    const fileName = (hostInfo && hostInfo.fileName) ? hostInfo.fileName : 'Direct Download';
    const fileSize = (hostInfo && hostInfo.fileSizeText) ? hostInfo.fileSizeText : 'High-Speed Cloud';
    const hostName = (hostInfo && hostInfo.host) ? hostInfo.host : 'Bypassed Destination';

    const cardCaption =
      `✅ <b>Link Successfully Bypassed!</b>\n\n` +
      `📦 <b>Target File:</b> <code>${escapeHtml(fileName)}</code>\n` +
      `📁 <b>Size:</b> ${escapeHtml(fileSize)}\n` +
      `🌐 <b>Host:</b> ${escapeHtml(hostName)}\n` +
      `⏱️ <b>Time Saved:</b> ~3 to 5 Minutes (Zero Ads!)\n\n` +
      `👇 <b>Tap below to download directly (1-Tap):</b>`;

    const buttons = [
      [{ text: '⚡ Direct Download (No Ads)', url: targetLink }],
    ];

    if (bypassResult.originalUrl && bypassResult.originalUrl !== targetLink) {
      buttons.push([{ text: '🔗 View Clean Landing Link', url: targetLink }]);
    }

    if (statusMsg) {
      try {
        await bot.editMessageText(cardCaption, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
          disable_web_page_preview: false,
        });
        return;
      } catch (e) {}
    }

    await bot.sendMessage(chatId, cardCaption, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
      disable_web_page_preview: false,
    });
  } catch (err) {
    console.error('[Bypass Handler Error]:', err.message);
    const errorText =
      `⚠️ <b>Bypass Error:</b>\n${escapeHtml(err.message)}\n\n` +
      `Please ensure the link is active and valid.`;

    if (statusMsg) {
      try {
        await bot.editMessageText(errorText, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'HTML',
        });
        return;
      } catch (e) {}
    }

    bot.sendMessage(chatId, errorText, { parse_mode: 'HTML' });
  }
});
