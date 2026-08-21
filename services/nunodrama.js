/**
 * DracinHub - NunoDrama REST API Service
 * Integrasi 50+ Provider Drama Pendek, Donghua, Anime, dan K-Drama dari NunoDrama Gateway
 */

const axios = require('axios');
const http = require('http');
const https = require('https');

const NUNO_BASE_URL = 'https://redmi.nunodrama.my.id';

const nunoClient = axios.create({
  baseURL: NUNO_BASE_URL,
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
});

const memoryCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 menit

const NUNODRAMA_SOURCES = {
  // === POPULER & VIRAL SHORT DRAMAS ===
  snackshort:   { name: 'SnackShort',   badge: 'Viral & Dub',    desc: 'Drama pendek romantis dan komedi terpopuler', icon: 'https://bs.kjcdn.com/favicon.ico' },
  dotdrama:     { name: 'DotDrama',     badge: 'HD',             desc: 'Serial drama pendek modern', icon: 'https://dotdrama.com/favicon.ico' },
  flextv:       { name: 'FlexTV',       badge: 'Global Hit',     desc: 'Katalog drama multi-negara dan multi-bahasa', icon: 'https://flextv.cc/favicon.ico' },
  dramabite:    { name: 'DramaBite',    badge: 'Fast Stream',    desc: 'Drama pendek update cepat setiap hari', icon: 'https://dramabite.com/favicon.ico' },
  anyreel:      { name: 'AnyReel',      badge: 'Asian Drama',    desc: 'Drama romantis dan CEO Asia', icon: 'https://anyreel.tv/favicon.ico' },
  soreel:       { name: 'SoReel',       badge: 'Trending',       desc: 'Pilihan drama ranking teratas', icon: 'https://soreel.tv/favicon.ico' },
  stareel:      { name: 'StaReel',      badge: 'Hot',            desc: 'Serial drama billionaire dan werewolf', icon: 'https://stareel.tv/favicon.ico' },
  kalostv:      { name: 'KalosTV',      badge: 'Popular',        desc: 'Drama pendek terfavorit', icon: 'https://kalostv.com/favicon.ico' },
  radreels:     { name: 'RadReels',     badge: 'Terbaru',        desc: 'Koleksi drama pendek rilis terbaru', icon: 'https://radreels.com/favicon.ico' },
  reelshortv2:  { name: 'ReelShort V2', badge: 'HD Dubbing',     desc: 'Server kedua ReelShort dengan subtitle lengkap', icon: 'https://www.reelshort.com/favicon.ico' },
  freeshort:    { name: 'FreeShort',    badge: 'Gratis',         desc: 'Serial drama gratis tanpa kunci', icon: 'https://freeshort.tv/favicon.ico' },
  nunodrama:    { name: 'NunoDrama',    badge: 'AIO Catalog',    desc: 'Agregator drama pilihan komunitas', icon: 'https://redmi.nunodrama.my.id/favicon.ico' },
  meloshort:    { name: 'MeloShort',    badge: 'Romance',        desc: 'Drama cinta manis dan keluarga', icon: 'https://meloshort.com/favicon.ico' },
  shortswave:   { name: 'ShortsWave',   badge: 'Multi-Res',      desc: 'Streaming drama resolusi adaptif', icon: 'https://shortswave.com/favicon.ico' },
  sodareels:    { name: 'SodaReels',    badge: 'Fresh',          desc: 'Serial drama segar dan menarik', icon: 'https://sodareels.com/favicon.ico' },
  vibeshort:    { name: 'VibeShort',    badge: 'Hot',            desc: 'Drama trend media sosial', icon: 'https://vibeshort.com/favicon.ico' },
  dramarush:    { name: 'DramaRush',    badge: 'Fast',           desc: 'Drama pendek alur cepat', icon: 'https://dramarush.com/favicon.ico' },
  cubetv:       { name: 'CubeTV',       badge: 'Top Series',     desc: 'Katalog drama dan serial pilihan', icon: 'https://cubetv.sg/favicon.ico' },
  lupacine:     { name: 'LupaCine',     badge: 'Pilihan',        desc: 'Drama dan film pendek pilihan', icon: 'https://lupacine.com/favicon.ico' },
  idrama:       { name: 'iDrama',       badge: 'Classic',        desc: 'Drama klasik Asia dan modern', icon: 'https://idrama.tv/favicon.ico' },
  happyshort:   { name: 'HappyShort',   badge: 'Fun',            desc: 'Drama komedi dan romantis ceria', icon: 'https://happyshort.tv/favicon.ico' },
  momeshort:    { name: 'MomeShort',    badge: 'Terbaru',        desc: 'Drama rilis baru harian', icon: 'https://momeshort.com/favicon.ico' },
  moreshort:    { name: 'MoreShort',    badge: 'Katalog Luas',   desc: 'Ratusan pilihan judul drama pendek', icon: 'https://moreshort.tv/favicon.ico' },
  storygo:      { name: 'StoryGo',      badge: 'Storyline',      desc: 'Drama dengan alur cerita mendalam', icon: 'https://storygo.tv/favicon.ico' },
  minishort:    { name: 'MiniShort',    badge: 'Compact',        desc: 'Drama durasi super ringkas', icon: 'https://minishort.com/favicon.ico' },
  shorten:      { name: 'Shorten',      badge: 'Trending',       desc: 'Drama pendek populer', icon: 'https://shorten.tv/favicon.ico' },
  mydrama:      { name: 'MyDrama',      badge: 'HD',             desc: 'Koleksi drama pilihan terbaik', icon: 'https://mydrama.tv/favicon.ico' },
  huangdou:     { name: 'HuangDou',     badge: 'Chinese Hit',    desc: 'Drama pendek asli Mandarin', icon: 'https://huangdou.com/favicon.ico' },
  ansflix:      { name: 'AnsFlix',      badge: 'Stream',         desc: 'Serial drama dan mini movie', icon: 'https://ansflix.com/favicon.ico' },
  bibishort:    { name: 'BiBiShort',    badge: 'Popular',        desc: 'Drama viral Asia', icon: 'https://bibishort.tv/favicon.ico' },
  fundrama:     { name: 'FunDrama',     badge: 'Entertaining',   desc: 'Drama menghibur dan seru', icon: 'https://fundrama.tv/favicon.ico' },
  zeroshort:    { name: 'ZeroShort',    badge: 'New',            desc: 'Koleksi drama tanpa batas', icon: 'https://zeroshort.tv/favicon.ico' },
  dramaora:     { name: 'DramaOra',     badge: 'Kategori Lengkap', desc: 'Drama dengan filter genre lengkap', icon: 'https://dramaora.com/favicon.ico' },
  bumpit:       { name: 'BumpIt',       badge: 'HLS Playlist',   desc: 'Direct HLS streaming multi-source', icon: 'https://bumpit.tv/favicon.ico' },
  nunomix:      { name: 'NunoMix',      badge: 'Rekomendasi',    desc: 'Kombinasi drama terbaik', icon: 'https://nunomix.com/favicon.ico' },

  // === DONGHUA & ANIME ===
  donghuaqueen: { name: 'Donghua Queen', badge: 'Donghua HD',     desc: 'Animasi 3D China (Donghua) subtitle Indonesia', icon: 'https://donghuaqueen.org/favicon.ico' },
  samehadaku:   { name: 'Samehadaku',    badge: 'Anime Sub Indo', desc: 'Serial Anime Jepang subtitle Indonesia', icon: 'https://samehadaku.email/favicon.ico' },
  animex:       { name: 'AnimeX',        badge: 'Anime Streaming', desc: 'Koleksi anime ongoing & complete', icon: 'https://animex.ninja/favicon.ico' },
  bstation:     { name: 'BStation',      badge: 'Anime & Drama',  desc: 'Serial Bilibili / BStation populer', icon: 'https://www.bilibili.tv/favicon.ico' },
  toonshort:    { name: 'ToonShort',     badge: 'Animasi Pendek', desc: 'Kartun & animasi pendek', icon: 'https://toonshort.tv/favicon.ico' },

  // === K-DRAMA & MOVIES ===
  drakorid:     { name: 'DrakorID',      badge: 'K-Drama',        desc: 'Drama Korea dan Movie Korea Sub Indo', icon: 'https://drakor.id/favicon.ico' },
  lookseries:   { name: 'LookSeries',    badge: 'Film & Series',  desc: 'Serial TV, film, dan kartun streaming', icon: 'https://lookseries.com/favicon.ico' },
  dramaqueen:   { name: 'DramaQueen',    badge: 'Asian Movie',    desc: 'Drama dan film Asia terlengkap', icon: 'https://dramaqueen.org/favicon.ico' }
};

