/**
 * DracinHub - Anichin Short Drama Service
 * Direct HTTP REST API & WebSocket Multiplexing ke https://api.anichin.bio
 * API Key #1: ANICHIN-A5A16A417FC3EBA15BE691F2B9AA6DA1
 */

const axios = require('axios');
const WebSocket = require('ws');

const ANICHIN_API_URL = 'https://api.anichin.bio';
const ANICHIN_WS_URL = 'wss://miniapp.anichin.bio/ws';
const DEFAULT_TOKEN = 'ANICHIN-A5A16A417FC3EBA15BE691F2B9AA6DA1';

const SOURCES = {
  dramabox:   { name: 'DramaBox',   id: '42000007806', badge: 'Popular', desc: 'Provider drama box nomor 1 di Asia', icon: '/assets/logos/dramabox.png' },
  reelshort:  { name: 'ReelShort',  id: '699d1eefa3a7262cff05534b', badge: 'Hot', desc: 'Drama pendek romantis dan billionaire viral', icon: '/assets/logos/reelshort.png' },
  shortmax:   { name: 'ShortMax',   id: '18854', badge: 'Trending', desc: 'Katalog ribuan drama pendek bertema CEO & Reinkarnasi', icon: '/assets/logos/shortmax.png' },
  netshort:   { name: 'NetShort',   id: '2034157133506805762', badge: 'Direct MP4', desc: 'Kualitas original MP4 dengan sulih suara Indonesia', icon: '/assets/logos/netshort.png' },
  goodshort:  { name: 'GoodShort',  id: '31001188126', badge: 'Recom', desc: 'Drama pilihan terfavorit penonton', icon: '/assets/logos/goodshort.png' },
  dramawave:  { name: 'DramaWave',  id: 'LeMYdgoXZM', badge: 'HD & Subtitle', desc: 'Direct M3U8 streaming dengan 20+ subtitle multi-bahasa', icon: '/assets/logos/dramawave.png' },
  flickreels: { name: 'FlickReels', id: '5672', badge: 'Top Rank', desc: 'Serial drama rating tinggi', icon: '/assets/logos/flickreels.png' },
  freereels:  { name: 'FreeReels',  id: '51bAUXzvfP', badge: 'Gratis & Sub', desc: 'Direct stream cepat dengan subtitle Indonesia', icon: '/assets/logos/freereels.png' },
  idrama:     { name: 'iDrama',     id: '160000641712', badge: 'Viral', desc: 'Koleksi drama pendek Asia terpopuler', icon: '/assets/logos/idrama.png' },
  dramanova:  { name: 'DramaNova',  id: '102062', badge: 'Romance / 18+', desc: 'Drama romantis & dewasa', icon: '/assets/logos/dramanova.png' },
  starshort:  { name: 'StarShort',  id: 'j0NM', badge: 'Popular', desc: 'Serial drama pendek bintang viral', icon: '/assets/logos/starshort.png' },
  dramabite:  { name: 'DramaBite',  id: '15384', badge: 'Fresh', desc: 'Update drama baru setiap hari', icon: '/assets/logos/dramabite.png' }
};

function getToken() {
  return process.env.ANICHIN_API_KEY || DEFAULT_TOKEN;
}

const httpClient = axios.create({
  baseURL: ANICHIN_API_URL,
  timeout: 10000
});

// WebSocket Connection Management
let ws = null;
let wsReady = false;
let reqCounter = 0;
const pendingCallbacks = new Map();
const memoryCache = new Map();
const knownDramaMetadata = new Map();
let authResolvers = [];

const CACHE_TTL_FEED_MS = 10 * 60 * 1000;
const CACHE_TTL_DETAIL_MS = 30 * 60 * 1000;
const CACHE_TTL_EPISODE_MS = 15 * 60 * 1000;
const CACHE_TTL_SEARCH_MS = 5 * 60 * 1000;

function initWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(ANICHIN_WS_URL);

    ws.on('open', () => {
      console.log('✅ Connected to Anichin Official WebSocket Gateway');
      const token = getToken();
      ws.send(JSON.stringify({ type: 'auth', token }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth') {
          wsReady = true;
          console.log(`🔐 Anichin Auth Status: ${msg.message || 'OK'}`);
          authResolvers.forEach(fn => fn());
          authResolvers = [];
        }

        if (msg.id && pendingCallbacks.has(msg.id)) {
          const { resolve, reject, timer } = pendingCallbacks.get(msg.id);
          clearTimeout(timer);
          pendingCallbacks.delete(msg.id);

          if (msg.error) {
            reject(new Error(msg.error + (msg.message ? ': ' + msg.message : '')));
          } else {
            resolve(msg);
          }
        }
      } catch (err) {}
    });

    ws.on('close', () => {
      wsReady = false;
      for (const [id, item] of pendingCallbacks.entries()) {
        clearTimeout(item.timer);
        item.reject(new Error('Koneksi WebSocket terputus'));
      }
      pendingCallbacks.clear();
      setTimeout(initWebSocket, 2000);
    });

    ws.on('error', () => {
      wsReady = false;
      try { ws.close(); } catch {}
    });
  } catch (e) {
    setTimeout(initWebSocket, 3000);
  }
}

initWebSocket();

function waitForWsReady(timeoutMs = 12000) {
  if (wsReady && ws && ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }
  initWebSocket();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = authResolvers.indexOf(onReady);
      if (idx !== -1) authResolvers.splice(idx, 1);
      if (wsReady) resolve();
      else reject(new Error('Koneksi ke server gateway Anichin timeout'));
    }, timeoutMs);

    const onReady = () => {
      clearTimeout(timer);
      resolve();
    };
    authResolvers.push(onReady);
  });
}

async function sendWsRequest(source, path, params = {}) {
  await waitForWsReady();
  return new Promise((resolve, reject) => {
    const id = 'dracin_' + Date.now() + '_' + (++reqCounter);
    const timer = setTimeout(() => {
      if (pendingCallbacks.has(id)) {
        pendingCallbacks.delete(id);
        reject(new Error('Permintaan ke API drama timeout (30 detik)'));
      }
    }, 30000);

    pendingCallbacks.set(id, { resolve, reject, timer });

    const payload = {
      id,
      action: 'execute',
      source,
      path,
      params
    };

    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      clearTimeout(timer);
      pendingCallbacks.delete(id);
      reject(err);
    }
  });
}

/**
 * Universal Unified Caller: Direct HTTP (api.anichin.bio) -> WebSocket Fallback
 */
async function callAnichinApi(source, endpoint, params = {}) {
  const token = getToken();
  
  // 1. Coba Direct HTTP REST API (api.anichin.bio)
  try {
    const res = await httpClient.get(`/${source}/${endpoint}`, {
      params: { ...params, token },
      headers: {
        'X-API-Key': token,
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 8000
    });
    if (res.data && res.status === 200) {
      return res.data;
    }
  } catch (httpErr) {}

  // 2. Fallback otomatis ke WebSocket Gateway (miniapp.anichin.bio)
  try {
    const wsRes = await sendWsRequest(source, endpoint, params);
    if (wsRes && wsRes.data) {
      return wsRes.data;
    }
  } catch (wsErr) {}

  return null;
}

/**
 * Normalisasi item drama dari berbagai struktur response
 */
function normalizeDramaList(raw) {
  if (!raw) return [];
  let items = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw.items && Array.isArray(raw.items)) {
    items = raw.items;
  } else if (raw.rows && Array.isArray(raw.rows)) {
    items = raw.rows;
  } else if (raw.data && Array.isArray(raw.data)) {
    items = raw.data;
  } else if (raw.list && Array.isArray(raw.list)) {
    items = raw.list;
  } else if (raw.results && Array.isArray(raw.results)) {
    items = raw.results;
  } else if (raw.books && Array.isArray(raw.books)) {
    items = raw.books;
  }

  return items.map(item => {
    const id = String(
      item.id || item.book_id || item.bookId || item.shortPlayId ||
      item.dramaId || item.key || item.series_id || item.collection_id || ''
    );
    const title = item.title || item.name || item.book_name || item.book_title || item.dramaName || 'Tanpa Judul';
    const cover = item.cover || item.cover_url || item.coverUrl || item.thumb_url || item.book_pic || item.posterImg || item.img || '';
    const synopsis = item.synopsis || item.description || item.abstract || item.book_desc || item.desc || item.dramaIntroduction || '';
    const episodes = Number(item.episodes || item.total_episodes || item.total_episode || item.total_chapter || item.chapter_count || item.totalEpisode || 0);

    let tags = [];
    if (Array.isArray(item.tags)) {
      tags = item.tags.map(t => typeof t === 'string' ? t : (t.name || t.tag_name || '')).filter(Boolean);
    } else if (typeof item.tags === 'string' && item.tags.trim()) {
      tags = item.tags.split(',').map(s => s.trim()).filter(Boolean);
    } else if (Array.isArray(item.tag_list)) {
      tags = item.tag_list.map(t => t.tag_name || t.name || t).filter(Boolean);
    } else if (Array.isArray(item.tagNames)) {
      tags = item.tagNames.filter(Boolean);
    }

    if (id && title && title !== 'Tanpa Judul') {
      knownDramaMetadata.set(id, { title, cover, synopsis, episodes, tags });
    }

    return {
      id,
      title,
      cover,
      synopsis,
      episodes,
      tags,
      isCompleted: Boolean(item.isCompleted || item.is_completed || item.finished)
    };
  }).filter(item => item.id && item.title);
}

