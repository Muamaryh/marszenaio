require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getSources: getAnichinSources, getFeed: getAnichinFeed, searchDramas: searchAnichinDramas, getDramaDetail: getAnichinDetail, getDramaEpisode: getAnichinEpisode } = require('./services/anichin');
const { getNunoSources, isNunoSource, getNunoFeed, searchNunoDramas, getNunoDramaDetail, getNunoDramaEpisode } = require('./services/nunodrama');
const { handleStreamProxy, handleSubtitleProxy } = require('./services/stream_proxy');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== API ROUTES =====

// 1. Get Sources List (Gabungan Anichin + NunoDrama)
app.get('/api/drama/sources', (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    const anichinSources = getAnichinSources();
    const nunoSources = getNunoSources();
    const sources = [...anichinSources, ...nunoSources];
    res.json({ success: true, sources });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get Feed (Trending, For You, Hot Rank, Recommended)
app.get('/api/drama/feed', async (req, res) => {
  const { source = 'dramawave', type = 'trending', page = 1 } = req.query;
  try {
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    let feed;
    if (isNunoSource(source)) {
      feed = await getNunoFeed(source, type, Number(page));
    } else {
      feed = await getAnichinFeed(source, type, Number(page));
    }
    res.json(feed);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Search Dramas
app.get('/api/drama/search', async (req, res) => {
  const { source = 'dramawave', query = '' } = req.query;
  try {
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600');
    let results;
    if (isNunoSource(source)) {
      results = await searchNunoDramas(source, query);
    } else {
      results = await searchAnichinDramas(source, query);
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get Drama Detail & Episodes
app.get('/api/drama/detail', async (req, res) => {
  const { source = 'dramawave', id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'ID drama diperlukan' });
  try {
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=7200');
    let detail;
    if (isNunoSource(source)) {
      detail = await getNunoDramaDetail(source, id);
    } else {
      detail = await getAnichinDetail(source, id);
    }
    res.json(detail);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Get Drama Episode Stream
app.get('/api/drama/episode', async (req, res) => {
  const { source = 'dramawave', id, ep = 1 } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'ID drama diperlukan' });
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    let episode;

    if (source === 'dramabox' || /^\d{11}$/.test(String(id))) {
      try {
        const axios = require('axios');
        const resp = await axios.get('https://redmi.nunodrama.my.id/api/dramabox/stream', {
          params: { book_id: String(id), episode_num: String(ep) },
          timeout: 12000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const d = resp.data?.data || resp.data || {};
        const current = d.current || d.raw?.current || {};
        let videoUrl = '';
        let qualities = [];

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
          videoUrl = current.streamUrl || d.url || d.playUrl || d.streamUrl || '';
        }

        if (videoUrl) {
          episode = {
            success: true,
            source: 'dramabox',
            id,
            episodeNumber: Number(ep),
            videoUrl,
            qualities: qualities.length > 0 ? qualities : [{ label: '720p HD', url: videoUrl, isDefault: true }],
            subtitles: []
          };
        }
      } catch (e) {}
    }

    if (!episode || !episode.videoUrl) {
      if (isNunoSource(source)) {
        episode = await getNunoDramaEpisode(source, id, Number(ep));
      } else {
        episode = await getAnichinEpisode(source, id, Number(ep));
      }
    }
    res.json(episode);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Stream HLS / MP4 Proxy
app.get('/api/stream/proxy', handleStreamProxy);

// 7. Subtitle Proxy (SRT -> VTT)
app.get('/api/stream/subtitle', handleSubtitleProxy);

// Debug route
app.get('/api/debug/stream', async (req, res) => {
  const { id = '42000002888', ep = '65' } = req.query;
  const axios = require('axios');
  const details = {};
  try {
    const t0 = Date.now();
    const resp = await axios.get('https://redmi.nunodrama.my.id/api/dramabox/stream', {
      params: { book_id: String(id), episode_num: String(ep) },
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    details.nunoDirect = { status: resp.status, time: Date.now() - t0, data: resp.data };
  } catch (e) {
    details.nunoDirect = { error: e.message, status: e.response?.status, data: e.response?.data };
  }
  res.json(details);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'DracinHub - AIO Short Drama',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🎬 DracinHub AIO Short Drama Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
