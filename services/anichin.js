/**
 * DracinHub - Anichin Short Drama Service
 * WebSocket multiplexing gateway ke Anichin Official API (miniapp.anichin.bio)
 */

const WebSocket = require('ws');

const ANICHIN_WS_URL = 'wss://miniapp.anichin.bio/ws';
const ANICHIN_BASE_URL = 'https://miniapp.anichin.bio';
const DEFAULT_TOKEN = 'ANICHIN-A5A16A417FC3EBA15BE691F2B9AA6DA1';

const SOURCES = {
  dramawave:  { name: 'DramaWave',  id: 'LeMYdgoXZM', badge: 'HD & Subtitle', desc: 'Direct M3U8 streaming dengan 20+ subtitle multi-bahasa', icon: 'https://video-v6.mydramawave.com/favicon.ico' },
  freereels:  { name: 'FreeReels',  id: '51bAUXzvfP', badge: 'Gratis & Sub', desc: 'Direct stream cepat dengan subtitle Indonesia', icon: 'https://freereels.com/favicon.ico' },
  netshort:   { name: 'NetShort',   id: '2034157133506805762', badge: 'Direct MP4', desc: 'Kualitas original MP4 dengan subtitle Indonesia', icon: 'https://netshort.com/favicon.ico' },
  dramabox:   { name: 'DramaBox',   id: '42000007806', badge: 'Popular', desc: 'Provider drama box nomor 1 di Asia', icon: 'https://dramaboxdb.com/favicon.ico' },
  shortmax:   { name: 'ShortMax',   id: '18854', badge: 'Trending', desc: 'Katalog ribuan drama pendek bertema CEO & Reinkarnasi', icon: 'https://akamai-static.shorttv.live/favicon.ico' },
  melolo:     { name: 'Melolo',     id: '7522723499182394385', badge: 'Multi-Bitrate', desc: 'Pilihan resolusi 720p, 540p, 360p', icon: 'https://melolo.com/favicon.ico' },
  dramanova:  { name: 'DramaNova',  id: '102062', badge: 'Romance / 18+', desc: 'Drama romantis & dewasa', icon: 'https://dramanova.com/favicon.ico' },
  reelshort:  { name: 'ReelShort',  id: '699d1eefa3a7262cff05534b', badge: 'Hot', desc: 'Drama pendek romantis dan billionaire viral', icon: 'https://www.reelshort.com/favicon.ico' },
  goodshort:  { name: 'GoodShort',  id: '31001188126', badge: 'Recom', desc: 'Drama pilihan terfavorit penonton', icon: 'https://goodshort.com/favicon.ico' },
  flickreels: { name: 'FlickReels', id: '5672', badge: 'Top Rank', desc: 'Serial drama rating tinggi', icon: 'https://flickreels.com/favicon.ico' },
  idrama:     { name: 'iDrama',     id: '160000641712', badge: 'Viral', desc: 'Koleksi drama pendek Asia terpopuler', icon: 'https://idrama.com/favicon.ico' },
  dramabite:  { name: 'DramaBite',  id: '15384', badge: 'Fresh', desc: 'Update drama baru setiap hari', icon: 'https://dramabite.com/favicon.ico' },
  moboreels:  { name: 'MoboReels',  id: '41896322', badge: 'Trending', desc: 'Drama pendek pilihan trending penonton', icon: 'https://moboreels.com/favicon.ico' },
  flareflow:  { name: 'FlareFlow',  id: '746751', badge: 'HD & Sub', desc: 'Drama romantis & aksi trending terbaru', icon: 'https://flareflow.tv/favicon.ico' },
  pinedrama:  { name: 'PineDrama',  id: 'pinedrama', badge: 'TikTok HD', desc: 'Drama pendek viral & dubbing Indonesia', icon: 'https://pinedrama.com/favicon.ico' }
};