function getNunoSources() {
  return Object.entries(NUNODRAMA_SOURCES).map(([key, val]) => ({
    key,
    name: val.name,
    badge: val.badge,
    desc: val.desc,
    icon: val.icon || '',
    providerEngine: 'nunodrama'
  }));
}

function isNunoSource(source) {
  return Boolean(NUNODRAMA_SOURCES[source]);
}

function normalizeItem(item) {
  if (!item) return null;
  const id = String(item.bookId || item.id || item.dramaId || item.book_id || item.drama_id || item.slug || item.code || '');
  const title = item.bookName || item.title || item.name || item.dramaName || 'Drama';
  let cover = item.cover || item.poster || item.thumb || item.image || item.cover_url || '';
  if (cover && cover.startsWith('//')) cover = 'https:' + cover;
  
  const synopsis = item.introduction || item.summary || item.desc || item.synopsis || item.description || '';
  const totalEpisodes = Number(item.chapters || item.totalEpisodes || item.episodeCount || item.total_episodes || item.episodes || 30);
  
  let tags = [];
  if (item.category) {
    tags = String(item.category).split(',').map(s => s.trim()).filter(Boolean);
  } else if (item.status) {
    tags = [item.status];
  } else {
    tags = ['Drama'];
  }

  return {
    id,
    title,
    cover,
    synopsis,
    totalEpisodes: totalEpisodes > 0 ? totalEpisodes : 30,
    tags
  };
}

