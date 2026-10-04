# ⚡ LinkShortner File Downloader (@LinkShortnerFilebot)

A powerful, automated Telegram Bot running 24/7 on GitHub Actions cloud infrastructure. It bypasses intrusive ad-shortened links (skipping 5-minute countdown timers, fake buttons, and popups) and delivers the clean direct file or high-speed 1-tap download link directly to Telegram users in seconds.

---

## 🌟 Key Features

* 🚫 **Ad-Bypass Engine:** Automates navigation through intermediate ad networks (NowShort, LiteShort, GPLinks, Droplink, Rocklinks, etc.) in 2–4 seconds.
* 📦 **Direct Telegram File Delivery:** Automatically downloads files $\le$ 50 MB at cloud speed (10 Gbps) and sends the `.apk`, `.zip`, `.mp4`, or `.pdf` file directly into your Telegram chat.
* ⚡ **1-Tap Direct Downloads:** For files $> 50$ MB, generates clean direct CDN links (zero ads, zero timers).
* 📁 **Smart Host Resolvers:** Built-in direct decoders for MediaFire, Google Drive, Pixeldrain, and direct CDN storage.
* ☁️ **Zero-Cost 24/7 Cloud Hosting:** Hosted autonomously on GitHub Actions runners with automated keep-alive scheduling.

---

## 🤖 Telegram Bot Info

* **Bot Username:** [@LinkShortnerFilebot](https://t.me/LinkShortnerFilebot)
* **Status:** 24/7 Online on GitHub Cloud Runner

---

## 🛠️ Local Development & Testing

1. **Clone the repository:**
   ```bash
   git clone https://github.com/PawanxumanG/LinkShortnerFilebot.git
   cd LinkShortnerFilebot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file with:
   ```env
   TELEGRAM_BOT_TOKEN=8536316846:AAHmY7rdftg-5SX8d7w30-PT1-SrnhdPuyc
   PORT=3000
   ```

4. **Run the bot:**
   ```bash
   npm start
   ```

---

## 🚀 24/7 Cloud Deployment

The repository includes a GitHub Actions workflow (`.github/workflows/bot_runner.yml`) that automatically launches and monitors the bot on GitHub runners with scheduled restarts every 5 hours.