/**
 * Normalisasi detail drama dan daftar episode
 */
function normalizeDramaDetail(raw, fallbackId = '') {
  if (!raw) return null;
  const data = raw.data || raw;

  const id = String(
    data.id || data.book_id || data.bookId || data.shortPlayId ||
    data.dramaId || data.key || data.series_id || fallbackId || ''
  );
  const title = data.title || data.name || data.book_name || data.book_title || data.dramaName || 'Tanpa Judul';
  const cover = data.cover || data.cover_url || data.coverUrl || data.thumb_url || data.book_pic || data.posterImg || '';
  const synopsis = data.synopsis || data.description || data.abstract || data.book_desc || data.desc || data.dramaIntroduction || '';
  const totalEpisodes = Number(data.totalEpisodes || data.episodes || data.total_episodes || data.total_episode || data.total_chapter || data.chapter_count || data.totalEpisode || 0);

  let rawEpisodes = [];
  if (Array.isArray(data.episodes)) {
    rawEpisodes = data.episodes;
  } else if (Array.isArray(data.episode_list)) {
    rawEpisodes = data.episode_list;
  } else if (Array.isArray(data.chapter_list)) {
    rawEpisodes = data.chapter_list;
  } else if (Array.isArray(data.list)) {
    rawEpisodes = data.list;
  }

  let episodes = [];
  if (rawEpisodes.length > 0) {
    episodes = rawEpisodes.map((ep, index) => {
      const epNum = Number(ep.episodeNumber || ep.episode_number || ep.ep || ep.chapter_index || ep.chapter_id || (index + 1));
      const epTitle = ep.title || ep.name || ep.chapter_title || `Episode ${epNum}`;
      const isLocked = Boolean(ep.isLocked || ep.is_locked || ep.is_lock || false);
      if (videoUrl.startsWith('/api/') || videoUrl.startsWith('/')) {
        const token = getToken();
        const cleanPath = videoUrl.startsWith('/api/') ? videoUrl.substring(4) : videoUrl;
        videoUrl = `${ANICHIN_API_URL}${cleanPath}${cleanPath.includes('?') ? '&' : '?'}token=${token}`;
      }
      return {
        episodeNumber: epNum,
        title: epTitle,
        isLocked,
        videoUrl
      };
    });
  } else if (totalEpisodes > 0) {
    for (let i = 1; i <= totalEpisodes; i++) {
      episodes.push({
        episodeNumber: i,
        title: `Episode ${i}`,
        isLocked: false,
        videoUrl: ''
      });
    }
  }

  let tags = [];
  if (Array.isArray(data.tags)) {
    tags = data.tags.map(t => typeof t === 'string' ? t : (t.name || t.tag_name || '')).filter(Boolean);
  } else if (typeof data.tags === 'string' && data.tags.trim()) {
    tags = data.tags.split(',').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(data.tag_list)) {
    tags = data.tag_list.map(t => t.tag_name || t.name || t).filter(Boolean);
  }

  return {
    id,
    title,
    cover,
    synopsis,
    totalEpisodes: episodes.length || totalEpisodes,
    episodes,
    tags,
    isCompleted: Boolean(data.isCompleted || data.is_completed || data.finished)
  };
}

