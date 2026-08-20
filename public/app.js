/**
 * DracinHub - Client Controller
 * Advanced HLS & MP4 Player with Subtitle Selector, Auto-Next, and Multi-Provider Switching
 */

let appState = {
  sources: [],
  currentSource: 'dramawave',
  currentFeedType: 'trending',
  currentPage: 1,
  currentQuery: '',
  activeDrama: null,
  currentEpisode: 1,
  totalEpisodes: 0,
  episodesList: [],
  currentVideoData: null,
  hlsPlayer: null,
  searchTimeout: null,
  activeSubTrack: null
};

// DOM Helper
const el = (id) => document.getElementById(id);
const show = (id) => { const e = el(id); if (e) e.classList.remove('hidden'); };
const hide = (id) => { const e = el(id); if (e) e.classList.add('hidden'); };

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// ===== 1. INITIALIZATION & SOURCES =====

async function initApp() {
  await loadSources();
  await loadFeed();
  initSearch();
  initPlayerEventListeners();
}

async function loadSources() {
  const container = el('sourcesPillsBar');
  if (!container) return;

  try {
    const res = await fetch('/api/drama/sources');
    const data = await res.json();
    if (data.success && data.sources) {
      appState.sources = data.sources;
      renderSourcesPills();
    }
  } catch (err) {
    // Fallback default list
    appState.sources = [
      { key: 'dramawave', name: 'DramaWave', badge: 'HD & Subtitle', desc: 'Direct M3U8 streaming dengan 20+ subtitle multi-bahasa' },
      { key: 'freereels', name: 'FreeReels', badge: 'Gratis & Sub', desc: 'Direct stream cepat dengan subtitle Indonesia' },
      { key: 'netshort', name: 'NetShort', badge: 'Direct MP4', desc: 'Kualitas original MP4 dengan subtitle Indonesia' },
      { key: 'dramanova', name: 'DramaNova', badge: 'Romance / 18+', desc: 'Drama romantis & dewasa' },
      { key: 'starshort', name: 'StarShort', badge: 'M3U8 Fast', desc: 'Koleksi drama pendek terbaru' },
      { key: 'melolo', name: 'Melolo', badge: 'Multi-Bitrate', desc: 'Pilihan resolusi 720p, 540p, 360p' },
      { key: 'dramabox', name: 'DramaBox', badge: 'Popular', desc: 'Provider drama box nomor 1 di Asia' },
      { key: 'shortmax', name: 'ShortMax', badge: 'Trending', desc: 'Katalog ribuan drama pendek bertema CEO & Reinkarnasi' }
    ];
    renderSourcesPills();
  }
}

function renderSourcesPills() {
  const container = el('sourcesPillsBar');
  if (!container) return;
  container.innerHTML = '';

  appState.sources.forEach(src => {
    const btn = document.createElement('button');
    btn.className = 'source-btn' + (src.key === appState.currentSource ? ' active' : '');
    btn.innerHTML = `
      <span>${escapeHtml(src.name)}</span>
      ${src.badge ? `<span class="source-badge">${escapeHtml(src.badge)}</span>` : ''}
    `;
    btn.onclick = () => selectSource(src.key, src.name, src.desc);
    container.appendChild(btn);
  });
}

function selectSource(sourceKey, sourceName, sourceDesc = '') {
  appState.currentSource = sourceKey;
  appState.currentPage = 1;
  appState.currentQuery = '';
  
  if (el('headerSearchInput')) el('headerSearchInput').value = '';
  hide('headerSearchClear');

  if (el('sourceDesc')) el('sourceDesc').textContent = sourceDesc || 'Streaming drama pilihan';

  document.querySelectorAll('.source-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.includes(sourceName));
  });

  loadFeed();
}

