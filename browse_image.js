const axios = require('axios');

/**
 * Search Wikipedia for an authentic, high-resolution encyclopedic/editorial photo.
 */
async function searchWikipediaPhotos(keyword, limit = 2) {
  if (!keyword || keyword.trim().length < 2) return [];

  try {
    const cleanKey = keyword.trim().replace(/[^\w\s-]/g, '');
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&generator=search&gsrsearch=${encodeURIComponent(cleanKey)}&pithumbsize=1200`;
    
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 6000
    });

    const pages = Object.values(res.data?.query?.pages || {});
    const photos = [];
    for (const p of pages) {
      const src = p.thumbnail?.source;
      if (src && !src.includes('.svg') && !src.includes('logo') && src.startsWith('https://')) {
        photos.push({ url: src, source: 'Wikipedia Archive' });
        if (photos.length >= limit) break;
      }
    }
    return photos;
  } catch (e) {
    return [];
  }
}

/**
 * Curated high-res tech photography library.
 */
const CURATED_TECH_COLLECTION = {
  ai: [
    'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&auto=format&fit=crop&q=80'
  ],
  hardware: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=1200&auto=format&fit=crop&q=80'
  ],
  software: [
    'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=1200&auto=format&fit=crop&q=80'
  ],
  robotics: [
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1617788138017-80ad40651399?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=1200&auto=format&fit=crop&q=80'
  ],
  cloud: [
    'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&auto=format&fit=crop&q=80'
  ],
  security: [
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1200&auto=format&fit=crop&q=80'
  ],
  finance: [
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=1200&auto=format&fit=crop&q=80'
  ]
};

function getCuratedPhotos(text, count = 2) {
  const low = text.toLowerCase();
  let category = 'ai';

  if (low.includes('chip') || low.includes('nvidia') || low.includes('gpu') || low.includes('hardware') || low.includes('semiconductor')) {
    category = 'hardware';
  } else if (low.includes('code') || low.includes('developer') || low.includes('software') || low.includes('python') || low.includes('program')) {
    category = 'software';
  } else if (low.includes('robot') || low.includes('automation') || low.includes('drone')) {
    category = 'robotics';
  } else if (low.includes('cloud') || low.includes('server') || low.includes('datacenter') || low.includes('database')) {
    category = 'cloud';
  } else if (low.includes('security') || low.includes('cyber') || low.includes('safety') || low.includes('hack')) {
    category = 'security';
  } else if (low.includes('stock') || low.includes('market') || low.includes('finance') || low.includes('economy')) {
    category = 'finance';
  }

  const list = CURATED_TECH_COLLECTION[category] || CURATED_TECH_COLLECTION.ai;
  return list.slice(0, count).map(url => ({ url, source: 'Curated Photography' }));
}

/**
 * Fetch 3 to 4 related image options for a topic.
 *
 * @param {string} topic 
 * @param {string} [keyword=''] 
 * @param {string} [directImageUrl=''] 
 * @returns {Promise<Array<{ id: number, url: string, source: string }>>}
 */
async function getMultipleImageOptions(topic, keyword = '', directImageUrl = '') {
  const options = [];
  const addedUrls = new Set();

  // 1. Direct Article Image
  if (directImageUrl && directImageUrl.startsWith('http')) {
    options.push({
      id: 1,
      url: directImageUrl,
      source: 'News Editorial'
    });
    addedUrls.add(directImageUrl);
  }

  // 2. Wikipedia High-Res Photos
  const wikiResults = await searchWikipediaPhotos(keyword || topic, 2);
  for (const item of wikiResults) {
    if (!addedUrls.has(item.url)) {
      options.push({
        id: options.length + 1,
        url: item.url,
        source: item.source
      });
      addedUrls.add(item.url);
    }
  }

  // 3. Curated Tech Photos
  const curated = getCuratedPhotos(`${topic} ${keyword}`, 3);
  for (const item of curated) {
    if (!addedUrls.has(item.url) && options.length < 4) {
      options.push({
        id: options.length + 1,
        url: item.url,
        source: item.source
      });
      addedUrls.add(item.url);
    }
  }

  return options.slice(0, 4);
}

/**
 * Helper to download an image URL into a Buffer.
 */
async function downloadImageBuffer(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 7000 });
    if (res.status === 200 && res.data) {
      return Buffer.from(res.data);
    }
  } catch (e) {}
  return null;
}

module.exports = {
  getMultipleImageOptions,
  downloadImageBuffer
};
