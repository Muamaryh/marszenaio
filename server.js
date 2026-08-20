require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getSources, getFeed, searchDramas, getDramaDetail, getDramaEpisode } = require('./services/anichin');
const { handleStreamProxy, handleSubtitleProxy } = require('./services/stream_proxy');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== API ROUTES =====

// 1. Get Sources List
app.get('/api/drama/sources', (req, res) => {
  try {
    const sources = getSources();
    res.json({ success: true, sources });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get Feed (Trending, For You, Hot Rank, Recommended)
app.get('/api/drama/feed', async (req, res) => {
  const { source = 'dramawave', type = 'trending', page = 1 } = req.query;
  try {
    const feed = await getFeed(source, type, Number(page));
    res.json(feed);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Search Dramas
app.get('/api/drama/search', async (req, res) => {
  const { source = 'dramawave', query = '' } = req.query;
  try {
    const results = await searchDramas(source, query);
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
    const detail = await getDramaDetail(source, id);
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
    const episode = await getDramaEpisode(source, id, Number(ep));
    res.json(episode);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Stream HLS / MP4 Proxy
app.get('/api/stream/proxy', handleStreamProxy);

// 7. Subtitle Proxy (SRT -> VTT)
app.get('/api/stream/subtitle', handleSubtitleProxy);

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

app.listen(PORT, () => {
  console.log(`🎬 DracinHub AIO Short Drama Server running on http://localhost:${PORT}`);
});