function setFeedType(type) {
  appState.currentFeedType = type;
  appState.currentPage = 1;
  appState.currentQuery = '';

  if (el('headerSearchInput')) el('headerSearchInput').value = '';
  hide('headerSearchClear');

  document.querySelectorAll('.feed-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });

  const titles = {
    trending: '🔥 Trending Dramas',
    foryou: '✨ Untuk Anda',
    hotrank: '🏆 Peringkat Populer',
    recommended: '💎 Rekomendasi Pilihan'
  };
  if (el('currentFeedTitle')) el('currentFeedTitle').textContent = titles[type] || type;

  loadFeed();
}

// ===== 2. FEED & CATALOG =====

async function loadFeed() {
  show('dramaCatalogLoader');
  hide('dramaEmptyState');
  hide('dramaPagination');
  const grid = el('dramaGridContainer');
  if (grid) grid.innerHTML = '';
  if (el('feedCountBadge')) el('feedCountBadge').textContent = 'Memuat...';

  try {
    const url = `/api/drama/feed?source=${encodeURIComponent(appState.currentSource)}&type=${encodeURIComponent(appState.currentFeedType)}&page=${appState.currentPage}`;
    const res = await fetch(url);
    const data = await res.json();
    hide('dramaCatalogLoader');

    if (data.success && data.items && data.items.length > 0) {
      renderGrid(data.items);
      if (el('feedCountBadge')) el('feedCountBadge').textContent = `${data.items.length} drama`;
      show('dramaPagination');
      if (el('pageCurrentDisplay')) el('pageCurrentDisplay').textContent = `Halaman ${appState.currentPage}`;
      if (el('btnPrevPage')) el('btnPrevPage').disabled = (appState.currentPage <= 1);
    } else {
      show('dramaEmptyState');
      if (el('feedCountBadge')) el('feedCountBadge').textContent = '0 drama';
    }
  } catch (err) {
    hide('dramaCatalogLoader');
    show('dramaEmptyState');
  }
}

function renderGrid(dramas) {
  const grid = el('dramaGridContainer');
  if (!grid) return;
  grid.innerHTML = '';

  dramas.forEach(d => {
    const card = document.createElement('div');
    card.className = 'drama-card';

    const epBadge = d.episodes > 0 ? `<span class="badge-episodes">${d.episodes} Ep</span>` : '';
    const statusBadge = d.isCompleted ? `<span class="badge-status">Tamat</span>` : '';
    const tagsHtml = (d.tags || []).slice(0, 2).map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('');

    card.innerHTML = `
      <div class="poster-wrap">
        <img src="${escapeHtml(d.cover)}" alt="${escapeHtml(d.title)}" class="poster-img" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'280\\' fill=\\'%2312131a\\'><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23666\\' font-size=\\'14\\' text-anchor=\\'middle\\'>Poster Drama</text></svg>'"/>
        <div class="poster-overlay-gradient"></div>
        ${epBadge}
        ${statusBadge}
        <div class="play-hover-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      <div class="card-content">
        <h4 class="card-title" title="${escapeHtml(d.title)}">${escapeHtml(d.title)}</h4>
        ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
      </div>
    `;

    card.onclick = () => openDrama(appState.currentSource, d.id, d.title);
    grid.appendChild(card);
  });
}

function initSearch() {
  const input = el('headerSearchInput');
  const clearBtn = el('headerSearchClear');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q) show('headerSearchClear');
    else hide('headerSearchClear');

    clearTimeout(appState.searchTimeout);
    appState.searchTimeout = setTimeout(() => {
      if (q) {
        appState.currentQuery = q;
        performSearch(q);
      } else {
        loadFeed();
      }
    }, 400);
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    hide('headerSearchClear');
    appState.currentQuery = '';
    loadFeed();
  });
}

