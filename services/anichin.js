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
  stardusttv: { name: 'StardustTV', id: '146', badge: 'Top', desc: 'Koleksi drama sci-fi dan modern', icon: 'https://stardust.tv/favicon.ico' }
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

  const q = query.trim().toLowerCase();
  const cacheKey = `search_${source}_${q}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_SEARCH_MS) {
    return cached.data;
  }

  let items = [];
  try {
    const res = await sendWsRequest(source, 'search', { query: query.trim() });
    items = normalizeDramaList(res.data);
  } catch (err) {}

  // Multi-provider fallback search jika pencarian di provider terpilih kosong
  if (items.length === 0) {
    const fallbackSources = ['dramawave', 'dramabox', 'netshort', 'reelshort', 'shortmax'].filter(s => s !== source);
    const searchPromises = fallbackSources.map(s => 
      sendWsRequest(s, 'search', { query: query.trim() })
        .then(r => normalizeDramaList(r.data).map(item => ({ ...item, source: s })))
        .catch(() => [])
    );

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
  if (requestedSource && requestedSource !== 'all') return requestedSource;
  if (!id) return 'dramawave';
  const str = String(id).trim();
  if (/^420\d{8}$/.test(str)) return 'dramabox';
  if (/^\d{19}$/.test(str)) return 'netshort';
  if (/^[0-9a-f]{24}$/i.test(str)) return 'reelshort';
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

  const res = await sendWsRequest(source, 'detail', { id: String(id) });
  const detail = normalizeDramaDetail(res.data, id);
  const result = { success: true, source, drama: detail };

  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function getDramaEpisode(source = 'dramawave', id, ep = 1) {
  if (!id) throw new Error('ID drama tidak boleh kosong');
  source = resolveActualSource(id, source);

  const cacheKey = `ep_${source}_${id}_${ep}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_EPISODE_MS) {
    return cached.data;
  }

  let streamData;

  if (source === 'dramabox' || /^\d{11}$/.test(String(id))) {
    try {
      const axios = require('axios');
      const token = getToken();
      const masterUrl = `${ANICHIN_BASE_URL}/api/dramabox/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(ep)}&token=${token}`;
      const masterRes = await axios.get(masterUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      const lines = masterRes.data.split('\n');
      const qualities = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('#EXT-X-STREAM-INF')) {
          const qMatch = lines[i].match(/NAME="([^"]+)"/);
          const qLabel = qMatch ? qMatch[1] : 'HD';
          let nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
          if (nextLine) {
            nextLine = nextLine.replace(/api_key=[^&]+/, `api_key=${token}`);
            const subUrl = nextLine.startsWith('http') ? nextLine : `${ANICHIN_BASE_URL}${nextLine}`;
            try {
              const subRes = await axios.get(subUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
              const subLines = subRes.data.split('\n');
              const directMediaUrl = subLines.find(l => l.startsWith('http'));
              if (directMediaUrl) {
                qualities.push({
                  label: qLabel,
                  url: directMediaUrl.trim(),
                  isDefault: qLabel.includes('720')
                });
              }
            } catch (e) {}
          }
        }
      }

      const def = qualities.find(q => q.isDefault) || qualities[0];
      if (def && def.url) {
        streamData = {
          success: true,
          source: 'dramabox',
          id,
          episodeNumber: Number(ep),
          videoUrl: def.url,
          qualities: qualities.length > 0 ? qualities : [{ label: '720p HD', url: def.url, isDefault: true }],
          subtitles: []
        };
      }
    } catch (err) {
      console.error('Dramabox stream extraction error:', err.message);
    }
  } else if (source === 'shortmax') {
    streamData = {
      success: true,
      episodeNumber: Number(ep),
      videoUrl: `${ANICHIN_BASE_URL}/api/shortmax/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(ep)}&q=720p`,
      qualities: [
        { label: '720p', url: `${ANICHIN_BASE_URL}/api/shortmax/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(ep)}&q=720p`, isDefault: true },
        { label: '480p', url: `${ANICHIN_BASE_URL}/api/shortmax/hls?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(ep)}&q=480p` }
      ],
      subtitles: []
    };
  }

  if (!streamData) {
    const res = await sendWsRequest(source, 'episode', { id: String(id), ep: String(ep) });
    streamData = normalizeEpisodeStream(res.data, source, id, ep);

    if (source === 'dramawave') {
      // Pastikan DramaWave menggunakan Master Playlist (h264-*.m3u8) agar audio & video tersinkronisasi penuh dengan suara
      try {
        const detail = await getDramaDetail(source, id);
        const epIndex = Number(ep) - 1;
        const masterUrl = detail?.drama?.episodes?.[epIndex]?.videoUrl;
        if (masterUrl && masterUrl.includes('.m3u8')) {
          streamData.videoUrl = masterUrl;
        }
      } catch (e) {}
    }
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
