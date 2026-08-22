const axios = require('axios');

const SANSEKAI_BASE = 'https://api.sansekai.my.id/api';
const dramaBoxCache = new Map();
const CACHE_TTL_DRAMABOX = 24 * 60 * 60 * 1000; // 24 Jam Cache untuk Episode
const CACHE_TTL_FEED = 20 * 60 * 1000; // 20 Menit Cache untuk Feed

const client = axios.create({
  baseURL: SANSEKAI_BASE,
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://api.sansekai.my.id/',
    'Accept': 'application/json, text/plain, */*'
  }
});

function normalizeDramaBoxItem(raw) {
  if (!raw) return null;
  const id = String(raw.bookId || raw.id || '');
  if (!id) return null;
  const title = raw.bookName || raw.title || 'DramaBox Short Drama';
  const cover = raw.coverWap || raw.cover || (raw.coverImg ? raw.coverImg : '');
  const synopsis = raw.introduction || raw.synopsis || raw.desc || '';
  const episodes = Number(raw.chapterCount || raw.episodes || raw.totalEpisodes || 0);
  const tags = Array.isArray(raw.tags) ? raw.tags : (Array.isArray(raw.tagNames) ? raw.tagNames : []);
  return {
    id,
    title,
    cover,
    synopsis,
    episodes,
    tags,
    isCompleted: true,
    source: 'dramabox'
  };
}