/**
 * Normalisasi stream episode video
 */
function normalizeEpisodeStream(raw, source, id, epNum) {
  if (!raw) return null;
  const data = raw.data || raw;
  const token = getToken();

  let videoUrl = '';
  let qualities = [];
  let subtitles = [];

  if (typeof data === 'string' && (data.startsWith('http://') || data.startsWith('https://'))) {
    videoUrl = data;
  } else {
    videoUrl = data.videoUrl || data.video_url || data.url || data.play_url || data.hls_url || data.m3u8 || data.stream_url || '';
    if (videoUrl.startsWith('/api/') || videoUrl.startsWith('/')) {
      const cleanPath = videoUrl.startsWith('/api/') ? videoUrl.substring(4) : videoUrl;
      videoUrl = `${ANICHIN_API_URL}${cleanPath}${cleanPath.includes('?') ? '&' : '?'}token=${token}`;
    }

    if (Array.isArray(data.qualities) && data.qualities.length > 0) {
      qualities = data.qualities.map(q => {
        let qUrl = q.url || q.video_url || q.play_url || '';
        if (qUrl.startsWith('/api/') || qUrl.startsWith('/')) {
          const cleanPath = qUrl.startsWith('/api/') ? qUrl.substring(4) : qUrl;
          qUrl = `${ANICHIN_API_URL}${cleanPath}${cleanPath.includes('?') ? '&' : '?'}token=${token}`;
        }
        return {
          label: q.label || q.name || q.resolution || `${q.height || ''}p`,
          url: qUrl,
          isDefault: Boolean(q.isDefault || q.default || false)
        };
      }).filter(q => q.url);
    } else if (Array.isArray(data.qualityList) && data.qualityList.length > 0) {
      qualities = data.qualityList.map(q => {
        let qUrl = q.url || q.videoUrl || '';
        if (qUrl.startsWith('/api/') || qUrl.startsWith('/')) {
          const cleanPath = qUrl.startsWith('/api/') ? qUrl.substring(4) : qUrl;
          qUrl = `${ANICHIN_API_URL}${cleanPath}${cleanPath.includes('?') ? '&' : '?'}token=${token}`;
        }
        return {
          label: q.label || q.name || `${q.quality || ''}`,
          url: qUrl,
          isDefault: Boolean(q.isDefault)
        };
      }).filter(q => q.url);
    }

    if (Array.isArray(data.subtitles) && data.subtitles.length > 0) {
      subtitles = data.subtitles.map(s => ({
        language: s.language || s.lang || s.name || 'Unknown',
        code: s.code || s.lang_code || s.srclang || 'id',
        url: s.url || s.subtitle_url || s.src || '',
        format: s.format || (s.url && s.url.endsWith('.vtt') ? 'vtt' : 'srt')
      })).filter(s => s.url);
    } else if (Array.isArray(data.captionList) && data.captionList.length > 0) {
      subtitles = data.captionList.map(c => ({
        language: c.language || c.lang || 'Unknown',
        code: c.code || c.lang_code || 'id',
        url: c.url || '',
        format: 'vtt'
      })).filter(s => s.url);
    }
  }

  if (!videoUrl && qualities.length > 0) {
    const def = qualities.find(q => q.isDefault) || qualities[0];
    videoUrl = def.url;
  }

  return {
    videoUrl,
    qualities,
    subtitles
  };
}

function getSources() {
  return Object.entries(SOURCES).map(([key, val]) => ({
    key,
    name: val.name,
    badge: val.badge,
    desc: val.desc,
    icon: val.icon || ''
  }));
}

