require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const { getTopTrendingTechTopics } = require('./trends');
const { generateLinkedInPostText } = require('./ai');
const { getMultipleImageOptions, downloadImageBuffer } = require('./browse_image');
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
// Stores: { topic, context, draft, directImageUrl, imageOptions, selectedImageIndex, imageBuffer, trendingList }
const userSessions = new Map();

function getSession(chatId) {
  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, {
      topic: '',
      context: '',
      draft: '',
      directImageUrl: '',
      imageOptions: [],
      selectedImageIndex: 0,
      imageBuffer: null,
      trendingList: [],
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

I research topics, draft humanic posts with personal insights, let you pick from 4 real photos, and publish directly to LinkedIn.

📝 *Choose how you want to start:*
• Type & send any *custom topic* you want to write about.
• OR tap *⚡ Skip Topic* to browse *5 Top Trending AI & Tech Stories*!`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚡ Skip Topic (Show 5 Trending Topics)', 'action_trending_list')],
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

// Skip or Trend Command (Shows 5 Topics)
bot.command(['skip', 'trend', 'trends'], async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    getSession(ctx.chat.id).awaitingPasscode = true;
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }
  await handleShowTrendingList(ctx);
});

// Help & Setup Command
bot.command(['help', 'setup'], async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    getSession(ctx.chat.id).awaitingPasscode = true;
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }
  await sendHelpMessage(ctx);
});

// Callback Queries: Show 5 Trending Topics
bot.action('action_trending_list', async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    await ctx.answerCbQuery('Verification required!');
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }
  await ctx.answerCbQuery('Fetching top 5 trending topics...');
  await handleShowTrendingList(ctx);
});

bot.action('action_help', async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    await ctx.answerCbQuery('Verification required!');
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }
  await ctx.answerCbQuery();
  await sendHelpMessage(ctx);
});

// Callback Queries: Select One of the 5 Trending Topics
bot.action(/pick_trend_(\d+)/, async (ctx) => {
  if (!isVerified(ctx.chat.id)) {
    await ctx.answerCbQuery('Verification required!');
    return ctx.reply('🔒 Access restricted. Please enter the verification passcode first:');
  }

  const index = parseInt(ctx.match[1], 10);
  const session = getSession(ctx.chat.id);
  const picked = session.trendingList[index];

  if (!picked) {
    await ctx.answerCbQuery('Topic expired. Refreshing list...');
    return handleShowTrendingList(ctx);
  }

  await ctx.answerCbQuery(`Selected: ${picked.title.slice(0, 30)}...`);
  session.topic = picked.title;
  session.context = picked.snippet;
  session.directImageUrl = picked.imageUrl || '';

  await generateAndPreview(ctx, picked.title, picked.snippet, picked.imageUrl);
});

// Callback Queries: Select Image Option (1, 2, 3, 4, or No Image)
bot.action(/pick_img_(\d+)/, async (ctx) => {
  if (!isVerified(ctx.chat.id)) return;

  const imgIndex = parseInt(ctx.match[1], 10);
  const session = getSession(ctx.chat.id);

  if (!session.imageOptions || !session.imageOptions[imgIndex]) {
    return ctx.answerCbQuery('Image option not found.');
  }

  await ctx.answerCbQuery(`Selected Photo ${imgIndex + 1}!`);
  session.selectedImageIndex = imgIndex;
  const chosen = session.imageOptions[imgIndex];

  // Download buffer
  session.imageBuffer = await downloadImageBuffer(chosen.url);

  // Send visual confirmation
  try {
    await ctx.replyWithPhoto(chosen.url, {
      caption: `✅ *Selected Photo ${imgIndex + 1} of ${session.imageOptions.length}*\n_Source: ${chosen.source}_\n\n👇 Click *[🚀 Publish to LinkedIn]* when ready!`,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    await ctx.reply(`✅ *Selected Photo ${imgIndex + 1}* (${chosen.source})\nReady to publish!`, { parse_mode: 'Markdown' });
  }

  // Re-show Publish Action Buttons
  await showPublishKeyboard(ctx);
});

bot.action('pick_img_none', async (ctx) => {
  if (!isVerified(ctx.chat.id)) return;
  const session = getSession(ctx.chat.id);
  session.imageBuffer = null;
  session.selectedImageIndex = -1;
  await ctx.answerCbQuery('Image removed (Text-Only mode).');
  await ctx.reply('📝 *Text-Only Mode Enabled:* No image will be attached to your post.');
  await showPublishKeyboard(ctx);
});

// Callback Query: Publish to LinkedIn
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
  const statusMsg = await ctx.reply('⏳ Uploading image and publishing post to your LinkedIn feed...');

  try {
    const result = await publishLinkedInPost(session.draft, session.imageBuffer);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      null,
      `🎉 *Post Published Successfully on LinkedIn!* 🚀\n\n🔗 [View Your Live Post](${result.postUrl})\n\nWant to create another post? Just send a new topic or type /start!`,
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
  if (!isVerified(ctx.chat.id)) return;

  const session = getSession(ctx.chat.id);
  if (!session.topic) {
    return ctx.reply('⚠️ No active topic. Please use /start to begin.');
  }

  await ctx.answerCbQuery('Regenerating post...');
  await generateAndPreview(ctx, session.topic, session.context, session.directImageUrl, true);
});

bot.action('action_new_topic', async (ctx) => {
  if (!isVerified(ctx.chat.id)) return;

  const session = getSession(ctx.chat.id);
  session.awaitingTopic = true;
  await ctx.answerCbQuery();
  await ctx.reply('✍️ Please type and send your custom topic:');
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
  session.directImageUrl = '';
  session.awaitingTopic = false;

  await generateAndPreview(ctx, text, '', '');
});

/**
 * Fetch and display 5 trending topics for user to select 1
 */
async function handleShowTrendingList(ctx) {
  const loadingMsg = await ctx.reply('🔍 *Scanning TechCrunch & Tech Feeds for Top 5 Trending Stories...*', { parse_mode: 'Markdown' });

  try {
    const list = await getTopTrendingTechTopics(5);
    const session = getSession(ctx.chat.id);
    session.trendingList = list;

    let messageText = `🔥 *Top 5 Trending AI & Tech Topics:*\n\n`;
    const buttons = [];

    list.forEach((item, idx) => {
      const num = idx + 1;
      messageText += `*${num}️⃣ ${item.title}*\n_${item.snippet.slice(0, 100)}..._\n\n`;
      buttons.push([
        Markup.button.callback(`${num}️⃣ ${item.title.slice(0, 38)}...`, `pick_trend_${idx}`)
      ]);
    });

    messageText += `👉 *Select 1 topic from the buttons below to generate your post:*`;

    buttons.push([
      Markup.button.callback('🔄 Refresh Topics', 'action_trending_list'),
      Markup.button.callback('✏️ Custom Topic', 'action_new_topic')
    ]);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadingMsg.message_id,
      null,
      messageText,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup
      }
    );
  } catch (err) {
    console.error('Error fetching trends list:', err);
    await ctx.reply('⚠️ Could not fetch trends list. Please type a custom topic or try /skip again.');
  }
}

/**
 * Generate post and present 3-4 image choices
 */
async function generateAndPreview(ctx, topic, context = '', directImageUrl = '', isRegen = false) {
  const statusMsg = await ctx.reply(
    isRegen ? '🔄 *Regenerating with fresh perspective & finding photos...*' : '🤖 *Researching, writing humanic post & finding photos...*',
    { parse_mode: 'Markdown' }
  );

  try {
    // 1. Generate post text & keywords
    const { post, imageKeyword } = await generateLinkedInPostText(topic, context);
    const session = getSession(ctx.chat.id);
    session.draft = post;

    // 2. Fetch 3-4 real image options
    const imageOptions = await getMultipleImageOptions(topic, imageKeyword, directImageUrl);
    session.imageOptions = imageOptions;
    session.selectedImageIndex = 0; // Default to option 1

    // Download default option 1 buffer
    if (imageOptions.length > 0) {
      session.imageBuffer = await downloadImageBuffer(imageOptions[0].url);
    } else {
      session.imageBuffer = null;
    }

    // 3. Display the Post Preview
    const previewMessage = 
`📌 *POST PREVIEW:*

━━━━━━━━━━━━━━━━━━━━
${post}
━━━━━━━━━━━━━━━━━━━━`;

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      null,
      previewMessage,
      { parse_mode: 'Markdown' }
    );

    // 4. Send Image Selection Options (3-4 choices)
    await showImageOptions(ctx);

  } catch (err) {
    console.error('Post generation error:', err);
    await ctx.reply('❌ Failed to generate post: ' + err.message);
  }
}

/**
 * Display the 3-4 image options for the user to choose
 */
async function showImageOptions(ctx) {
  const session = getSession(ctx.chat.id);
  const options = session.imageOptions;

  if (!options || options.length === 0) {
    return showPublishKeyboard(ctx);
  }

  // Send photo previews
  let optionsText = `📸 *Select Which Image To Attach (Choose 1 of ${options.length}):*\n\n`;
  const buttons = [];

  options.forEach((opt, idx) => {
    const num = idx + 1;
    const isSelected = idx === session.selectedImageIndex ? '✅ (Selected)' : '';
    optionsText += `*Option ${num}:* [View Photo](${opt.url}) — _${opt.source}_ ${isSelected}\n`;
    buttons.push(Markup.button.callback(`Option ${num} ${isSelected ? '✅' : ''}`, `pick_img_${idx}`));
  });

  const keyboard = [
    buttons,
    [
      Markup.button.callback('🚀 Publish to LinkedIn', 'action_publish'),
      Markup.button.callback('🚫 No Image', 'pick_img_none')
    ],
    [
      Markup.button.callback('🔄 Regenerate Post', 'action_regenerate'),
      Markup.button.callback('✏️ Change Topic', 'action_new_topic')
    ]
  ];

  // Send photo of current selected option
  const currentPhoto = options[session.selectedImageIndex >= 0 ? session.selectedImageIndex : 0];
  try {
    await ctx.replyWithPhoto(currentPhoto.url, {
      caption: optionsText,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
    });
  } catch (photoErr) {
    await ctx.replyWithMarkdown(optionsText, Markup.inlineKeyboard(keyboard));
  }
}

/**
 * Show Publish keyboard
 */
async function showPublishKeyboard(ctx) {
  const session = getSession(ctx.chat.id);
  const hasImg = session.imageBuffer ? '✅ Image Attached' : '📝 Text Only';

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Publish to LinkedIn', 'action_publish')],
    [
      Markup.button.callback('🔄 Regenerate Post', 'action_regenerate'),
      Markup.button.callback('✏️ Change Topic', 'action_new_topic')
    ]
  ]);

  await ctx.reply(`💡 *Post Ready!* (${hasImg})\nClick below to publish directly to your LinkedIn feed:`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });
}

/**
 * Send setup and instructions
 */
async function sendHelpMessage(ctx) {
  const helpText = 
`📖 *LinkedIn Automation Bot Guide*

1️⃣ *How to post:*
• Tap *⚡ Skip Topic* to see *5 Trending AI/Tech Topics*.
• Pick 1 topic to generate a humanic thought-leadership post.
• The bot gives you *3 to 4 related image choices* — pick the best one!
• Click *🚀 Publish to LinkedIn* to post directly to your feed.

2️⃣ *Signature:*
• Automatically formats \`peace\\n~SW>IN\` right before the hashtags.`;

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

  // Keep-alive Self-Ping for Render Free Tier (pings every 12 minutes so it never sleeps!)
  const axios = require('axios');
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    console.log(`⏰ Render Auto Keep-Alive enabled for: ${RENDER_URL}`);
    setInterval(async () => {
      try {
        await axios.get(RENDER_URL);
        console.log('💓 Keep-alive ping sent to keep Render active!');
      } catch (err) {}
    }, 12 * 60 * 1000);
  }
});

// Launch Bot
(async () => {
  try {
    const me = await bot.telegram.getMe();
    console.log(`🤖 Logged in as @${me.username} (${me.first_name})`);
    console.log(`🔐 Access Passcode protection enabled: [${BOT_PASSCODE}]`);
    bot.launch();
    console.log('✅ Bot is running with 5-topic selector & 4-image picker!');
  } catch (err) {
    console.error('❌ Failed to start bot:', err);
  }
})();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