async function performSearch(query) {
  show('dramaCatalogLoader');
  hide('dramaEmptyState');
  hide('dramaPagination');
  const grid = el('dramaGridContainer');
  if (grid) grid.innerHTML = '';
  if (el('feedCountBadge')) el('feedCountBadge').textContent = `Mencari "${query}"...`;

  try {
    const url = `/api/drama/search?source=${encodeURIComponent(appState.currentSource)}&query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    hide('dramaCatalogLoader');

    if (data.success && data.items && data.items.length > 0) {
      renderGrid(data.items);
      if (el('feedCountBadge')) el('feedCountBadge').textContent = `${data.items.length} hasil`;
    } else {
      show('dramaEmptyState');
      if (el('feedCountBadge')) el('feedCountBadge').textContent = '0 hasil';
    }
  } catch (err) {
    hide('dramaCatalogLoader');
    show('dramaEmptyState');
  }
}

function changePage(delta) {
  const newPage = appState.currentPage + delta;
  if (newPage < 1) return;
  appState.currentPage = newPage;
  loadFeed();
}

// ===== 3. CINEMA THEATER & VIDEO PLAYBACK =====

async function openDrama(source, dramaId, fallbackTitle = '') {
  show('theaterModal');
  if (el('theaterDramaTitle')) el('theaterDramaTitle').textContent = fallbackTitle || 'Memuat drama...';
  if (el('theaterSourceBadge')) el('theaterSourceBadge').textContent = source.toUpperCase();
  if (el('theaterEpisodeIndicator')) el('theaterEpisodeIndicator').textContent = 'Memuat...';
  if (el('theaterSynopsisText')) el('theaterSynopsisText').textContent = 'Mengambil sinopsis drama...';
  if (el('theaterEpisodesGrid')) el('theaterEpisodesGrid').innerHTML = '<div style="color:#888;font-size:12px;padding:10px;">Memuat episode...</div>';
  show('videoLoader');

  try {
    const res = await fetch(`/api/drama/detail?source=${encodeURIComponent(source)}&id=${encodeURIComponent(dramaId)}`);
    const data = await res.json();

    if (data.success && data.drama) {
      const d = data.drama;
      appState.activeDrama = d;
      appState.totalEpisodes = d.totalEpisodes || (d.episodes?.length) || 1;
      appState.episodesList = d.episodes || [];

      if (el('theaterDramaTitle')) el('theaterDramaTitle').textContent = d.title;
      if (el('theaterSynopsisText')) el('theaterSynopsisText').textContent = d.synopsis || 'Tidak ada sinopsis tersedia.';
      if (el('theaterEpisodesTotal')) el('theaterEpisodesTotal').textContent = `${appState.totalEpisodes} Ep`;

      const tagsContainer = el('theaterTagsContainer');
      if (tagsContainer) {
        tagsContainer.innerHTML = (d.tags || []).map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('');
      }

      renderEpisodesDrawer();
      playEpisode(source, dramaId, 1);
    }
  } catch (err) {
    hide('videoLoader');
    if (el('theaterSynopsisText')) el('theaterSynopsisText').textContent = 'Gagal memuat detail drama: ' + err.message;
  }
}

function renderEpisodesDrawer() {
  const container = el('theaterEpisodesGrid');
  if (!container) return;
  container.innerHTML = '';

  const total = appState.totalEpisodes || 30;
  for (let i = 1; i <= total; i++) {
    const btn = document.createElement('button');
    btn.className = 'ep-tile-btn' + (i === appState.currentEpisode ? ' active' : '');
    btn.id = `tileEp_${i}`;
    btn.textContent = `Ep ${i}`;
    btn.onclick = () => {
      playEpisode(appState.currentSource, appState.activeDrama?.id, i);
    };
    container.appendChild(btn);
  }
}

async function playEpisode(source, dramaId, epNum) {
  appState.currentEpisode = epNum;
  if (el('theaterEpisodeIndicator')) el('theaterEpisodeIndicator').textContent = `Episode ${epNum}`;

  // Highlight tile
  document.querySelectorAll('.ep-tile-btn').forEach(tile => tile.classList.remove('active'));
  const currentTile = el(`tileEp_${epNum}`);
  if (currentTile) {
    currentTile.classList.add('active');
    currentTile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (el('btnPrevEp')) el('btnPrevEp').disabled = (epNum <= 1);
  if (el('btnNextEp')) el('btnNextEp').disabled = (epNum >= appState.totalEpisodes);

  show('videoLoader');
  hide('bigPlayOverlay');

  try {
    const res = await fetch(`/api/drama/episode?source=${encodeURIComponent(source)}&id=${encodeURIComponent(dramaId)}&ep=${epNum}`);
    const data = await res.json();
    hide('videoLoader');

    if (data.success && data.videoUrl) {
      appState.currentVideoData = data;
      setupVideoPlayer(data);
    } else {
      alert('Gagal memuat stream video episode ' + epNum);
    }
  } catch (err) {
    hide('videoLoader');
    alert('Error episode: ' + err.message);
  }
}

function setupVideoPlayer(data) {
  const video = el('playerVideo');
  if (!video) return;

  let streamUrl = data.videoUrl;

  // Hancurkan instance HLS lama jika ada
  if (appState.hlsPlayer) {
    try { appState.hlsPlayer.destroy(); } catch {}
    appState.hlsPlayer = null;
  }

  // Bersihkan track subtitle lama
  while (video.getElementsByTagName('track').length > 0) {
    video.removeChild(video.getElementsByTagName('track')[0]);
  }

  // Populasi Subtitle Dropdown
  populateSubtitleOptions(data.subtitles || []);

  // Populasi Quality Dropdown
  populateQualityOptions(data.qualities || []);

  const isM3u8 = streamUrl.includes('.m3u8') || streamUrl.includes('/hls');

  if (isM3u8 && window.Hls && Hls.isSupported()) {
    // Route M3U8 melalui stream proxy untuk menghindari CORS block pada CDNs
    const proxiedM3u8Url = streamUrl.startsWith('/api/') 
      ? streamUrl 
      : `/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`;

    const hls = new Hls({
      maxBufferLength: 30,
      enableWorker: true,
      xhrSetup: (xhr, url) => {
        xhr.withCredentials = false;
      }
    });

    appState.hlsPlayer = hls;
    hls.loadSource(proxiedM3u8Url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, (event, manifestData) => {
      hide('videoLoader');
      if (manifestData.levels && manifestData.levels.length > 1) {
        setupHlsQualities(manifestData.levels);
      }
      video.play().catch(() => {
        show('bigPlayOverlay');
      });
    });

    hls.on(Hls.Events.ERROR, (event, errData) => {
      console.warn('HLS Event Error:', errData);
      if (errData.fatal) {
        switch (errData.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            // Fallback native play
            video.src = proxiedM3u8Url;
            video.load();
            video.play().catch(() => show('bigPlayOverlay'));
            break;
        }
      }
    });
  } else {
    // Direct MP4 / Native Video
    // Gunakan proxy jika URL tidak memiliki HTTPS atau rentan CORS
    const playUrl = (streamUrl.startsWith('http://') || streamUrl.includes('dramaboxdb.com') || streamUrl.includes('bytedrama.com') || streamUrl.includes('melolostatic.com'))
      ? `/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`
      : streamUrl;

    video.onerror = () => {
      if (!video.src.includes('/api/stream/proxy')) {
        console.log('Direct MP4 error, switching to proxy...');
        video.src = `/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`;
        video.load();
        video.play().catch(() => show('bigPlayOverlay'));
      }
    };

    video.onloadeddata = () => {
      hide('videoLoader');
    };

    video.src = playUrl;
    video.load();
    video.play().then(() => {
      hide('videoLoader');
      hide('bigPlayOverlay');
    }).catch(() => {
      hide('videoLoader');
      show('bigPlayOverlay');
    });
  }
}

function populateSubtitleOptions(subtitles) {
  const select = el('subtitleSelect');
  if (!select) return;
  select.innerHTML = '<option value="none">Subtitle: Mati</option>';

  if (!subtitles || subtitles.length === 0) {
    select.disabled = true;
    return;
  }

  select.disabled = false;
  let autoSelectedId = null;

  subtitles.forEach((sub, idx) => {
    const opt = document.createElement('option');
    opt.value = sub.url;
    opt.textContent = sub.label || sub.language || `Sub ${idx + 1}`;
    
    // Auto select Indonesia jika tersedia
    const labelLower = (sub.label || sub.language || '').toLowerCase();
    if (labelLower.includes('indo') || labelLower === 'id' || labelLower === 'id-id') {
      opt.selected = true;
      autoSelectedId = sub.url;
    }
    select.appendChild(opt);
  });

  if (autoSelectedId) {
    changeSubtitle(autoSelectedId);
  }
}

function changeSubtitle(subUrl) {
  const video = el('playerVideo');
  if (!video) return;

  // Bersihkan track subtitle
  while (video.getElementsByTagName('track').length > 0) {
    video.removeChild(video.getElementsByTagName('track')[0]);
  }

  if (subUrl === 'none' || !subUrl) return;

  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = 'Selected';
  track.srclang = 'id';
  track.default = true;

  // Subtitle proxied through our SRT -> VTT converter
  track.src = `/api/stream/subtitle?url=${encodeURIComponent(subUrl)}`;
  video.appendChild(track);

  // Aktifkan text track
  setTimeout(() => {
    if (video.textTracks && video.textTracks.length > 0) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = 'showing';
      }
    }
  }, 300);
}

function populateQualityOptions(qualities) {
  const select = el('qualitySelect');
  if (!select) return;
  select.innerHTML = '<option value="auto">Auto HD</option>';

  if (qualities && qualities.length > 0) {
    qualities.forEach(q => {
      const opt = document.createElement('option');
      opt.value = q.url;
      opt.textContent = q.label;
      if (q.isDefault) opt.selected = true;
      select.appendChild(opt);
    });
  }
}

function setupHlsQualities(levels) {
  const select = el('qualitySelect');
  if (!select) return;
  select.innerHTML = '<option value="-1">Auto HD</option>';

  levels.forEach((lvl, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${lvl.height || lvl.name || 'Level'}p`;
    select.appendChild(opt);
  });
}