async function getFeed(source = 'dramawave', type = 'trending', page = 1) {
  const cacheKey = `feed_${source}_${type}_${page}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_FEED_MS) {
    return cached.data;
  }

  // 1. Ambil data dari Anichin (Direct HTTP api.anichin.bio -> WS fallback)
  let anichinItems = [];
  const params = {};
  if (type === 'foryou' || type === 'latest' || type === 'new' || type === 'romance') {
    params.page = String(page);
  }

  const rawData = await callAnichinApi(source, type, params);
  if (rawData) {
    anichinItems = normalizeDramaList(rawData);
  }

  if (anichinItems.length === 0) {
    const trendingData = await callAnichinApi(source, 'trending', {});
    if (trendingData) anichinItems = normalizeDramaList(trendingData);
  }

  // 2. Ambil data dari Sansekai jika didukung sebagai cadangan
  let sansekaiItems = [];
  const SANSEKAI_SOURCES = ['freereels', 'shortmax', 'reelshort', 'dramanova', 'dramabox'];

  if (source === 'dramabox') {
    try {
      const { getDramaBoxFeed } = require('./dramabox_sansekai');
      const dbFeed = await getDramaBoxFeed(type, page);
      if (dbFeed && Array.isArray(dbFeed.items)) sansekaiItems = dbFeed.items;
    } catch (e) {}
  } else if (SANSEKAI_SOURCES.includes(source)) {
    try {
      const { getSansekaiFeed } = require('./sansekai_providers');
      const sFeed = await getSansekaiFeed(source, type, page);
      if (sFeed && Array.isArray(sFeed.items)) sansekaiItems = sFeed.items;
    } catch (e) {}
  }

  // 3. PENGGABUNGAN & DEDUPLIKASI
  const mergedItems = [...anichinItems];
  const seenTitles = new Set(anichinItems.map(it => (it.title || '').toLowerCase().trim()));
  const seenIds = new Set(anichinItems.map(it => String(it.id)));

  for (const sItem of sansekaiItems) {
    const tKey = (sItem.title || '').toLowerCase().trim();
    if (!seenTitles.has(tKey) && !seenIds.has(String(sItem.id))) {
      seenTitles.add(tKey);
      seenIds.add(String(sItem.id));
      mergedItems.push(sItem);
    }
  }

  const finalItems = mergedItems.length > 0 ? mergedItems : sansekaiItems;
  const result = { success: true, source, type, page, items: finalItems };

  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function searchDramas(source = 'dramawave', query = '') {
  if (!query || !query.trim()) {
    return { success: true, source, query: '', items: [] };
  }

  const q = query.trim().toLowerCase();
  const cacheKey = `search_${source}_${q}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_SEARCH_MS) {
    return cached.data;
  }

  let items = [];

  // 1. Cari via Anichin
  const rawSearch = await callAnichinApi(source === 'all' ? 'dramawave' : source, 'search', { query: query.trim() });
  if (rawSearch) {
    const normalized = normalizeDramaList(rawSearch).map(item => ({ ...item, source: resolveActualSource(item.id, source) }));
    if (normalized.length > 0) items.push(...normalized);
  }

  // 2. Jika Sansekai didukung, cari juga
  const SANSEKAI_SOURCES = ['freereels', 'shortmax', 'reelshort', 'dramanova'];
  if (SANSEKAI_SOURCES.includes(source)) {
    try {
      const { searchSansekai } = require('./sansekai_providers');
      const sItems = await searchSansekai(source, query.trim());
      if (sItems && sItems.length > 0) items.push(...sItems);
    } catch (e) {}
  }

  // Deduplikasi items
  const uniqueItems = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (const item of items) {
    const idKey = String(item.id);
    const titleKey = (item.title || '').toLowerCase().trim();
    if (!seenIds.has(idKey) && !seenTitles.has(titleKey)) {
      seenIds.add(idKey);
      seenTitles.add(titleKey);
      uniqueItems.push(item);
    }
  }

  const result = { success: true, source, query, items: uniqueItems };
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

function resolveActualSource(id, requestedSource) {
  const str = String(id || '');

  if (/^420\d{8}$/.test(str)) return 'dramabox';
  if (/^310\d{8}$/.test(str)) return 'goodshort';
  if (/^160\d{9}$/.test(str)) return 'idrama';
  if (/^\d{19}$/.test(str)) return 'netshort';
  if (/^[a-f0-9]{24}$/i.test(str)) return 'reelshort';
  if (/^[A-Za-z0-9]{10}$/.test(str) && !/^\d+$/.test(str)) return 'dramawave';

  if (requestedSource && requestedSource !== 'all') return requestedSource;
  return 'dramawave';
}

