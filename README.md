# 🤖 Telegram-to-LinkedIn Automation Bot

A smart Telegram bot (`@Linkdin_automationbot`) that lets you create and publish thoughtful, human-like LinkedIn posts either from custom topics or automatically fetched trending AI & Technology topics from Google Trends.

---

## ✨ Features

- 💬 **Interactive Telegram Interface**:
  - `/start`: Ask for a topic or pick trending tech/AI.
  - Inline buttons for **Skip Topic**, **Publish to LinkedIn**, **Regenerate**, and **Edit**.
- 🔥 **Real-Time Trending AI & Tech Topics**:
  - Automatically fetches fresh emerging tech/AI news and Google Trends when you skip topic selection.
- 🧠 **Humanic AI Content Engine**:
  - Avoids robotic clichés ("In today's fast-paced digital world...").
  - Expresses personal insights ("apne vichar prakat karna"), structured hooks, actionable bullet points, and high-engagement discussion questions.
- 🚀 **1-Click LinkedIn Publishing**:
  - Preview before posting.
  - Publishes directly to your personal LinkedIn feed via official OAuth 2.0 API.
  - Returns direct live post URL.
- 🔑 **Built-in 1-Click OAuth Helper**:
  - No copying cryptic access tokens manually. Run `npm run auth`, click "Allow" in your browser, and your credentials are auto-saved to `.env`.

---

## 🚀 Quick Start

### 1. Setup Environment
Your `.env` file is already created with your Telegram Bot Token.

```env
TELEGRAM_BOT_TOKEN=8824340603:AAF2YqSuhVbik1hw9EzciR-lRTvEvxh0yUg
GEMINI_API_KEY=your_gemini_api_key_here
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
```

### 2. Connect Your LinkedIn Account
1. Open [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) and click **Create App**.
2. Go to the **Products** tab and add:
   - **Share on LinkedIn**
   - **Sign In with LinkedIn using OpenID Connect**
3. In the **Auth** tab:
   - Copy `Client ID` and `Client Secret` into `.env`.
   - Add `http://localhost:3000/callback` to **Authorized redirect URLs**.
4. In your terminal, run:
   ```bash
   npm run auth
   ```
   Open the displayed link in your browser and click **Allow**. Your tokens and Person ID will automatically be saved into `.env`!

### 3. Add Gemini API Key (Optional for Custom AI Post generation)
- Get a free key at [Google AI Studio](https://aistudio.google.com/).
- Paste it into `.env` under `GEMINI_API_KEY`.
*(If omitted, a smart high-quality humanic template engine will be used automatically).*

### 4. Start the Bot
```bash
npm start
```

Now open Telegram, go to **[@Linkdin_automationbot](https://t.me/Linkdin_automationbot)**, and send `/start`!

---

## 📱 Bot Commands

| Command | Action |
|---|---|
| `/start` | Welcome menu and prompt to enter topic or pick trending AI/Tech |
| `/skip` or `/trend` | Instant search for trending AI/Tech and post draft |
| `/help` or `/setup` | Detailed setup instructions and troubleshooting |

---

## 🛠 Project Structure

```
├── bot.js          # Telegram bot controller & user session handling
├── trends.js       # Google Trends & Tech RSS extractor
├── ai.js           # Humanic post generation engine (Gemini API + smart fallback)
├── linkedin.js     # LinkedIn REST API publishing & user info
├── auth.js         # Local OAuth 2.0 login server to auto-configure .env
├── package.json    # Dependencies and scripts
└── .env            # Private configuration & tokens
```