function changeQuality(val) {
  if (appState.hlsPlayer) {
    if (val === 'auto' || val === '-1') {
      appState.hlsPlayer.currentLevel = -1;
    } else if (!isNaN(parseInt(val))) {
      appState.hlsPlayer.currentLevel = parseInt(val);
    }
  } else if (val !== 'auto' && val.startsWith('http')) {
    const video = el('playerVideo');
    const curTime = video ? video.currentTime : 0;
    setupVideoPlayer({ ...appState.currentVideoData, videoUrl: val });
    if (video) video.currentTime = curTime;
  }
}

function initPlayerEventListeners() {
  const video = el('playerVideo');
  if (!video) return;

  video.addEventListener('play', () => {
    hide('bigPlayOverlay');
    const playBtn = el('btnPlay');
    if (playBtn) playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  });

  video.addEventListener('pause', () => {
    show('bigPlayOverlay');
    const playBtn = el('btnPlay');
    if (playBtn) playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  });

  video.addEventListener('timeupdate', () => {
    const cur = video.currentTime || 0;
    const dur = video.duration || 0;
    if (el('timeCurrent')) el('timeCurrent').textContent = formatTime(cur);
    if (el('timeDuration')) el('timeDuration').textContent = formatTime(dur);
    if (dur > 0 && el('videoSeekBar')) {
      el('videoSeekBar').value = (cur / dur) * 1000;
    }
  });

  // Auto-next saat video selesai
  video.addEventListener('ended', () => {
    const isAutoNext = el('chkAutoNext')?.checked;
    if (isAutoNext && appState.currentEpisode < appState.totalEpisodes) {
      navigateEpisode(1);
    }
  });

  el('videoSeekBar')?.addEventListener('input', (e) => {
    const dur = video.duration || 0;
    if (dur > 0) {
      video.currentTime = (e.target.value / 1000) * dur;
    }
  });

  el('volSlider')?.addEventListener('input', (e) => {
    video.volume = e.target.value / 100;
    video.muted = false;
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (el('theaterModal')?.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
    } else if (e.code === 'ArrowLeft') {
      video.currentTime = Math.max(0, video.currentTime - 5);
    } else if (e.code === 'KeyF') {
      toggleFullscreen();
    } else if (e.code === 'KeyM') {
      toggleMute();
    } else if (e.code === 'Escape') {
      closeTheater();
    }
  });
}

function togglePlay() {
  const video = el('playerVideo');
  if (!video) return;
  if (video.paused) video.play();
  else video.pause();
}

function toggleMute() {
  const video = el('playerVideo');
  if (!video) return;
  video.muted = !video.muted;
  const btn = el('btnMute');
  if (btn) {
    btn.innerHTML = video.muted
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>';
  }
}

function changeSpeed(rate) {
  const video = el('playerVideo');
  if (video) video.playbackRate = parseFloat(rate);
}

function toggleFullscreen() {
  const container = el('videoContainer');
  if (!container) return;
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function navigateEpisode(delta) {
  const next = appState.currentEpisode + delta;
  if (next >= 1 && next <= appState.totalEpisodes) {
    playEpisode(appState.currentSource, appState.activeDrama?.id, next);
  }
}

function closeTheater() {
  const video = el('playerVideo');
  if (video) {
    video.pause();
    video.src = '';
  }
  if (appState.hlsPlayer) {
    try { appState.hlsPlayer.destroy(); } catch {}
    appState.hlsPlayer = null;
  }
  hide('theaterModal');
}

// Start
document.addEventListener('DOMContentLoaded', initApp);
