/**
 * DracinHub - Anichin Short Drama Service
 * WebSocket multiplexing gateway ke Anichin Official API (miniapp.anichin.bio)
 */

const WebSocket = require('ws');

const ANICHIN_WS_URL = 'wss://miniapp.anichin.bio/ws';
const ANICHIN_BASE_URL = 'https://miniapp.anichin.bio';
const DEFAULT_TOKEN = 'TRIAL-ANICHIN-2026';

const SOURCES = {
  dramawave:  { name: 'DramaWave',  id: 'LeMYdgoXZM', badge: 'HD & Subtitle', desc: 'Direct M3U8 streaming dengan 20+ subtitle multi-bahasa' },
  freereels:  { name: 'FreeReels',  id: '51bAUXzvfP', badge: 'Gratis & Sub', desc: 'Direct stream cepat dengan subtitle Indonesia' },
  netshort:   { name: 'NetShort',   id: '2034157133506805762', badge: 'Direct MP4', desc: 'Kualitas original MP4 dengan subtitle Indonesia' },
  dramanova:  { name: 'DramaNova',  id: '102062', badge: 'Romance / 18+', desc: 'Drama romantis & dewasa' },
  starshort:  { name: 'StarShort',  id: 'j0NM', badge: 'M3U8 Fast', desc: 'Koleksi drama pendek terbaru' },
  melolo:     { name: 'Melolo',     id: '7522723499182394385', badge: 'Multi-Bitrate', desc: 'Pilihan resolusi 720p, 540p, 360p' },
  dramabox:   { name: 'DramaBox',   id: '42000007806', badge: 'Popular', desc: 'Provider drama box nomor 1 di Asia' },
  reelshort:  { name: 'ReelShort',  id: '699d1eefa3a7262cff05534b', badge: 'Hot', desc: 'Drama pendek romantis dan billionaire viral' },
  shortmax:   { name: 'ShortMax',   id: '18854', badge: 'Trending', desc: 'Katalog ribuan drama pendek bertema CEO & Reinkarnasi' },
  goodshort:  { name: 'GoodShort',  id: '31001188126', badge: 'Recom', desc: 'Drama pilihan terfavorit penonton' },
  flickreels: { name: 'FlickReels', id: '5672', badge: 'Top Rank', desc: 'Serial drama rating tinggi' },
  stardusttv: { name: 'StardustTV', id: '146', badge: 'Top', desc: 'Koleksi drama sci-fi dan modern' },
  idrama:     { name: 'iDrama',     id: '160000641712', badge: 'Hot', desc: 'Drama asia pilihan' },
  dramabite:  { name: 'DramaBite',  id: '15384', badge: 'Latest', desc: 'Drama bite-sized untuk tontonan kilat' },
  moboreels:  { name: 'MoboReels',  id: '41896322', badge: 'Trending', desc: 'Drama mobile reel' },
  flareflow:  { name: 'FlareFlow',  id: '746751', badge: 'New', desc: 'Platform drama generasi baru' }
};

let ws = null;
let wsReady = false;
let reqCounter = 0;
const pendingCallbacks = new Map();
const memoryCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

function getToken() {
  return process.env.ANICHIN_API_KEY || DEFAULT_TOKEN;
}

function initWebSocket() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
    return;
  }

  try {
    ws = new WebSocket(ANICHIN_WS_URL);

    ws.on('open', () => {
      wsReady = true;
      console.log('✅ Connected to Anichin Official WebSocket Gateway');
      const token = getToken();
      ws.send(JSON.stringify({ type: 'auth', token }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth') {
          console.log(`🔐 Anichin Auth Status: ${msg.message || 'OK'}`);
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
        item.reject(new Error('Koneksi WebSocket terputus, mencoba reconnecting...'));
      }
      pendingCallbacks.clear();
      setTimeout(initWebSocket, 3000);
    });

    ws.on('error', () => {
      try { ws.close(); } catch {}
    });
  } catch (e) {
    setTimeout(initWebSocket, 4000);
  }
}

// Inisialisasi awal
initWebSocket();

function sendWsRequest(source, path, params = {}) {
  return new Promise((resolve, reject) => {
    if (!wsReady || !ws || ws.readyState !== 1) {
      initWebSocket();
      return setTimeout(() => {
        if (!wsReady) return reject(new Error('Koneksi server drama sedang disiapkan, silakan coba 2 detik lagi.'));
        executeDirect(source, path, params, resolve, reject);
      }, 1200);
    }
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
    const cover = item.cover || item.poster || item.cover_url || item.posterImg || item.thumb || item.image || item.horizontal_cover || '';
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
  const cover = dramaObj.cover || dramaObj.poster || dramaObj.cover_url || dramaObj.posterImg || '';
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
    desc: val.desc
  }));
}

async function getFeed(source = 'dramawave', type = 'trending', page = 1) {
  const cacheKey = `feed_${source}_${type}_${page}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let path = type;
  const params = {};
  if (type === 'foryou' || type === 'latest' || type === 'new' || type === 'romance') {
    params.page = String(page);
  }

  let res;
  try {
    res = await sendWsRequest(source, path, params);
  } catch (err) {
    // Fallback otomatis jika provider tidak support feed type tertentu
    if (err.message.includes('unknown action') || err.message.includes('not supported') || err.message.includes('not found')) {
      try {
        res = await sendWsRequest(source, 'trending', {});
        path = 'trending';
      } catch (err2) {
        res = await sendWsRequest(source, 'foryou', { page: '1' });
        path = 'foryou';
      }
    } else {
      throw err;
    }
  }

  const items = normalizeDramaList(res.data);
  const result = { success: true, source, type: path, page, items };

  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function searchDramas(source = 'dramawave', query = '') {
  if (!query || !query.trim()) {
    return { success: true, source, query: '', items: [] };
  }

  const res = await sendWsRequest(source, 'search', { query: query.trim() });
  const items = normalizeDramaList(res.data);
  return { success: true, source, query, items };
}

async function getDramaDetail(source = 'dramawave', id) {
  if (!id) throw new Error('ID drama tidak boleh kosong');

  const cacheKey = `detail_${source}_${id}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    return cached.data;
  }

  const res = await sendWsRequest(source, 'detail', { id: String(id) });
  const detail = normalizeDramaDetail(res.data, id);
  const result = { success: true, source, drama: detail };

  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function getDramaEpisode(source = 'dramawave', id, ep = 1) {
  if (!id) throw new Error('ID drama tidak boleh kosong');

  const res = await sendWsRequest(source, 'episode', { id: String(id), ep: String(ep) });
  const streamData = normalizeEpisodeStream(res.data, source, id, ep);
  return { success: true, source, id, ...streamData };
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
