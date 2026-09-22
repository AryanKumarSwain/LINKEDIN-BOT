require('dotenv').config();
const axios = require('axios');

// Supported Gemini models in priority order
const MODELS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-flash-lite-latest'];

/**
 * Deep research & humanic post text generation.
 *
 * @param {string} topic - The topic or headline
 * @param {string} [context=''] - Optional additional details or snippet
 * @returns {Promise<{ post: string, imageKeyword: string }>}
 */
async function generateLinkedInPostText(topic, context = '') {
  const geminiKey = process.env.GEMINI_API_KEY;

  const prompt = `You are an elite tech builder, engineering strategist, and authentic thought leader on LinkedIn.
Your audience is engineers, founders, builders, and technology leaders.

TOPIC: "${topic}"
${context ? `CONTEXT / RECENT EVENT: "${context}"` : ''}

TASK:
1. Deeply analyze this topic: Look beyond the surface hype, identify the real technical/practical tension, and formulate genuine personal reflections ("apne vichar prakat kare").
2. Write an authentic, deeply human, scroll-stopping LinkedIn post.
3. Identify 2-3 precise visual keywords for finding an authentic photo representing this subject (e.g. "Nvidia Blackwell chip", "Data center servers", "Software developer code", "Artificial intelligence brain").

CRITICAL WRITING RULES:
- ABSOLUTELY ZERO AI CLICHÉS: Never use "In today's fast-paced digital world", "game-changer", "delve into", "beacon", "revolutionize", "tapestry", or corporate jargon.
- HOOK (1 sentence): A sharp, unexpected observation or counter-intuitive truth that commands attention.
- THE TENSION / REALITY CHECK: Contrast what the hype claims vs. what is actually happening on the ground.
- CORE TAKEAWAYS: 3 clean, well-spaced bullet points with actionable takeaways.
- PERSONAL TAKE: Write in the 1st person ("Here is what I've observed...", "The real question we should be asking...").
- ENGAGEMENT QUESTION: A genuine, thought-provoking question at the end to invite discussion.
- SIGNATURE MANDATE: Place this exact signature directly BEFORE the hashtags:
peace
~SW>IN

- HASHTAGS: 4-5 relevant hashtags placed AFTER the signature.
- LENGTH: 150-250 words.

FORMAT OUTPUT AS STRICT JSON:
{
  "post": "the complete linkedin post with peace\\n~SW>IN right before the # hashtags",
  "imageKeyword": "2-3 precise search words for photo matching"
}`;

  let postText = '';
  let imageKeyword = '';

  if (geminiKey) {
    for (const model of MODELS) {
      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.75,
              topP: 0.95
            }
          },
          { timeout: 20000 }
        );

        const rawJson = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          if (parsed.post) {
            postText = parsed.post;
            imageKeyword = parsed.imageKeyword || '';
            break;
          }
        }
      } catch (err) {
        console.warn(`Gemini model ${model} issue (${err.response?.status || err.message}), trying next fallback...`);
      }
    }
  }

  // Fallback template if needed
  if (!postText) {
    postText = `Most discussions around "${topic}" are focused on the wrong metrics.\n\nWe love debating new tools and frameworks, but the real challenge is almost always operational discipline and system clarity.\n\nHere is what I've noticed:\n\n• Tooling doesn't fix broken workflows: Adding more automation to an ambiguous process only produces chaos at a faster rate.\n\n• Simplicity wins: The most robust architectures are usually the ones with the fewest moving parts and the clearest ownership.\n\n• Focus on velocity, not novelty: If a technology doesn't directly shrink the loop between idea and production feedback, it's just technical vanity.\n\nCurious to know: How is your team approaching "${topic}" right now?\n\npeace\n~SW>IN\n\n#Technology #Engineering #AI #SoftwareArchitecture`;
    imageKeyword = topic.split(' ').slice(0, 3).join(' ');
  }

  // Strictly enforce: peace and ~SW>IN MUST appear right BEFORE the # hashtags
  postText = formatSignatureBeforeHashtags(postText);

  return {
    post: postText.trim(),
    imageKeyword
  };
}

/**
 * Ensures 'peace\n~SW>IN' is placed directly before the # hashtags
 */
function formatSignatureBeforeHashtags(text) {
  const sig = 'peace\n~SW>IN';
  let clean = text.replace(/peace\s*\n\s*~SW>IN/gi, '').trim();

  // Match hashtags block at the end
  const hashtagRegex = /((?:#[^\s#]+\s*)+)$/;
  const match = clean.match(hashtagRegex);

  if (match) {
    const hashtags = match[0].trim();
    const body = clean.slice(0, match.index).trim();
    return `${body}\n\n${sig}\n\n${hashtags}`;
  }

  return `${clean}\n\n${sig}`;
}

module.exports = {
  generateLinkedInPostText
};