let ws = null;
let wsReady = false;
let reqCounter = 0;
const pendingCallbacks = new Map();
const memoryCache = new Map();
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
      authResolvers = authResolvers.filter(f => f !== onReady);
      reject(new Error('Server drama sedang sibuk, silakan coba sesaat lagi.'));
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
  } else if (raw.data && raw.data.list && Array.isArray(raw.data.list)) {
    items = raw.data.list;
  } else if (raw.data && raw.data.items && Array.isArray(raw.data.items)) {
    items = raw.data.items;
  }

  return items.map(item => {
    const id = String(item.id || item.dramaId || item.drama_id || item.book_id || item.bookId || item.album_id || item.content_id || item.albumId || '');
    const title = item.title || item.name || item.book_name || item.drama_name || item.dramaName || 'Short Drama';
    const cover = item.cover || item.poster || item.cover_url || item.cover_image_url || item.cover_image || item.vertical_cover || item.posterImg || item.thumb || item.thumb_url || item.thumbnail || item.image || item.image_url || item.pic || item.horizontal_cover || item.cover_path || item.banner || '';
    const synopsis = item.synopsis || item.description || item.desc || item.intro || item.summary || '';
    const episodes = Number(item.episodes || item.total_episodes || item.total_episode || item.chapter_count || item.total_count || item.total_chapter || (item.episode_list?.length) || 0);
    const tags = Array.isArray(item.tags) ? item.tags : (item.categoryNames || item.categories || item.genres || []);

    return {
      id,
      title,
      cover,
      synopsis,
      episodes,
      tags,
      isCompleted: item.isCompleted === '1' || item.isCompleted === true || item.status === 'completed' || item.is_finish === 1
    };
  }).filter(d => d.id && d.title);
}

/**
 * Normalisasi detail drama dan episode list
 */
function normalizeDramaDetail(raw, dramaId) {
  const d = raw?.data || raw || {};
  const dramaObj = d.drama || d.detail || d.info || d;

  const id = String(dramaObj.id || dramaObj.dramaId || dramaObj.book_id || dramaId || '');
  const title = dramaObj.title || dramaObj.name || dramaObj.book_name || dramaObj.drama_name || 'Short Drama';
  const cover = dramaObj.cover || dramaObj.poster || dramaObj.cover_url || dramaObj.cover_image_url || dramaObj.cover_image || dramaObj.vertical_cover || dramaObj.posterImg || dramaObj.thumb || dramaObj.image || '';
  const synopsis = dramaObj.synopsis || dramaObj.description || dramaObj.desc || dramaObj.intro || '';
  const tags = Array.isArray(dramaObj.tags) ? dramaObj.tags : (dramaObj.categoryNames || dramaObj.categories || []);

  let rawEpisodes = [];
  if (Array.isArray(d.episodes)) rawEpisodes = d.episodes;
  else if (Array.isArray(d.episode_list)) rawEpisodes = d.episode_list;
  else if (Array.isArray(d.chapters)) rawEpisodes = d.chapters;
  else if (Array.isArray(d.list)) rawEpisodes = d.list;
  else if (Array.isArray(dramaObj.episodes)) rawEpisodes = dramaObj.episodes;

  let episodes = [];
  if (rawEpisodes.length > 0) {
    episodes = rawEpisodes.map((ep, idx) => {
      const epNum = Number(ep.episodeNumber || ep.number || ep.chapter_index || ep.index || idx + 1);
      const epTitle = ep.episodeTitle || ep.title || ep.name || `Episode ${epNum}`;
      return {
        number: epNum,
        title: epTitle,
        locked: Boolean(ep.locked && ep.locked !== '0'),
        videoUrl: ep.videoUrl || ep.url || ''
      };
    });
  } else {
    const totalCount = Number(dramaObj.episodes || dramaObj.total_episodes || dramaObj.chapter_count || 30);
    for (let i = 1; i <= (totalCount > 0 ? totalCount : 30); i++) {
      episodes.push({
        number: i,
        title: `Episode ${i}`,
        locked: false,
        videoUrl: ''
      });
    }
  }

  return {
    id,
    title,
    cover,
    synopsis,
    tags,
    totalEpisodes: episodes.length,
    episodes
  };
}

/**
 * Normalisasi stream video
 */
