require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const { getTrendingTechTopic } = require('./trends');
const { generateLinkedInPost } = require('./ai');
const { publishLinkedInPost } = require('./linkedin');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_PASSCODE = process.env.BOT_PASSCODE || '123456';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing in .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Persist verified users to avoid re-asking on restart
const VERIFIED_FILE = path.join(__dirname, '.verified_users.json');
let verifiedUsers = new Set();

try {
  if (fs.existsSync(VERIFIED_FILE)) {
    const raw = fs.readFileSync(VERIFIED_FILE, 'utf-8');
    const list = JSON.parse(raw);
    verifiedUsers = new Set(list);
  }
} catch (e) {
  verifiedUsers = new Set();
}

function persistVerifiedUser(chatId) {
  verifiedUsers.add(chatId);
  try {
    fs.writeFileSync(VERIFIED_FILE, JSON.stringify(Array.from(verifiedUsers)), 'utf-8');
  } catch (err) {
    console.warn('Could not persist verified user:', err.message);
  }
}

// In-memory state store per chat
// Stores: { topic, context, draft, imageUrl, imageBuffer, awaitingTopic, awaitingPasscode }
const userSessions = new Map();

function getSession(chatId) {
  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, {
      topic: '',
      context: '',
      draft: '',
      imageUrl: '',
      imageBuffer: null,
      awaitingTopic: false,
      awaitingPasscode: false
    });
  }
  return userSessions.get(chatId);
}

function isVerified(chatId) {
  return verifiedUsers.has(chatId);
}

async function showStartMenu(ctx) {
  const session = getSession(ctx.chat.id);
  session.awaitingTopic = true;
  session.awaitingPasscode = false;

  const welcomeText = 
`👋 *Welcome to your LinkedIn AI Thought Leader Bot!*

I research topics, draft human-like authentic posts with personal insights, pair them with a 3D visual, and publish directly to your LinkedIn.

📝 *Choose how you want to start:*
• Type & send any *custom topic* you want to write about.
• OR tap the button below to auto-pick a *Trending AI & Tech topic* from Google Trends! ⚡`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚡ Skip Topic (Trending AI/Tech)', 'action_trending')],
    [Markup.button.callback('⚙️ Setup LinkedIn / Help', 'action_help')]
  ]);

  await ctx.replyWithMarkdown(welcomeText, keyboard);
}

// Start Command
bot.command('start', async (ctx) => {
  const chatId = ctx.chat.id;
  const session = getSession(chatId);

  if (!isVerified(chatId)) {
    session.awaitingPasscode = true;
    return ctx.replyWithMarkdown(
      '🔒 *Security Verification Required*\n\nPlease enter the bot access code to continue:'
    );
  }

  await showStartMenu(ctx);
});

// Skip or Trend Command
bot.command(['skip', 'trend', 'trends'], async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    getSession(ctx.chat.id).awaitingPasscode = true;
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }
  await handleTrendingGeneration(ctx);
});

// Help & Setup Command
bot.command(['help', 'setup'], async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    getSession(ctx.chat.id).awaitingPasscode = true;
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }
  await sendHelpMessage(ctx);
});

// Callback Queries
bot.action('action_trending', async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    await ctx.answerCbQuery('Verification required!');
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }
  await ctx.answerCbQuery('Scanning trending stories...');
  await handleTrendingGeneration(ctx);
});

bot.action('action_help', async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    await ctx.answerCbQuery('Verification required!');
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }
  await ctx.answerCbQuery();
  await sendHelpMessage(ctx);
});

bot.action('action_publish', async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    await ctx.answerCbQuery('Verification required!');
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }

  const session = getSession(ctx.chat.id);
  if (!session.draft) {
    return ctx.reply('⚠️ No post draft found. Please use /start to generate a post first.');
  }

  await ctx.answerCbQuery('Publishing to LinkedIn...');
  const statusMsg = await ctx.reply('⏳ Uploading visual and publishing post to your LinkedIn feed...');

  try {
    const result = await publishLinkedInPost(session.draft, session.imageBuffer);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      null,
      `🎉 *Post & Visual Published Successfully!* 🚀\n\nYour post is live on LinkedIn:\n🔗 [View Your Post](${result.postUrl})\n\nWant to create another post? Just send a new topic or type /start!`,
      { parse_mode: 'Markdown', disable_web_page_preview: false }
    );
  } catch (err) {
    console.error('Publish error:', err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      null,
      `❌ *Publishing Failed:*\n_${err.message}_\n\n👉 Click /setup for troubleshooting.`,
      { parse_mode: 'Markdown' }
    );
  }
});

bot.action('action_regenerate', async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    await ctx.answerCbQuery('Verification required!');
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }

  const session = getSession(ctx.chat.id);
  if (!session.topic) {
    return ctx.reply('⚠️ No active topic. Please use /start to begin.');
  }

  await ctx.answerCbQuery('Regenerating post & photo...');
  await generateAndPreview(ctx, session.topic, session.context, true, session.link);
});

bot.action('action_new_topic', async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    await ctx.answerCbQuery('Verification required!');
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }

  const session = getSession(ctx.chat.id);
  session.awaitingTopic = true;
  await ctx.answerCbQuery();
  await ctx.reply('✍️ Please type and send your new topic:');
});

