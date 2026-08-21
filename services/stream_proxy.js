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
    const targetUrl = decodeURIComponent(url);
    const isM3u8 = targetUrl.includes('.m3u8') || req.path.endsWith('.m3u8');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://miniapp.anichin.bio/'
    };

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

      // Rewrite relative URLs di dalam playlist agar melalui proxy
      const rewritten = m3u8Content.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // Handle #EXT-X-MAP:URI="..." or #EXT-X-KEY:URI="..."
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            const abs = resolveAbsolute(uri);
            return `URI="/api/stream/proxy?url=${encodeURIComponent(abs)}"`;
          });
        }

        if (trimmed.startsWith('#')) return line;

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
  content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
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
