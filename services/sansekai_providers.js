/**
 * DracinHub - Sansekai Multi-Provider Service
 * Menangani PineDrama, ReelShort, ShortMax, Melolo, FreeReels, DramaNova
 * dengan IP Rotation, Smart Caching, dan Fallback
 */

const axios = require('axios');

const SANSEKAI_BASE = 'https://api.sansekai.my.id/api';
const providerCache = new Map();
const CACHE_TTL_FEED = 20 * 60 * 1000; // 20 Menit Cache
const CACHE_TTL_DETAIL = 24 * 60 * 60 * 1000; // 24 Jam Cache

function getRandomIp() {
  const p1 = Math.floor(Math.random() * 200 + 20);
  const p2 = Math.floor(Math.random() * 255);
  const p3 = Math.floor(Math.random() * 255);
  const p4 = Math.floor(Math.random() * 254 + 1);
  return `${p1}.${p2}.${p3}.${p4}`;
}

const client = axios.create({
  baseURL: SANSEKAI_BASE,
  timeout: 12000
});

client.interceptors.request.use(config => {
  const fakeIp = getRandomIp();
  config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  config.headers['X-Forwarded-For'] = fakeIp;
  config.headers['X-Real-IP'] = fakeIp;
  config.headers['Client-IP'] = fakeIp;
  config.headers['CF-Connecting-IP'] = fakeIp;
  config.headers['Referer'] = 'https://api.sansekai.my.id/';
  return config;
});

// Normalizers
function normalizeMelolo(raw) {
  if (!raw) return null;
  const id = String(raw.book_id || raw.id || '');
  if (!id) return null;
  return {
    id,
    title: raw.book_name || raw.title || 'Melolo Drama',
    cover: raw.thumb_url || raw.cover || '',
    synopsis: raw.abstract || raw.desc || '',
    episodes: Number(raw.total_episode || raw.chapter_count || 0),
    tags: Array.isArray(raw.tag_list) ? raw.tag_list.map(t => t.tag_name || t) : (Array.isArray(raw.tags) ? raw.tags : []),
    isCompleted: true,
    source: 'melolo'
  };
}

function normalizeFreeReels(raw) {
  if (!raw) return null;
  const id = String(raw.key || raw.id || '');
  if (!id) return null;
  return {
    id,
    title: raw.title || 'FreeReels Drama',
    cover: raw.cover || '',
    synopsis: raw.desc || raw.description || '',
    episodes: Number(raw.total_episodes || raw.episode_count || 0),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    isCompleted: true,
    source: 'freereels'
  };
}

function normalizeShortMax(raw) {
  if (!raw) return null;
  const id = String(raw.shortPlayId || raw.id || '');
  if (!id) return null;
  return {
    id,
    title: raw.name || raw.title || 'ShortMax Drama',
    cover: raw.cover || '',
    synopsis: raw.description || raw.desc || '',
    episodes: Number(raw.totalEpisode || raw.total_episodes || 0),
    tags: Array.isArray(raw.tagNames) ? raw.tagNames : (Array.isArray(raw.tags) ? raw.tags : []),
    isCompleted: true,
    source: 'shortmax'
  };
}

function normalizeReelShort(raw) {
  if (!raw) return null;
  const id = String(raw.book_id || raw.id || '');
  if (!id) return null;
  return {
    id,
    title: raw.book_title || raw.title || 'ReelShort Drama',
    cover: raw.book_pic || raw.cover || '',
    synopsis: raw.book_desc || raw.desc || '',
    episodes: Number(raw.total_chapter || raw.total_episodes || 0),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    isCompleted: true,
    source: 'reelshort'
  };
}

function normalizeDramaNova(raw) {
  if (!raw) return null;
  const id = String(raw.dramaId || raw.id || '');
  if (!id) return null;
  return {
    id,
    title: raw.dramaName || raw.title || 'DramaNova Drama',
    cover: raw.posterImg || raw.cover || '',
    synopsis: raw.dramaIntroduction || raw.description || '',
    episodes: Number(raw.totalEpisode || raw.total_episodes || 0),
    tags: Array.isArray(raw.tags) ? raw.tags : (raw.categoryName ? [raw.categoryName] : []),
    isCompleted: true,
    source: 'dramanova'
  };
}

/**
 * Feed Resolver untuk Provider Khusus Sansekai
 */
