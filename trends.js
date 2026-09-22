const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  },
  timeout: 10000
});

const TECH_AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'llm', 'gpt', 'openai', 'gemini', 'anthropic', 'claude',
  'deep learning', 'machine learning', 'nvidia', 'google', 'meta', 'microsoft', 'agentic',
  'agents', 'tech', 'software', 'cloud', 'cybersecurity', 'robotics', 'automation'
];

/**
 * Extract og:image from article page
 */
async function extractArticleImage(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 6000,
      maxRedirects: 5
    });
    const html = res.data;
    const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                  html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const imgUrl = match ? match[1].replace(/&amp;/g, '&') : null;
    if (imgUrl && imgUrl.startsWith('http') && !imgUrl.includes('logo') && !imgUrl.includes('icon')) {
      return imgUrl;
    }
  } catch (e) {}
  return null;
}

/**
 * Fetch trending AI & Technology topics with authentic news photos.
 */
async function getTrendingTechTopic() {
  const sources = [
    {
      name: 'TechCrunch AI',
      url: 'https://techcrunch.com/category/artificial-intelligence/feed/'
    },
    {
      name: 'The Verge Tech',
      url: 'https://www.theverge.com/rss/index.xml'
    },
    {
      name: 'Google News AI & Emerging Tech',
      url: 'https://news.google.com/rss/search?q=Artificial+Intelligence+OR+Generative+AI+when:2d&hl=en-US&gl=US&ceid=US:en'
    }
  ];

  let candidates = [];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url);
      if (feed && feed.items && feed.items.length > 0) {
        for (const item of feed.items.slice(0, 10)) {
          const title = (item.title || '').trim();
          const snippet = (item.contentSnippet || item.content || '').replace(/<[^>]*>?/gm, '').trim();
          const link = item.link || '';
          if (title.length > 10 && link) {
            candidates.push({
              title,
              snippet: snippet.slice(0, 250),
              source: src.name,
              link: link
            });
          }
        }
      }
      if (candidates.length >= 8) break;
    } catch (err) {
      continue;
    }
  }

  // Filter for tech/AI keywords
  const techFiltered = candidates.filter(c => {
    const text = (c.title + ' ' + c.snippet).toLowerCase();
    return TECH_AI_KEYWORDS.some(k => text.includes(k));
  });

  const selectedList = techFiltered.length > 0 ? techFiltered : candidates;

  if (selectedList.length === 0) {
    return {
      title: 'Agentic AI and Autonomous Reasoning Systems in 2026',
      snippet: 'How multi-step autonomous AI workflows are transforming modern software architectures.',
      source: 'Curated Tech Insights',
      link: '',
      imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&auto=format&fit=crop&q=80'
    };
  }

  // Pick one randomly from the top 5
  const pick = selectedList[Math.floor(Math.random() * Math.min(5, selectedList.length))];
  const cleanTitle = pick.title.replace(/\s*-\s*[^-]+$/, '').trim();

  // Try extracting hero image directly from the article
  let articleImage = null;
  if (pick.link) {
    articleImage = await extractArticleImage(pick.link);
  }

  return {
    title: cleanTitle,
    snippet: pick.snippet,
    source: pick.source,
    link: pick.link,
    imageUrl: articleImage
  };
}

module.exports = {
  getTrendingTechTopic,
  extractArticleImage
};

if (require.main === module) {
  (async () => {
    console.log('Fetching trending tech/AI topic...');
    const topic = await getTrendingTechTopic();
    console.log('Result:', JSON.stringify(topic, null, 2));
  })();
}
