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
 * Fetch top 5 trending tech topics from reliable feeds.
 */
async function getTopTrendingTechTopics(count = 5) {
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
      name: 'Google News AI',
      url: 'https://news.google.com/rss/search?q=Artificial+Intelligence+OR+Generative+AI+when:2d&hl=en-US&gl=US&ceid=US:en'
    }
  ];

  let candidates = [];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url);
      if (feed && feed.items && feed.items.length > 0) {
        for (const item of feed.items.slice(0, 10)) {
          const rawTitle = (item.title || '').trim();
          const cleanTitle = rawTitle.replace(/\s*-\s*[^-]+$/, '').trim();
          const snippet = (item.contentSnippet || item.content || '').replace(/<[^>]*>?/gm, '').trim();
          const link = item.link || '';
          if (cleanTitle.length > 15 && link && !candidates.some(c => c.title.toLowerCase() === cleanTitle.toLowerCase())) {
            candidates.push({
              title: cleanTitle,
              snippet: snippet.slice(0, 200),
              source: src.name,
              link: link,
              imageUrl: null
            });
          }
        }
      }
      if (candidates.length >= 10) break;
    } catch (err) {
      continue;
    }
  }

  // Filter for tech/AI keywords
  const techFiltered = candidates.filter(c => {
    const text = (c.title + ' ' + c.snippet).toLowerCase();
    return TECH_AI_KEYWORDS.some(k => text.includes(k));
  });

  const selectedList = (techFiltered.length >= count ? techFiltered : candidates).slice(0, count);

  // If empty, return fallbacks
  if (selectedList.length === 0) {
    return [
      {
        id: 1,
        title: 'Agentic AI Workflows Replacing Traditional SaaS in 2026',
        snippet: 'How multi-step autonomous AI workflows are transforming modern software architectures.',
        source: 'Curated Tech',
        link: '',
        imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&auto=format&fit=crop&q=80'
      },
      {
        id: 2,
        title: 'Next-Gen AI Chips and GPU Architecture Bottlenecks',
        snippet: 'Why memory bandwidth and cooling are the real bottlenecks in hardware.',
        source: 'Curated Tech',
        link: '',
        imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80'
      },
      {
        id: 3,
        title: 'Open Source AI Models vs Closed Proprietary Giants',
        snippet: 'The rapid closing of the performance gap between open and closed models.',
        source: 'Curated Tech',
        link: '',
        imageUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&auto=format&fit=crop&q=80'
      },
      {
        id: 4,
        title: 'The Evolution of Software Engineering in the AI Pair Programming Era',
        snippet: 'How developer roles are shifting towards system architecture and evaluation.',
        source: 'Curated Tech',
        link: '',
        imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&auto=format&fit=crop&q=80'
      },
      {
        id: 5,
        title: 'Cybersecurity and Autonomous Agent Safety in Production',
        snippet: 'Managing risk and prompt injection in high-stakes autonomous workflows.',
        source: 'Curated Tech',
        link: '',
        imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80'
      }
    ];
  }

  // Attach IDs and fetch hero images asynchronously
  const results = [];
  for (let i = 0; i < selectedList.length; i++) {
    const item = selectedList[i];
    let img = null;
    if (item.link) {
      img = await extractArticleImage(item.link);
    }
    results.push({
      id: i + 1,
      title: item.title,
      snippet: item.snippet,
      source: item.source,
      link: item.link,
      imageUrl: img
    });
  }

  return results;
}

module.exports = {
  getTopTrendingTechTopics,
  extractArticleImage
};

if (require.main === module) {
  (async () => {
    console.log('Fetching top 5 trending tech topics...');
    const topics = await getTopTrendingTechTopics(5);
    console.log(JSON.stringify(topics, null, 2));
  })();
}
