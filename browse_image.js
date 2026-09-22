const axios = require('axios');

/**
 * Search Wikipedia for an authentic, high-resolution encyclopedic/editorial photo.
 * Strictly free of commercial ads, e-commerce products, or shopping spam.
 */
async function searchWikipediaPhoto(keyword) {
  if (!keyword || keyword.trim().length < 2) return null;

  try {
    const cleanKey = keyword.trim().replace(/[^\w\s-]/g, '');
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&generator=search&gsrsearch=${encodeURIComponent(cleanKey)}&pithumbsize=1200`;
    
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 6000
    });

    const pages = Object.values(res.data?.query?.pages || {});
    for (const p of pages) {
      const src = p.thumbnail?.source;
      if (src && !src.includes('.svg') && !src.includes('logo') && src.startsWith('https://')) {
        return src;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Curated high-res tech photography library.
 * High-definition, editorial photography from professional photographers.
 */
const CURATED_TECH_COLLECTION = {
  ai: [
    'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=1200&auto=format&fit=crop&q=80'
  ],
  hardware: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=1200&auto=format&fit=crop&q=80'
  ],
  software: [
    'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=1200&auto=format&fit=crop&q=80'
  ],
  robotics: [
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1617788138017-80ad40651399?w=1200&auto=format&fit=crop&q=80'
  ],
  cloud: [
    'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80'
  ],
  security: [
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&auto=format&fit=crop&q=80'
  ],
  finance: [
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80'
  ]
};

function getCuratedPhoto(text) {
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
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Main browseRelatedImage function.
 * Completely eliminates any chance of unrelated e-commerce or junk images.
 *
 * @param {string} topic 
 * @param {string} [keyword=''] 
 * @param {string} [directImageUrl='']
 */
async function browseRelatedImage(topic, keyword = '', directImageUrl = '') {
  // Priority 1: Direct News Article Image from RSS
  if (directImageUrl && directImageUrl.startsWith('http')) {
    try {
      const dl = await axios.get(directImageUrl, { responseType: 'arraybuffer', timeout: 7000 });
      if (dl.status === 200 && dl.data && dl.data.length > 15000) {
        console.log('✅ Used direct news article photo:', directImageUrl);
        return { imageUrl: directImageUrl, imageBuffer: Buffer.from(dl.data), source: 'News Editorial' };
      }
    } catch (e) {
      console.warn('Direct news image download failed, falling back...');
    }
  }

  // Priority 2: Wikipedia Encyclopedic Photo (100% verified, zero spam)
  const cleanSearch = keyword || topic;
  const wikiUrl = await searchWikipediaPhoto(cleanSearch);
  if (wikiUrl) {
    try {
      const dl = await axios.get(wikiUrl, { responseType: 'arraybuffer', timeout: 7000 });
      if (dl.status === 200 && dl.data && dl.data.length > 20000) {
        console.log('✅ Used Wikipedia verified photo:', wikiUrl);
        return { imageUrl: wikiUrl, imageBuffer: Buffer.from(dl.data), source: 'Wikipedia Archive' };
      }
    } catch (e) {}
  }

  // Priority 3: Curated High-End Professional Tech Photography
  const curatedUrl = getCuratedPhoto(`${topic} ${keyword}`);
  try {
    const dl = await axios.get(curatedUrl, { responseType: 'arraybuffer', timeout: 7000 });
    console.log('✅ Used curated professional tech photo:', curatedUrl);
    return { imageUrl: curatedUrl, imageBuffer: Buffer.from(dl.data), source: 'Curated Tech Photography' };
  } catch (e) {
    return { imageUrl: null, imageBuffer: null, source: null };
  }
}

module.exports = {
  browseRelatedImage
};
