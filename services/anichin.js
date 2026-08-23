/**
 * DracinHub - Anichin Short Drama Service
 * WebSocket multiplexing gateway ke Anichin Official API (miniapp.anichin.bio)
 * Mendukung 12 Provider Resmi dengan API Key #1
 */

const WebSocket = require('ws');

const ANICHIN_WS_URL = 'wss://miniapp.anichin.bio/ws';
const ANICHIN_BASE_URL = 'https://miniapp.anichin.bio';
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

let ws = null;
let wsReady = false;
let reqCounter = 0;
const pendingCallbacks = new Map();
const memoryCache = new Map();
const knownDramaMetadata = new Map();
const CACHE_TTL_FEED_MS = 10 * 60 * 1000; // 10 menit
const CACHE_TTL_DETAIL_MS = 30 * 60 * 1000; // 30 menit
const CACHE_TTL_EPISODE_MS = 15 * 60 * 1000; // 15 menit
const CACHE_TTL_SEARCH_MS = 5 * 60 * 1000; // 5 menit

function getToken() {
  return process.env.ANICHIN_API_KEY || DEFAULT_TOKEN;
}
let authResolvers = [];

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

// Inisialisasi awal
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
    executeDirect(source, path, params, resolve, reject);
  });
}

function executeDirect(source, path, params, resolve, reject) {
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
  } else if (raw.data && Array.isArray(raw.data)) {
    items = raw.data;
  } else if (raw.list && Array.isArray(raw.list)) {
    items = raw.list;
  } else if (raw.results && Array.isArray(raw.results)) {
    items = raw.results;
  } else if (raw.books && Array.isArray(raw.books)) {
    items = raw.books;
  } else if (raw.rows && Array.isArray(raw.rows)) {
    items = raw.rows;
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
      const videoUrl = ep.videoUrl || ep.video_url || ep.url || ep.play_url || ep.hls_url || ep.m3u8 || '';
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

  let videoUrl = '';
  let qualities = [];
  let subtitles = [];

  if (typeof data === 'string' && (data.startsWith('http://') || data.startsWith('https://'))) {
    videoUrl = data;
  } else {
    videoUrl = data.videoUrl || data.video_url || data.url || data.play_url || data.hls_url || data.m3u8 || data.stream_url || '';

    if (Array.isArray(data.qualities) && data.qualities.length > 0) {
      qualities = data.qualities.map(q => ({
        label: q.label || q.name || q.resolution || `${q.height || ''}p`,
        url: q.url || q.video_url || q.play_url || '',
        isDefault: Boolean(q.isDefault || q.default || false)
      })).filter(q => q.url);
    } else if (Array.isArray(data.qualityList) && data.qualityList.length > 0) {
      qualities = data.qualityList.map(q => ({
        label: q.label || q.name || `${q.quality || ''}`,
        url: q.url || q.videoUrl || '',
        isDefault: Boolean(q.isDefault)
      })).filter(q => q.url);
    } else if (Array.isArray(data.videos) && data.videos.length > 0) {
      qualities = data.videos.map(v => ({
        label: v.quality || v.resolution || 'Auto',
        url: v.url || v.video_url || '',
        isDefault: Boolean(v.default)
      })).filter(q => q.url);
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

// Helper
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

  // 1. Ambil data dari Sansekai Suite (API 2) jika didukung sebagai cadangan
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

  // 2. Ambil data dari Anichin WebSocket (API 1)
  let anichinItems = [];
  let path = type;
  const params = {};
  if (type === 'foryou' || type === 'latest' || type === 'new' || type === 'romance') {
    params.page = String(page);
  }

  try {
    const res = await sendWsRequest(source, path, params);
    anichinItems = normalizeDramaList(res.data);
  } catch (err) {
    try {
      const res = await sendWsRequest(source, 'trending', {});
      anichinItems = normalizeDramaList(res.data);
    } catch (err2) {
      try {
        const res = await sendWsRequest(source, 'foryou', { page: '1' });
        anichinItems = normalizeDramaList(res.data);
      } catch (err3) {}
    }
  }

  // 3. PENGGABUNGAN & DEDUPLIKASI (Merge & Gap-Fill)
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

  // 1. Cari di provider yang sedang aktif
  try {
    const res = await sendWsRequest(source === 'all' ? 'dramawave' : source, 'search', { query: query.trim() });
    const wsItems = normalizeDramaList(res.data).map(item => ({ ...item, source: resolveActualSource(item.id, source) }));
    if (wsItems && wsItems.length > 0) {
      items.push(...wsItems);
    }
  } catch (err) {}

  // 2. Jika provider didukung Sansekai, cari juga via Sansekai provider search
  const SANSEKAI_SOURCES = ['freereels', 'shortmax', 'reelshort', 'dramanova'];
  if (SANSEKAI_SOURCES.includes(source)) {
    try {
      const { searchSansekai } = require('./sansekai_providers');
      const sItems = await searchSansekai(source, query.trim());
      if (sItems && sItems.length > 0) {
        items.push(...sItems);
      }
    } catch (e) {}
  }

  // 3. Jika pencarian global 'all' atau jika provider aktif menghasilkan < 2 drama, cari di provider utama lain
  if (source === 'all' || items.length < 2) {
    const fallbackSources = ['dramawave', 'dramabox', 'shortmax', 'netshort', 'freereels', 'reelshort', 'goodshort', 'idrama']
      .filter(s => s !== source);

    const searchPromises = fallbackSources.map(s => {
      return sendWsRequest(s, 'search', { query: query.trim() })
        .then(r => normalizeDramaList(r.data).map(item => ({ ...item, source: resolveActualSource(item.id, s) })))
        .catch(() => []);
    });

    const fallbackResults = await Promise.allSettled(searchPromises);
    fallbackResults.forEach(r => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        items.push(...r.value);
      }
    });
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

/**
 * Deteksi provider sumber asli berdasarkan pola ID drama
 */
function resolveActualSource(id, requestedSource) {
  const str = String(id || '');

  // 1. DramaBox: 11 digit dimulai dari 420 (e.g. 42000007806)
  if (/^420\d{8}$/.test(str)) return 'dramabox';

  // 2. GoodShort: 11 digit dimulai dari 310 (e.g. 31001188126)
  if (/^310\d{8}$/.test(str)) return 'goodshort';

  // 3. iDrama: 12 digit dimulai dari 160 (e.g. 160000641712)
  if (/^160\d{9}$/.test(str)) return 'idrama';

  // 4. NetShort: 19 digit ID (e.g. 2034157133506805762)
  if (/^\d{19}$/.test(str)) return 'netshort';

  // 5. ReelShort: 24 hex characters ObjectId (e.g. 699d1eefa3a7262cff05534b)
  if (/^[a-f0-9]{24}$/i.test(str)) return 'reelshort';

  // 6. DramaWave: 10 alfanumerik (e.g. LeMYdgoXZM)
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

  // 1. Coba API 1 (Anichin WebSocket)
  try {
    const res = await sendWsRequest(source, 'detail', { id: String(id) });
    detail = normalizeDramaDetail(res.data, id);
  } catch (err) {}

  // 2. Jika API 1 gagal atau episode kosong, Coba API 2 (Sansekai Multi-Provider / DramaBox AllEpisode)
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

  // 3. Fallback ke known drama metadata dari pencarian/katalog
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

  // --- Strategi Dual-API Automatic Fallback ---

  // 1. Khusus DramaBox
  if (source === 'dramabox' || /^420\d{8}$/.test(String(id))) {
    // A. Coba Sansekai VIP Decrypt untuk Ep > 20
    if (epNum > 20) {
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

    // B. Coba Anichin HLS CDN
    if (!streamData || !streamData.videoUrl) {
      try {
        const axios = require('axios');
        const token = getToken();
        const masterUrl = `${ANICHIN_BASE_URL}/api/dramabox/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(epNum)}&token=${token}`;
        const masterRes = await axios.get(masterUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        const lines = masterRes.data.split('\n');
        const directMediaUrl = lines.find(l => l.startsWith('http'));
        if (directMediaUrl) {
          streamData = {
            success: true,
            source: 'dramabox',
            id,
            episodeNumber: epNum,
            videoUrl: directMediaUrl.trim(),
            qualities: [{ label: '720p HD', url: directMediaUrl.trim(), isDefault: true }],
            subtitles: []
          };
        }
      } catch (e) {}
    }

    // C. Fallback ke Sansekai Stream jika Anichin gagal
    if (!streamData || !streamData.videoUrl) {
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

  // 2. ShortMax HLS
  if (!streamData && source === 'shortmax') {
    try {
      streamData = {
        success: true,
        episodeNumber: epNum,
        videoUrl: `${ANICHIN_BASE_URL}/api/shortmax/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(epNum)}&q=720p`,
        qualities: [
          { label: '720p HD', url: `${ANICHIN_BASE_URL}/api/shortmax/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(epNum)}&q=720p`, isDefault: true },
          { label: '480p', url: `${ANICHIN_BASE_URL}/api/shortmax/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(epNum)}&q=480p` }
        ],
        subtitles: []
      };
    } catch (e) {}
  }

  // 3. Provider Umum: Coba API 1 (Anichin WebSocket)
  if (!streamData) {
    try {
      const res = await sendWsRequest(source, 'episode', { id: String(id), ep: String(epNum) });
      const wsStream = normalizeEpisodeStream(res.data, source, id, epNum);
      if (wsStream && wsStream.videoUrl) {
        streamData = wsStream;

        if (source === 'dramawave') {
          try {
            const detail = await getDramaDetail(source, id);
            const epIndex = epNum - 1;
            const epData = detail?.drama?.episodes?.[epIndex];
            const masterUrl = epData?.videoUrl || epData?.url || epData?.play_url ||
                              epData?.hls_url || epData?.m3u8 || epData?.stream_url;
            if (masterUrl && masterUrl.includes('.m3u8')) {
              streamData.videoUrl = masterUrl;
            }
          } catch (e) {}
        }
      }
    } catch (err) {}
  }

  // 4. Fallback ke API 2 (Sansekai Provider Episode Stream) jika API 1 gagal
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