async function getSansekaiFeed(source, type = 'foryou', page = 1) {
  const cacheKey = `sansekai_feed_${source}_${type}_${page}`;
  const cached = providerCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_FEED) {
    return cached.data;
  }

  let items = [];

  try {
    if (source === 'melolo') {
      let endpoint = '/melolo/foryou';
      if (type === 'trending') endpoint = '/melolo/trending';
      else if (type === 'latest') endpoint = '/melolo/latest';
      else if (type === 'anime') endpoint = '/melolo/anime';

      const res = await client.get(endpoint);
      const cellData = res.data?.data?.cell?.cell_data || [];
      const books = [];
      cellData.forEach(c => { if (c.books && Array.isArray(c.books)) books.push(...c.books); });
      if (books.length === 0 && res.data?.data?.books) books.push(...res.data.data.books);
      items = books.map(normalizeMelolo).filter(Boolean);
    } else if (source === 'freereels') {
      let endpoint = '/freereels/foryou';
      if (type === 'trending' || type === 'homepage') endpoint = '/freereels/homepage';
      else if (type === 'anime') endpoint = '/freereels/animepage';

      const res = await client.get(endpoint);
      let rawList = [];
      if (res.data?.data?.items && Array.isArray(res.data.data.items)) {
        res.data.data.items.forEach(m => {
          if (m.items && Array.isArray(m.items)) rawList.push(...m.items);
          else rawList.push(m);
        });
      } else if (res.data?.data && Array.isArray(res.data.data)) {
        rawList = res.data.data;
      }
      items = rawList.map(normalizeFreeReels).filter(Boolean);
    } else if (source === 'shortmax') {
      let endpoint = '/shortmax/foryou';
      if (type === 'latest') endpoint = '/shortmax/latest';
      else if (type === 'recommended' || type === 'rekomendasi') endpoint = '/shortmax/rekomendasi';

      const res = await client.get(endpoint);
      const list = res.data?.results || res.data?.data || [];
      items = list.map(normalizeShortMax).filter(Boolean);
    } else if (source === 'reelshort') {
      let endpoint = '/reelshort/foryou';
      if (type === 'trending' || type === 'homepage') endpoint = '/reelshort/homepage';

      const res = await client.get(endpoint);
      const list = res.data?.data?.lists || res.data?.lists || res.data?.data || [];
      items = (Array.isArray(list) ? list : []).map(normalizeReelShort).filter(Boolean);
    } else if (source === 'dramanova') {
      let endpoint = '/dramanova/home';
      if (type === 'drama18') endpoint = '/dramanova/drama18';
      else if (type === 'komik') endpoint = '/dramanova/komik';

      const res = await client.get(endpoint);
      let list = [];
      if (res.data?.data?.recommendModules) list = res.data.data.recommendModules;
      else if (res.data?.rows) list = res.data.rows;
      else if (Array.isArray(res.data?.data)) list = res.data.data;
      items = list.map(normalizeDramaNova).filter(Boolean);
    } else if (source === 'pinedrama') {
      let endpoint = type === 'foryou' ? '/pinedrama/foryou' : '/pinedrama/trending';
      const res = await client.get(endpoint);
      const list = res.data?.collections || res.data?.data?.collections || res.data?.data?.list || [];
      items = list.map(c => ({
        id: String(c.collection_id || c.id),
        title: c.title || 'PineDrama Short Drama',
        cover: c.cover || (Array.isArray(c.cover_urls) ? c.cover_urls[0] : ''),
        synopsis: c.description || '',
        episodes: Number(c.total_episodes || 0),
        tags: Array.isArray(c.tags) ? c.tags : (c.categories ? c.categories.split(',').map(s => s.trim()) : []),
        isCompleted: true,
        source: 'pinedrama'
      }));
    }
  } catch (err) {
    // Return empty on error so caller can fallback to Anichin WebSocket
    items = [];
  }

  if (items.length > 0) {
    // Deduplicate items
    const seen = new Set();
    const deduped = items.filter(d => {
      if (!d.id || seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
    const result = { success: true, source, type, page, items: deduped };
    providerCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  return null;
}

/**
 * Search Resolver untuk Provider Khusus Sansekai
 */
async function searchSansekai(source, query) {
  if (!query || !query.trim()) return [];
  const q = query.trim();

  try {
    let endpoint = `/${source}/search`;
    let res;
    if (source === 'pinedrama' || source === 'melolo' || source === 'shortmax' || source === 'dramanova') {
      res = await client.get(endpoint, { params: { query: q } });
    } else {
      res = await client.get(endpoint, { params: { searchKey: q, query: q } });
    }

    if (source === 'melolo') {
      const list = res.data?.data?.books || res.data?.data?.list || [];
      return list.map(normalizeMelolo).filter(Boolean);
    } else if (source === 'freereels') {
      const list = res.data?.data?.items || res.data?.data || [];
      return list.map(normalizeFreeReels).filter(Boolean);
    } else if (source === 'shortmax') {
      const list = res.data?.results || res.data?.data || [];
      return list.map(normalizeShortMax).filter(Boolean);
    } else if (source === 'reelshort') {
      const list = res.data?.data?.lists || res.data?.lists || [];
      return list.map(normalizeReelShort).filter(Boolean);
    } else if (source === 'dramanova') {
      const list = res.data?.rows || res.data?.data || [];
      return list.map(normalizeDramaNova).filter(Boolean);
    } else if (source === 'pinedrama') {
      const list = res.data?.collections || res.data?.data?.collections || [];
      return list.map(c => ({
        id: String(c.collection_id || c.id),
        title: c.title || 'PineDrama',
        cover: c.cover || '',
        synopsis: c.description || '',
        episodes: Number(c.total_episodes || 0),
        tags: Array.isArray(c.tags) ? c.tags : [],
        isCompleted: true,
        source: 'pinedrama'
      }));
    }
  } catch (e) {
    return [];
  }
  return [];
}

module.exports = {
  getSansekaiFeed,
  searchSansekai,
  getRandomIp
};