// Handle Text Messages
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const chatId = ctx.chat.id;
  const session = getSession(chatId);

  // Check verification passcode
  if (!isVerified(chatId)) {
    if (text === BOT_PASSCODE) {
      persistVerifiedUser(chatId);
      session.awaitingPasscode = false;
      await ctx.replyWithMarkdown('✅ *Verification Successful! Welcome.* 🎉');
      return showStartMenu(ctx);
    } else {
      return ctx.replyWithMarkdown('❌ *Incorrect code.*\nPlease enter the correct verification passcode:');
    }
  }

  if (text.startsWith('/')) {
    return;
  }

  session.topic = text;
  session.context = '';
  session.awaitingTopic = false;

  await generateAndPreview(ctx, text, '', false);
});

/**
 * Handle fetching trending topic & generating post
 */
async function handleTrendingGeneration(ctx) {
  const loadingMsg = await ctx.reply('🔍 *Scanning Google Trends & Tech Feeds for latest AI & Tech stories...*', { parse_mode: 'Markdown' });

  try {
    const trending = await getTrendingTechTopic();
    const session = getSession(ctx.chat.id);
    session.topic = trending.title;
    session.context = trending.snippet;
    session.link = trending.link || '';
    session.directImageUrl = trending.imageUrl || '';

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMsg.message_id,
      null,
      `🔥 *Trending Story Found:*\n"${trending.title}"\n_Source: ${trending.source}_\n\n🧠 *Researching with Gemini & finding relevant photo...*`,
      { parse_mode: 'Markdown' }
    );

    await generateAndPreview(ctx, trending.title, trending.snippet, false, trending.imageUrl || trending.link);
  } catch (err) {
    console.error('Error fetching trend:', err);
    await ctx.reply('⚠️ Could not fetch trends right now. Please type a custom topic or try /skip again.');
  }
}

/**
 * Generate post and display preview with action buttons
 */
async function generateAndPreview(ctx, topic, context = '', isRegen = false, articleUrl = '') {
  const statusMsg = await ctx.reply(
    isRegen ? '🔄 *Regenerating fresh angle and photo...*' : '🤖 *Researching, writing post & browsing relevant photo...*',
    { parse_mode: 'Markdown' }
  );

  try {
    const { post, imageUrl, imageBuffer, imageSource } = await generateLinkedInPost(topic, context, articleUrl);
    const session = getSession(ctx.chat.id);
    session.draft = post;
    session.imageUrl = imageUrl;
    session.imageBuffer = imageBuffer;

    // Send the browsed visual first
    if (imageUrl) {
      try {
        await ctx.replyWithPhoto(
          imageUrl,
          { caption: `📸 *Related Photo:* "${topic.slice(0, 100)}"\n_Source: ${imageSource || 'Web'}_`, parse_mode: 'Markdown' }
        );
      } catch (photoErr) {
        console.warn('Telegram photo preview warning:', photoErr.message);
      }
    }

    const previewMessage = 
`📌 *POST PREVIEW:*

━━━━━━━━━━━━━━━━━━━━
${post}
━━━━━━━━━━━━━━━━━━━━

🖼 *Attached Photo:* Ready to publish with post!
💡 *Ready to publish to your LinkedIn feed?*`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Publish to LinkedIn', 'action_publish')],
      [
        Markup.button.callback('🔄 Regenerate Angle', 'action_regenerate'),
        Markup.button.callback('✏️ Change Topic', 'action_new_topic')
      ]
    ]);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      null,
      previewMessage,
      {
        reply_markup: keyboard.reply_markup
      }
    );
  } catch (err) {
    console.error('Post generation error:', err);
    await ctx.reply('❌ Failed to generate post: ' + err.message);
  }
}

/**
 * Send setup and instructions
 */
async function sendHelpMessage(ctx) {
  const helpText = 
`📖 *LinkedIn Automation Bot Guide*

1️⃣ *How to post:*
• Send any custom topic or tap *⚡ Skip Topic* for auto-trending AI/Tech.
• The bot researches the topic, writes a humanic post with Gemini, and pairs it with an AI-generated 3D visual.
• Preview the post and image in Telegram.
• Click *🚀 Publish to LinkedIn* to post both text & image directly to your feed!

2️⃣ *Hosting 24/7:*
• **Render.com** (Recommended): Free background worker/web service that runs this bot 24/7 without turning off.`;

  await ctx.replyWithMarkdown(helpText, { disable_web_page_preview: true });
}

// Global Error Handler
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
});

// Launch Lightweight HTTP health check server for Render immediately
const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('LinkedIn Telegram Bot is running 24/7 on Render!\n');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Health check server listening on 0.0.0.0:${PORT}`);
});

// Launch Bot
(async () => {
  try {
    const me = await bot.telegram.getMe();
    console.log(`🤖 Logged in as @${me.username} (${me.first_name})`);
    console.log(`🔐 Access Passcode protection enabled: [${BOT_PASSCODE}]`);
    bot.launch();
    console.log('✅ Bot is running with Gemini 3.6 Flash, Image generation & Passcode protection!');
  } catch (err) {
    console.error('❌ Failed to start bot:', err);
  }
})();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