async function getDramaDetail(source = 'dramawave', id) {
  if (!id) throw new Error('ID drama tidak boleh kosong');
  source = resolveActualSource(id, source);

  const cacheKey = `detail_${source}_${id}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_DETAIL_MS) {
    return cached.data;
  }

  let detail = null;

  // 1. Coba Anichin API (HTTP api.anichin.bio -> WS fallback)
  const rawDetail = await callAnichinApi(source, 'detail', { id: String(id) });
  if (rawDetail) {
    detail = normalizeDramaDetail(rawDetail, id);
  }

  // 2. Sansekai Multi-Provider fallback
  if (!detail || !detail.episodes || detail.episodes.length === 0) {
    if (source === 'dramabox' || /^420\d{8}$/.test(String(id))) {
      try {
        const { getDramaBoxAllEpisodes } = require('./dramabox_sansekai');
        const dbDetail = await getDramaBoxAllEpisodes(id);
        if (dbDetail && dbDetail.episodes && dbDetail.episodes.length > 0) {
          detail = dbDetail;
        }
      } catch (e) {}
    } else {
      try {
        const { getSansekaiDetail } = require('./sansekai_providers');
        const sDetail = await getSansekaiDetail(source, id);
        if (sDetail && sDetail.drama) {
          detail = sDetail.drama;
        }
      } catch (e) {}
    }
  }

  // 3. Fallback ke known metadata
  if (!detail || !detail.episodes || detail.episodes.length === 0) {
    const known = knownDramaMetadata.get(String(id));
    if (known) {
      detail = normalizeDramaDetail({ data: { id, ...known } }, id);
    }
  }

  if (!detail) {
    throw new Error(`Detail drama tidak ditemukan untuk id: ${id}`);
  }

  const result = { success: true, source, drama: detail };
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function getDramaEpisode(source = 'dramawave', id, ep = 1) {
  if (!id) throw new Error('ID drama tidak boleh kosong');
  source = resolveActualSource(id, source);
  const epNum = Number(ep) || 1;

  const cacheKey = `ep_${source}_${id}_${epNum}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_EPISODE_MS) {
    return cached.data;
  }

  let streamData = null;

  // 1. DramaBox Stream Resolver
  if (source === 'dramabox' || /^420\d{8}$/.test(String(id))) {
    // A. Direct MP4 Extractor from Master HLS (Native 720p/540p streaming)
    try {
      const token = getToken();
      const masterRes = await httpClient.get('/dramabox/hls', {
        params: { id, ep: epNum, token },
        headers: { 'X-API-Key': token },
        timeout: 6000
      });

      if (masterRes.data && typeof masterRes.data === 'string') {
        const lines = masterRes.data.split('\n');
        const qualities = [];
        let currentLabel = '720p HD';

        for (const line of lines) {
          if (line.includes('NAME="')) {
            const match = line.match(/NAME="([^"]+)"/);
            if (match) currentLabel = match[1];
          } else if (line.trim().startsWith('/') || line.trim().startsWith('http')) {
            let subUrl = line.trim();
            if (subUrl.startsWith('/api/')) {
              subUrl = 'https://priv-api.anichin.bio' + subUrl;
            } else if (subUrl.startsWith('/')) {
              subUrl = 'https://api.anichin.bio' + subUrl;
            }

            try {
              const variantRes = await axios.get(subUrl, { timeout: 5000 });
              const mp4Line = variantRes.data.split('\n').find(l => l.trim().startsWith('http'));
              if (mp4Line) {
                qualities.push({
                  label: currentLabel,
                  url: mp4Line.trim(),
                  isDefault: qualities.length === 0
                });
              }
            } catch (errVariant) {}
          }
        }

        if (qualities.length > 0) {
          streamData = {
            success: true,
            source: 'dramabox',
            id,
            episodeNumber: epNum,
            videoUrl: qualities[0].url,
            qualities,
            subtitles: []
          };
        }
      }
    } catch (e) {}

    // B. Sansekai VIP Decrypt fallback (> Ep 20 or if Anichin MP4 extraction failed)
    if (!streamData) {
      try {
        const { getDramaBoxEpisodeStream } = require('./dramabox_sansekai');
        const dbRes = await getDramaBoxEpisodeStream(id, epNum);
        if (dbRes && dbRes.videoUrl) {
          streamData = {
            success: true,
            source: 'dramabox',
            id,
            episodeNumber: epNum,
            videoUrl: dbRes.videoUrl,
            qualities: dbRes.qualities || [{ label: '1080p Full HD', url: dbRes.videoUrl, isDefault: true }],
            subtitles: []
          };
        }
      } catch (e) {}
    }
  }

  // 2. DramaWave / FreeReels: Ambil master stream resmi dari detail drama
  if (!streamData && (source === 'dramawave' || source === 'freereels')) {
    try {
      const detail = await getDramaDetail(source, id);
      const epIndex = epNum - 1;
      const epData = detail?.drama?.episodes?.[epIndex];
      const masterUrl = epData?.videoUrl || epData?.url || epData?.play_url ||
                        epData?.hls_url || epData?.m3u8 || epData?.stream_url;
      if (masterUrl) {
        streamData = {
          success: true,
          source,
          id,
          episodeNumber: epNum,
          videoUrl: masterUrl,
          qualities: [{ label: '1080p Full HD', url: masterUrl, isDefault: true }],
          subtitles: []
        };
      }
    } catch (e) {}
  }

  // 3. ShortMax HLS (dengan Token)
  if (!streamData && source === 'shortmax') {
    try {
      const token = getToken();
      const hls720 = `${ANICHIN_API_URL}/shortmax/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(epNum)}&q=720p&token=${token}`;
      const hls480 = `${ANICHIN_API_URL}/shortmax/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(epNum)}&q=480p&token=${token}`;
      streamData = {
        success: true,
        source: 'shortmax',
        id,
        episodeNumber: epNum,
        videoUrl: hls720,
        qualities: [
          { label: '720p HD', url: hls720, isDefault: true },
          { label: '480p', url: hls480 }
        ],
        subtitles: []
      };
    } catch (e) {}
  }

  // 4. Provider Umum: Coba Anichin API (HTTP api.anichin.bio -> WS fallback)
  if (!streamData) {
    const rawEp = await callAnichinApi(source, 'episode', { id: String(id), ep: String(epNum) });
    if (rawEp) {
      const normalized = normalizeEpisodeStream(rawEp, source, id, epNum);
      if (normalized && normalized.videoUrl) {
        streamData = normalized;
      }
    }
  }

  // 5. Fallback ke Detail Episode Video URL jika belum dapat
  if (!streamData || !streamData.videoUrl) {
    try {
      const detail = await getDramaDetail(source, id);
      const epIndex = epNum - 1;
      const epData = detail?.drama?.episodes?.[epIndex];
      const directUrl = epData?.videoUrl || epData?.url || epData?.play_url || epData?.stream_url;
      if (directUrl) {
        streamData = {
          success: true,
          source,
          id,
          episodeNumber: epNum,
          videoUrl: directUrl,
          qualities: [{ label: 'HD', url: directUrl, isDefault: true }],
          subtitles: []
        };
      }
    } catch (e) {}
  }

  // 6. Fallback ke Sansekai Provider Episode Stream jika Anichin gagal
  if (!streamData || !streamData.videoUrl) {
    try {
      const { getSansekaiEpisodeStream } = require('./sansekai_providers');
      const sRes = await getSansekaiEpisodeStream(source, id, epNum);
      if (sRes && sRes.videoUrl) {
        streamData = sRes;
      }
    } catch (err) {}
  }

  if (!streamData || !streamData.videoUrl) {
    throw new Error(`Video stream tidak tersedia untuk episode ${epNum}`);
  }

  const result = { success: true, source, id, ...streamData };
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

module.exports = {
  SOURCES,
  getSources,
  getFeed,
  searchDramas,
  getDramaDetail,
  getDramaEpisode,
  resolveActualSource
};
