/**
 * DracinHub - Stream & Subtitle Proxy Service
 * Menangani HLS rewriting, segment forwarding, dan SRT to WebVTT converter
 */

const axios = require('axios');
const http = require('http');
const https = require('https');

const apiClient = axios.create({
  timeout: 25000
});

const m3u8Cache = new Map();

async function handleStreamProxy(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('URL stream diperlukan');
  }

  try {
    const isM3u8 = targetUrl.includes('.m3u8') || targetUrl.includes('m3u8') || req.path.endsWith('.m3u8');

    const token = process.env.ANICHIN_API_KEY || 'ANICHIN-A5A16A417FC3EBA15BE691F2B9AA6DA1';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': targetUrl.includes('sansekai.my.id') ? 'https://api.sansekai.my.id/' : (targetUrl.includes('dramabox') ? 'https://www.dramaboxdb.com/' : 'https://miniapp.anichin.bio/')
    };

    if (targetUrl.includes('anichin.bio')) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-API-Key'] = token;
    }

    if (isM3u8) {
      let m3u8Content;
      const cached = m3u8Cache.get(targetUrl);
      if (cached && Date.now() - cached.timestamp < 10000) {
        m3u8Content = cached.data;
      } else {
        const response = await apiClient.get(targetUrl, { headers, responseType: 'text', timeout: 15000 });
        m3u8Content = response.data;
        m3u8Cache.set(targetUrl, { timestamp: Date.now(), data: m3u8Content });
      }

      // Base URL target untuk resolve relative path
      const urlObj = new URL(targetUrl);
      const baseUrl = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);

      const resolveAbsolute = (rawUri) => {
        if (!rawUri) return rawUri;
        if (rawUri.startsWith('http://') || rawUri.startsWith('https://')) return rawUri;
        if (rawUri.startsWith('/')) return `${urlObj.origin}${rawUri}`;
        return `${baseUrl}${rawUri}`;
      };

      // Cek apakah ini playlist video-only DramaWave yang terpisah dari audio track-nya
      const isMediaOnly = !m3u8Content.includes('#EXT-X-STREAM-INF') && m3u8Content.includes('#EXT-X-MAP');
      const isDramaWave = targetUrl.includes('mydramawave.com') || targetUrl.includes('dramawave');

      // Synthetic master M3U8: aktif untuk DramaWave media-only playlist dengan berbagai pola URL
      const dramaWaveVideoMatch = targetUrl.match(/_(\d+)\.m3u8$/) || targetUrl.match(/\/(\d+)\.m3u8$/);
      if (isDramaWave && isMediaOnly && req.query.is_media !== '1' && dramaWaveVideoMatch) {
        // Coba beberapa pola audio URL yang umum dipakai DramaWave
        const audioUrlCandidates = [
          targetUrl.replace(/_(\d+)\.m3u8$/, '_0_1.aac.m3u8'),
          targetUrl.replace(/_(\d+)\.m3u8$/, '_audio.m3u8'),
          targetUrl.replace(/\/(\d+)\.m3u8$/, '/audio.m3u8'),
        ].filter((u, i, arr) => arr.indexOf(u) === i && u !== targetUrl);

        const audioUrl = audioUrlCandidates[0];
        const masterM3u8 = [
          '#EXTM3U',
          '#EXT-X-VERSION:6',
          '#EXT-X-INDEPENDENT-SEGMENTS',
          `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="default-audio",NAME="Original Audio",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="/api/stream/proxy?url=${encodeURIComponent(audioUrl)}"`,
          `#EXT-X-STREAM-INF:BANDWIDTH=1800000,AVERAGE-BANDWIDTH=1000000,CODECS="avc1.640032,mp4a.40.2",RESOLUTION=720x1280,AUDIO="default-audio"`,
          `/api/stream/proxy?url=${encodeURIComponent(targetUrl)}&is_media=1`
        ].join('\n');

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.send(masterM3u8);
      }

      // Helper: deteksi apakah audio track adalah Bahasa Indonesia
      const isIndoAudioTrack = (str) => {
        const s = str.toLowerCase();
        return s.includes('id-id') || s.includes('language="id"') || s.includes('name="id"') ||
               s.includes('indonesian') || s.includes('indonesia') || s.includes('bahasa') ||
               s.includes('indo') || (s.includes('"id"') && s.includes('audio'));
      };

      const rewritten = m3u8Content.split('\n').map(line => {
        let trimmed = line.trim();
        if (!trimmed) return line;

        // Replace expired token jika ada
        if (trimmed.includes('api_key=')) {
          trimmed = trimmed.replace(/api_key=[^&"\s]+/, `api_key=${token}`);
        }

        // Pastikan track audio Indonesia diprioritaskan sebagai default (DEFAULT=YES)
        if (trimmed.includes('TYPE=AUDIO')) {
          const isIndo = isIndoAudioTrack(trimmed);
          if (isIndo) {
            trimmed = trimmed.replace(/DEFAULT=(YES|NO)/i, 'DEFAULT=YES').replace(/AUTOSELECT=(YES|NO)/i, 'AUTOSELECT=YES');
            if (!trimmed.includes('DEFAULT=')) trimmed += ',DEFAULT=YES';
            if (!trimmed.includes('AUTOSELECT=')) trimmed += ',AUTOSELECT=YES';
          } else {
            trimmed = trimmed.replace(/DEFAULT=(YES|NO)/i, 'DEFAULT=NO').replace(/AUTOSELECT=(YES|NO)/i, 'AUTOSELECT=NO');
          }
        }

        // Handle #EXT-X-MAP:URI="..." or #EXT-X-KEY:URI="..." or #EXT-X-MEDIA:URI="..."
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            const abs = resolveAbsolute(uri);
            return `URI="/api/stream/proxy?url=${encodeURIComponent(abs)}"`;
          });
        }

        if (trimmed.startsWith('#')) return trimmed;

        const absoluteLineUrl = resolveAbsolute(trimmed);
        return `/api/stream/proxy?url=${encodeURIComponent(absoluteLineUrl)}`;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.send(rewritten);
    } else {
      // Pipe video segments (.ts, .m4s, .mp4)
      const range = req.headers.range;
      const requestHeaders = { ...headers };
      if (range) requestHeaders.Range = range;

      const response = await apiClient.get(targetUrl, {
        headers: requestHeaders,
        responseType: 'stream',
        timeout: 30000
      });

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
      res.setHeader('Accept-Ranges', 'bytes');

      if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
      if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
      if (response.headers['content-range']) {
        res.setHeader('Content-Range', response.headers['content-range']);
        res.status(206);
      } else {
        res.status(response.status || 200);
      }

      response.data.pipe(res);
    }
  } catch (err) {
    res.status(502).send('Error proxying stream: ' + err.message);
  }
}

/**
 * Subtitle Converter (SRT -> WebVTT)
 */
function srtToVtt(srtText) {
  let vtt = "WEBVTT\n\n";
  let content = srtText.replace(/\r\n|\r/g, '\n');
  content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3}) --> (\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2 --> $3.$4 line:82% position:50% align:center');
  vtt += content;
  return vtt;
}

async function handleSubtitleProxy(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL subtitle diperlukan');

  try {
    const response = await axios.get(url, {
      responseType: 'text',
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    let srtText = response.data;
    let vttText = srtToVtt(srtText);

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(vttText);
  } catch (err) {
    res.status(502).send('WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\nGagal memuat subtitle.');
  }
}

module.exports = {
  handleStreamProxy,
  handleSubtitleProxy
};