// Curated high quality DramaBox list for instant fallback
const DRAMABOX_CURATED = [
  { id: '42000002888', title: 'Dewa Judi (Sulih Suara)', cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000002888/42000002888.jpg', synopsis: 'Demi membalas sahabat yang menjebak istrinya hingga kalah ratusan juta, Sandi nekat masuk ke lingkaran mafia judi dengan teknik tingkat tinggi.', episodes: 74, tags: ['Sulih Suara', 'Judi', 'Balas Dendam', 'Pria Dominan'] },
  { id: '42000023894', title: 'Tolak Aku, Raja Naga (Sulih Suara)', cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000023894/42000023894.jpg', synopsis: 'Lyra mengandung putri separuh naga dan diusir karena fitnah. Saat kembali mencari tabib, asmara masa lalu kembali membara.', episodes: 50, tags: ['Sulih Suara', 'Naga', 'Romansa', 'Rahasia'] },
  { id: '42000025152', title: 'Akademi Shifter: Menjinakkan Ketiga Alpha (Sulih Suara)', cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000025152/42000025152.jpg', synopsis: 'Ivy memasuki Akademi Shifter di musim kawin dan menjadi jodoh takdir ketiga alpha paling berkuasa.', episodes: 53, tags: ['Sulih Suara', 'Alpha', 'Werewolf', 'Fantasi'] },
  { id: '41000104882', title: 'Gadis Lugu Penakluk Raja Mafia', cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x1/41x0/410x0/41000104882/41000104882.jpg', synopsis: 'Seorang gadis sederhana tak sengaja menyelamatkan nyawa penguasa dunia bawah tanah yang paling ditakuti.', episodes: 65, tags: ['VIP', 'Mafia', 'Romance', 'CEO'] },
  { id: '42000025364', title: 'Hati Yang Dihancurkan', cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000025364/42000025364.jpg', synopsis: 'Mia pergi diam-diam demi menyelamatkan Vance. Bertahun-tahun kemudian fitnah keji memicu penyesalan seumur hidup.', episodes: 60, tags: ['Terbaru', 'Balas Dendam', 'CEO', 'Keluarga'] },
  { id: '42000011605', title: 'Legenda Tangan Dewa', cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000011605/42000011605.jpg', synopsis: 'Chen Dasheng dengan tangan berkekuatan supernatural bertekad menjadi pemain terbaik di dunia kasino Shanghai.', episodes: 70, tags: ['Kekuatan Khusus', 'Judi', 'Shanghai'] },
  { id: '42000011037', title: 'Dewa Kekayaan Turun', cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000011037/42000011037.jpg', synopsis: 'Dewa kekayaan bereinkarnasi sebagai bayi perempuan yang membimbing sang ibu menjadi wanita terkaya.', episodes: 80, tags: ['Reinkarnasi', 'Keluarga', 'Balas Dendam'] },
  { id: '41000110316', title: 'Dewa Tersembunyi', cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x1/41x0/410x0/41000110316/41000110316.jpg', synopsis: 'Indra adalah kultivator genius yang diusir dari gunung dan mengejutkan seluruh dunia medis dengan ilmu sakti.', episodes: 75, tags: ['Kultivasi', 'Balas Dendam', 'Pria Dominan'] }
].map(d => ({ ...d, isCompleted: true, source: 'dramabox' }));

/**
 * Mengambil Feed Kategori Khusus DramaBox
 * (foryou, trending, vip, dubindo, latest, randomdrama)
 */
async function getDramaBoxFeed(type = 'foryou', page = 1) {
  const cacheKey = `db_feed_${type}_${page}`;
  const cached = dramaBoxCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_FEED) {
    return cached.data;
  }

  let items = [];

  try {
    let endpoint = '/dramabox/foryou';
    if (type === 'trending') endpoint = '/dramabox/trending';
    else if (type === 'vip') endpoint = '/dramabox/vip';
    else if (type === 'dubindo') endpoint = '/dramabox/dubindo?classify=terpopuler';
    else if (type === 'latest') endpoint = '/dramabox/latest';
    else if (type === 'randomdrama') endpoint = '/dramabox/randomdrama';

    const res = await client.get(endpoint);
    let rawList = [];

    if (Array.isArray(res.data)) {
      rawList = res.data;
    } else if (res.data?.recommendList?.records) {
      rawList = res.data.recommendList.records;
    } else if (res.data?.columnVoList && Array.isArray(res.data.columnVoList)) {
      res.data.columnVoList.forEach(col => {
        if (col.bookList && Array.isArray(col.bookList)) rawList.push(...col.bookList);
      });
    } else if (res.data?.data || res.data?.list) {
      rawList = Array.isArray(res.data.data) ? res.data.data : (Array.isArray(res.data.list) ? res.data.list : [res.data.data]);
    } else if (res.data?.bookId) {
      rawList = [res.data];
    }

    items = rawList.map(normalizeDramaBoxItem).filter(Boolean);
  } catch (err) {
    // Fallback cerdas berbasis kurasi & filter
    if (type === 'dubindo') {
      items = DRAMABOX_CURATED.filter(d => d.title.includes('Sulih Suara'));
    } else if (type === 'vip') {
      items = DRAMABOX_CURATED.filter(d => d.tags.includes('VIP') || d.episodes > 50);
    } else if (type === 'latest') {
      items = DRAMABOX_CURATED.slice(3, 7);
    } else {
      items = [...DRAMABOX_CURATED];
    }
  }

  if (items.length === 0) {
    items = [...DRAMABOX_CURATED];
  }

  // Deduplicate
  const seen = new Set();
  const deduped = items.filter(d => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  const result = { success: true, source: 'dramabox', type, page, items: deduped };
  dramaBoxCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

/**
 * Ambil Popular Search DramaBox
 */
async function getDramaBoxPopularSearch() {
  const cacheKey = 'db_popular_search';
  const cached = dramaBoxCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
    return cached.data;
  }

  let keywords = [
    'Sulih Suara',
    'Raja Naga',
    'Dewa Judi',
    'CEO',
    'Balas Dendam',
    'Akademi Shifter',
    'Raja Mafia',
    'Dewa Perang',
    'Billionaire',
    'Kekuatan Khusus'
  ];

  try {
    const res = await client.get('/dramabox/populersearch');
    const raw = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.list || []);
    if (Array.isArray(raw) && raw.length > 0) {
      const parsed = raw.map(k => typeof k === 'string' ? k : (k.word || k.query || k.title || '')).filter(Boolean);
      if (parsed.length > 0) keywords = parsed;
    }
  } catch (e) {}

  const result = { success: true, source: 'dramabox', keywords };
  dramaBoxCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

/**
 * Ambil Satu Drama Acak DramaBox
 */
async function getDramaBoxRandomDrama() {
  try {
    const res = await client.get('/dramabox/randomdrama');
    if (res.data?.bookId) {
      const item = normalizeDramaBoxItem(res.data);
      if (item) return { success: true, source: 'dramabox', drama: item };
    }
  } catch (e) {}

  // Fallback pick from curated
  const randomIdx = Math.floor(Math.random() * DRAMABOX_CURATED.length);
  const picked = DRAMABOX_CURATED[randomIdx];
  return { success: true, source: 'dramabox', drama: picked };
}

/**
 * Ambil daftar semua episode DramaBox dari Sansekai dengan caching 24 jam & fallback
 */
async function getDramaBoxAllEpisodes(bookId) {
  const cacheKey = `db_all_${bookId}`;
  const cached = dramaBoxCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_DRAMABOX) {
    return cached.data;
  }

  let list = [];
  let attempts = 0;

  while (attempts < 2) {
    attempts++;
    try {
      const res = await client.get(`/dramabox/allepisode?bookId=${encodeURIComponent(bookId)}`);
      list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.list || []);
      if (list && list.length > 0) {
        dramaBoxCache.set(cacheKey, { timestamp: Date.now(), data: list });
        return list;
      }
    } catch (err) {
      if (attempts < 2 && err.response?.status === 429) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      break;
    }
  }

  return list;
}

/**
 * Ambil link stream terdekripsi untuk episode tertentu DramaBox
 */
async function getDramaBoxEpisodeStream(bookId, ep = 1) {
  const epIndex = Number(ep) - 1;
  let list = [];
  try {
    list = await getDramaBoxAllEpisodes(bookId);
  } catch (e) {
    list = [];
  }

  if (list && list.length > 0 && epIndex >= 0 && epIndex < list.length) {
    const epData = list[epIndex];
    const cdn = epData.cdnList?.[0] || epData.cdnList?.[1];
    const videoItem = cdn?.videoPathList?.[0];
    let rawUrl = videoItem?.videoPath || '';

    if (rawUrl && !rawUrl.startsWith('http')) {
      rawUrl = `https://${cdn?.cdnDomain || 'hwztakavideo.dramaboxdb.com'}${rawUrl}`;
    }

    if (rawUrl) {
      let streamUrl = rawUrl;
      if (rawUrl.includes('.encrypt.')) {
        streamUrl = `https://api.sansekai.my.id/api/dramabox/decrypt-stream?url=${encodeURIComponent(rawUrl)}`;
      }

      const qualities = (cdn?.videoPathList || []).map(v => {
        let qUrl = v.videoPath || '';
        if (qUrl && !qUrl.startsWith('http')) {
          qUrl = `https://${cdn?.cdnDomain || 'hwztakavideo.dramaboxdb.com'}${qUrl}`;
        }
        if (qUrl.includes('.encrypt.')) {
          qUrl = `https://api.sansekai.my.id/api/dramabox/decrypt-stream?url=${encodeURIComponent(qUrl)}`;
        }
        return {
          quality: `${v.quality || '1080'}p`,
          url: qUrl
        };
      });

      return {
        success: true,
        source: 'dramabox',
        dramaId: bookId,
        episode: Number(ep),
        totalEpisodes: list.length,
        title: epData.chapterName || `Episode ${ep}`,
        videoUrl: streamUrl,
        qualities: qualities.length > 0 ? qualities : [{ quality: '1080p', url: streamUrl }]
      };
    }
  }

  // Direct HLS Proxy Fallback via Anichin Official
  const token = process.env.ANICHIN_API_KEY || 'ANICHIN-A5A16A417FC3EBA15BE691F2B9AA6DA1';
  const fallbackUrl = `https://miniapp.anichin.bio/api/dramabox/hls?id=${encodeURIComponent(bookId)}&ep=${encodeURIComponent(ep)}&token=${token}`;

  return {
    success: true,
    source: 'dramabox',
    dramaId: bookId,
    episode: Number(ep),
    totalEpisodes: list.length || 75,
    title: `Episode ${ep}`,
    videoUrl: fallbackUrl,
    qualities: [{ quality: '720p HD', url: fallbackUrl }]
  };
}

module.exports = {
  getDramaBoxFeed,
  getDramaBoxPopularSearch,
  getDramaBoxRandomDrama,
  getDramaBoxAllEpisodes,
  getDramaBoxEpisodeStream
};