async function getNunoFeed(source, type = 'foryou', page = 1) {
  const cacheKey = `nuno_feed_${source}_${type}_${page}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const tryEndpoints = [
    `/api/${source}/foryou`,
    `/api/${source}/home`,
    `/api/${source}/recommend`,
    `/api/${source}/ranking`,
    `/api/${source}/trending`,
    `/api/${source}/popular`,
    `/api/${source}/all`,
    `/api/${source}/catalog`,
    `/api/${source}/drama`,
    `/api/${source}/donghua`,
    `/api/${source}/film`
  ];

  let rawItems = [];
  for (const ep of tryEndpoints) {
    try {
      const res = await nunoClient.get(ep, { params: { page: String(page) }, timeout: 8000 });
      if (res.status === 200 && res.data) {
        const d = res.data.data || res.data.items || res.data.list || res.data.results || (Array.isArray(res.data) ? res.data : []);
        if (Array.isArray(d) && d.length > 0) {
          rawItems = d;
          break;
        }
      }
    } catch (e) {}
  }

  const items = rawItems.map(normalizeItem).filter(Boolean);
  const result = { success: true, source, type, page: Number(page), items };
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function searchNunoDramas(source, query) {
  if (!query || !query.trim()) {
    return { success: true, source, query: '', items: [] };
  }

  const cacheKey = `nuno_search_${source}_${query.trim().toLowerCase()}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }

  let rawItems = [];
  try {
    const res = await nunoClient.get(`/api/${source}/search`, {
      params: { query: query.trim(), q: query.trim(), keyword: query.trim() },
      timeout: 8000
    });
    if (res.data) {
      const d = res.data.data || res.data.items || res.data.list || res.data.results || (Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(d)) rawItems = d;
    }
  } catch (e) {}

  const items = rawItems.map(normalizeItem).filter(Boolean);
  const result = { success: true, source, query, items };
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function getNunoDramaDetail(source, id) {
  if (!id) throw new Error('ID drama tidak boleh kosong');

  const cacheKey = `nuno_detail_${source}_${id}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let detailObj = null;
  try {
    const res = await nunoClient.get(`/api/${source}/detail`, {
      params: { id, book_id: id, drama_id: id, bookId: id, slug: id },
      timeout: 8000
    });
    if (res.data?.data) detailObj = res.data.data;
    else if (res.data && typeof res.data === 'object' && !res.data.error) detailObj = res.data;
  } catch (e) {}

  // Coba ambil list episode
  let episodes = [];
  try {
    const epRes = await nunoClient.get(`/api/${source}/allepisode`, {
      params: { id, book_id: id, drama_id: id, bookId: id },
      timeout: 8000
    });
    const epList = epRes.data?.data || epRes.data?.episodes || epRes.data?.list || [];
    if (Array.isArray(epList) && epList.length > 0) {
      episodes = epList.map((ep, idx) => {
        const epNum = Number(ep.episodeNumber || ep.chapter_index || ep.number || ep.order || idx + 1);
        return {
          number: epNum,
          title: ep.title || ep.name || ep.chapter_name || `Episode ${epNum}`,
          locked: Boolean(ep.locked || ep.is_locked),
          videoUrl: ep.videoUrl || ep.url || ep.stream || ''
        };
      });
    }
  } catch (e) {}

  const baseNormalized = normalizeItem(detailObj || { id });
  const total = episodes.length > 0 ? episodes.length : (baseNormalized?.totalEpisodes || 30);

  if (episodes.length === 0) {
    for (let i = 1; i <= total; i++) {
      episodes.push({
        number: i,
        title: `Episode ${i}`,
        locked: false,
        videoUrl: ''
      });
    }
  }

  const drama = {
    id,
    source,
    title: baseNormalized?.title || `Drama ${id}`,
    cover: baseNormalized?.cover || '',
    synopsis: baseNormalized?.synopsis || 'Tidak ada sinopsis tersedia.',
    tags: baseNormalized?.tags || ['Drama'],
    totalEpisodes: total,
    episodes
  };

  const result = { success: true, source, drama };
  memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

async function getNunoDramaEpisode(source, id, ep = 1) {
  if (!id) throw new Error('ID drama tidak boleh kosong');

  const cacheKey = `nuno_ep_${source}_${id}_${ep}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  let videoUrl = '';
  let qualities = [];
  let subtitles = [];

  try {
    const params = (source === 'dramabox')
      ? { book_id: String(id), episode_num: String(ep) }
      : {
          id: String(id),
          book_id: String(id),
          drama_id: String(id),
          ep: String(ep),
          episode_num: String(ep),
          chapter_id: String(ep)
        };

    const res = await axios.get(`${NUNO_BASE_URL}/api/${source}/stream`, {
      params,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    const d = res.data?.data || res.data || {};
    const current = d.current || d.raw?.current || {};

    if (Array.isArray(current.videoInfoList) && current.videoInfoList.length > 0) {
      qualities = current.videoInfoList.map(v => ({
        label: v.quality || 'HD',
        url: v.videoPath || v.url,
        isDefault: v.quality === '720p'
      }));
      const def = qualities.find(q => q.isDefault) || qualities[0];
      videoUrl = def?.url || '';
    }

    if (!videoUrl) {
      videoUrl = current.streamUrl || d.stream || d.videoUrl || d.url || d.m3u8 || d.play_url || d.link || d.playUrl || d.streamUrl || '';
    }

    if (qualities.length === 0 && Array.isArray(d.qualities || d.qualityList)) {
      qualities = (d.qualities || d.qualityList).map(q => ({
        label: q.label || `${q.quality || q.name || 'HD'}`,
        url: q.url || q.stream,
        isDefault: q.isDefault || false
      }));
    }

    if (Array.isArray(d.subtitles)) {
      subtitles = d.subtitles.map(s => ({
        label: s.label || s.language || 'Sub',
        language: s.language || 'id',
        url: s.url
      }));
    }
  } catch (e) {}

  if (!videoUrl) {
    // Fallback: coba periksa detail
    try {
      const detail = await getNunoDramaDetail(source, id);
      const epItem = detail.drama?.episodes?.[Number(ep) - 1];
      if (epItem?.videoUrl) videoUrl = epItem.videoUrl;
    } catch (e) {}
  }

  if (videoUrl && videoUrl.startsWith('/')) {
    videoUrl = `${NUNO_BASE_URL}${videoUrl}`;
  }

  if (qualities.length === 0 && videoUrl) {
    qualities.push({ label: 'HD Auto', url: videoUrl, isDefault: true });
  }

  const result = {
    success: Boolean(videoUrl),
    source,
    id,
    episodeNumber: Number(ep),
    videoUrl,
    qualities,
    subtitles
  };

  if (videoUrl) {
    memoryCache.set(cacheKey, { timestamp: Date.now(), data: result });
  }

  return result;
}

module.exports = {
  NUNODRAMA_SOURCES,
  getNunoSources,
  isNunoSource,
  getNunoFeed,
  searchNunoDramas,
  getNunoDramaDetail,
  getNunoDramaEpisode
};
