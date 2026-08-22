const axios = require('axios');

const SANSEKAI_BASE = 'https://api.sansekai.my.id/api';
const dramaBoxCache = new Map();
const CACHE_TTL_DRAMABOX = 60 * 60 * 1000; // 1 Jam Cache

const client = axios.create({
  baseURL: SANSEKAI_BASE,
  timeout: 45000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
});

/**
 * Ambil daftar semua episode DramaBox dari Sansekai dengan caching 1 jam
 */
async function getDramaBoxAllEpisodes(bookId) {
  const cacheKey = `db_all_${bookId}`;
  const cached = dramaBoxCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_DRAMABOX) {
    return cached.data;
  }

  const res = await client.get(`/dramabox/allepisode?bookId=${encodeURIComponent(bookId)}`);
  const list = Array.isArray(res.data) ? res.data : (res.data.data || res.data.list || []);
  
  if (list && list.length > 0) {
    dramaBoxCache.set(cacheKey, { timestamp: Date.now(), data: list });
  }
  return list;
}

/**
 * Ambil link stream terdekripsi untuk episode tertentu DramaBox
 */
async function getDramaBoxEpisodeStream(bookId, ep = 1) {
  const epIndex = Number(ep) - 1;
  const list = await getDramaBoxAllEpisodes(bookId);

  if (!list || list.length === 0 || epIndex < 0 || epIndex >= list.length) {
    throw new Error(`Episode ${ep} tidak ditemukan untuk drama ID ${bookId}`);
  }

  const epData = list[epIndex];
  const cdn = epData.cdnList?.[0];
  const videoItem = cdn?.videoPathList?.[0];
  let rawUrl = videoItem?.videoPath || '';

  if (rawUrl && !rawUrl.startsWith('http')) {
    rawUrl = `https://${cdn?.cdnDomain || 'hwztakavideo.dramaboxdb.com'}${rawUrl}`;
  }

  if (!rawUrl) {
    throw new Error(`Video URL tidak tersedia untuk episode ${ep}`);
  }

  // Jika URL berupa .encrypt.mp4, gunakan stream decrypt Sansekai
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

module.exports = {
  getDramaBoxAllEpisodes,
  getDramaBoxEpisodeStream
};