function normalizeEpisodeStream(raw, source, dramaId, ep) {
  const d = raw?.data || raw || {};
  let videoUrl = d.videoUrl || d.url || d.hls || d.m3u8 || d.play_url || d.stream_url || '';

  // Quality list jika ada
  let qualities = [];
  if (Array.isArray(d.qualityList)) {
    qualities = d.qualityList.map(q => ({
      label: q.label || `${q.bitrate || ''}`,
      url: q.url.startsWith('/') ? `${ANICHIN_BASE_URL}${q.url}` : q.url,
      isDefault: q.isDefault || false
    }));
  }

  // Subtitles jika ada
  let subtitles = [];
  if (Array.isArray(d.subtitles)) {
    subtitles = d.subtitles.map(s => ({
      label: s.label || s.language || 'Sub',
      language: s.language || 'id',
      url: s.url
    }));
  }

  if (videoUrl && videoUrl.startsWith('/')) {
    // Relative video url dari Anichin
    videoUrl = `${ANICHIN_BASE_URL}${videoUrl}`;
  }

  if (!videoUrl) {
    videoUrl = `${ANICHIN_BASE_URL}/api/${source}/hls?id=${encodeURIComponent(dramaId)}&ep=${encodeURIComponent(ep)}`;
  }

  return {
    success: true,
    episodeNumber: Number(d.episodeNumber || d.number || ep),
    videoUrl,
    qualities,
    subtitles
  };
}

// ===== EXPORTED SERVICE METHODS =====

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

  // 1. Ambil data dari Sansekai Suite (API 2) jika didukung
  let sansekaiItems = [];
  const SANSEKAI_SOURCES = ['pinedrama', 'melolo', 'freereels', 'shortmax', 'reelshort', 'dramanova', 'dramabox'];

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
  if (source !== 'pinedrama') {
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
  }

  // 3. PENGGABUNGAN & DEDUPLIKASI (Merge & Gap-Fill)
  // Mulai dengan anichinItems, lalu tambahkan item dari sansekaiItems yang belum ada
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
  const SANSEKAI_SOURCES = ['pinedrama', 'melolo', 'freereels', 'shortmax', 'reelshort', 'dramanova'];
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
    const fallbackSources = ['dramawave', 'dramabox', 'shortmax', 'melolo', 'netshort', 'freereels', 'reelshort', 'pinedrama']
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

  // Deduplicate items
  const seen = new Set();
  const dedupedItems = items.filter(it => {
    const key = (it.title || '').toLowerCase().trim();
    if (!key || seen.has(key) || seen.has(it.id)) return false;
    seen.add(key);
    seen.add(it.id);
    return true;
  });

  const result = { success: true, source, query, items: dedupedItems };
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

function resolveActualSource(id, requestedSource) {
  if (!id) return requestedSource || 'dramawave';
  const str = String(id).trim();

  // Pattern detection based on provider-specific ID formats:
  // 1. ReelShort: 24-character hexadecimal ObjectId (e.g. 686b831298c9395bc70495f1)
  if (/^[0-9a-f]{24}$/i.test(str)) return 'reelshort';

  // 2. DramaBox: 11 digits starting with 420 (e.g. 42000003451)
  if (/^420\d{8}$/.test(str)) return 'dramabox';

  // 3. GoodShort: 11 digits starting with 310 or 320 (e.g. 31001345253)
  if (/^3[12]\d{9}$/.test(str)) return 'goodshort';

  // 4. PineDrama / NetShort / Melolo: 19 digits
  if (/^\d{19}$/.test(str)) {
    if (requestedSource === 'pinedrama') return 'pinedrama';
    if (requestedSource === 'melolo') return 'melolo';
    return 'netshort';
  }

  // 5. ShortMax / FlareFlow: integer IDs like 8151 / 460235
  if (/^\d{1,6}$/.test(str)) {
    if (requestedSource === 'flareflow') return 'flareflow';
    if (requestedSource === 'shortmax') return 'shortmax';
  }

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
  if (source !== 'pinedrama') {
    try {
      const res = await sendWsRequest(source, 'detail', { id: String(id) });
      detail = normalizeDramaDetail(res.data, id);
    } catch (err) {}
  }

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
  if (!streamData && source !== 'pinedrama') {
    try {
      const res = await sendWsRequest(source, 'episode', { id: String(id), ep: String(epNum) });
      const wsStream = normalizeEpisodeStream(res.data, source, id, epNum);
      if (wsStream && wsStream.videoUrl) {
        streamData = wsStream;

        if (source === 'dramawave') {
          try {
            const detail = await getDramaDetail(source, id);
            const epIndex = epNum - 1;
            const masterUrl = detail?.drama?.episodes?.[epIndex]?.videoUrl;
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
  ANICHIN_BASE_URL
};
