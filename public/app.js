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
  activeSubTrack: null,
  isLoadingMore: false,
  hasMorePages: true,
  loadedDramaIds: new Set(),
  totalLoadedItems: 0
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

function getFallbackPosterSvg(title = 'Drama') {
  const safeTitle = escapeHtml(String(title).slice(0, 20));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#18181b"/>
        <stop offset="50%" stop-color="#121215"/>
        <stop offset="100%" stop-color="#09090b"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="150" cy="160" r="50" fill="#facc15" fill-opacity="0.12"/>
    <text x="150" y="176" font-size="42" text-anchor="middle">🎬</text>
    <text x="150" y="250" fill="#facc15" font-size="13" font-weight="900" font-family="system-ui, sans-serif" text-anchor="middle" letter-spacing="1.5">DRACINHUB</text>
    <text x="150" y="278" fill="#a1a1aa" font-size="12" font-weight="700" font-family="system-ui, sans-serif" text-anchor="middle">${safeTitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const STORAGE_KEY_HISTORY = 'dracin_watch_history_v1';
let lastProgressSaveTime = 0;

const clientMemoryCache = new Map();

async function fetchWithClientCache(url, ttlMs = 15 * 60 * 1000) {
  // 1. Cek in-memory RAM cache
  const mem = clientMemoryCache.get(url);
  if (mem && Date.now() - mem.timestamp < ttlMs) {
    if (!url.includes('/episode') || (mem.data && mem.data.videoUrl)) {
      return mem.data;
    }
  }

  // 2. Cek sessionStorage browser
  try {
    const raw = sessionStorage.getItem('dracin_cache_' + url);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Date.now() - parsed.timestamp < ttlMs) {
        if (!url.includes('/episode') || (parsed.data && parsed.data.videoUrl)) {
          clientMemoryCache.set(url, parsed);
          return parsed.data;
        }
      }
    }
  } catch (e) {}

  // 3. Ambil dari server
  const res = await fetch(url);
  const data = await res.json();

  if (data && data.success !== false) {
    // Jangan cache jika episode tidak memiliki videoUrl
    if (!url.includes('/episode') || Boolean(data.videoUrl)) {
      const cacheObj = { timestamp: Date.now(), data };
      clientMemoryCache.set(url, cacheObj);
      try {
        sessionStorage.setItem('dracin_cache_' + url, JSON.stringify(cacheObj));
      } catch (e) {}
    }
  }

  return data;
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

function getWatchHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveWatchProgress(drama, episode, currentTime = 0, duration = 0) {
  if (!drama || !drama.id) return;
  try {
    let history = getWatchHistory();
    const progress = (duration > 0) ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;
    const currentSrc = drama.source || appState.currentSource || 'dramawave';
    const dramaTitle = drama.title && drama.title !== 'Short Drama' && drama.title !== 'Drama'
      ? drama.title
      : (appState.activeDrama?.title || el('theaterDramaTitle')?.textContent || 'Short Drama');

    // Filter existing item
    history = history.filter(item => !(item.id === drama.id));

    const entry = {
      id: drama.id,
      source: currentSrc,
      title: dramaTitle,
      cover: drama.cover || appState.activeDrama?.cover || '',
      lastEpisode: Number(episode || 1),
      totalEpisodes: Number(drama.totalEpisodes || appState.totalEpisodes || 1),
      currentTime: Math.floor(currentTime || 0),
      duration: Math.floor(duration || 0),
      progress: progress,
      lastWatched: Date.now()
    };

    // Add to beginning (most recent)
    history.unshift(entry);

    // Keep max 50 items
    if (history.length > 50) history = history.slice(0, 50);

    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));

    // Update Continue Watching Banner if on home
    renderContinueWatchingBanner();
  } catch (e) {}
}

function removeFromHistory(dramaId, source, e) {
  if (e) e.stopPropagation();
  try {
    let history = getWatchHistory();
    history = history.filter(item => !(item.id === dramaId && item.source === source));
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));

    if (appState.currentFeedType === 'history') {
      renderHistoryFeed();
    }
    renderContinueWatchingBanner();
  } catch (e) {}
}

function clearAllHistory() {
  if (confirm('Apakah Anda yakin ingin menghapus semua riwayat tontonan?')) {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    if (appState.currentFeedType === 'history') {
      renderHistoryFeed();
    }
    renderContinueWatchingBanner();
  }
}

function renderContinueWatchingBanner() {
  const container = el('continueWatchingSection');
  const card = el('continueWatchingCard');
  if (!container || !card) return;

  const history = getWatchHistory();
  if (history.length === 0 || appState.currentFeedType === 'history') {
    hide('continueWatchingSection');
    return;
  }

  const latest = history[0];
  show('continueWatchingSection');

  card.innerHTML = `
    <div class="cw-left">
      <img src="${escapeHtml(latest.cover)}" alt="${escapeHtml(latest.title)}" class="cw-poster" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'54\\' height=\\'72\\' fill=\\'%2312131a\\'></svg>'"/>
      <div class="cw-info">
        <div class="cw-tag-row">
          <span class="cw-label">Lanjutkan Menonton</span>
          <span class="cw-source-badge">${escapeHtml((latest.source || 'drama').toUpperCase())}</span>
        </div>
        <h4 class="cw-title" title="${escapeHtml(latest.title)}">${escapeHtml(latest.title)}</h4>
        <div class="cw-progress-wrap">
          <div class="cw-progress-track">
            <div class="cw-progress-fill" style="width: ${latest.progress || 10}%"></div>
          </div>
          <span class="cw-ep-text">Episode ${latest.lastEpisode} / ${latest.totalEpisodes} (${latest.progress || 0}%)</span>
        </div>
      </div>
    </div>
    <div class="cw-right">
      <button class="cw-play-btn" onclick="openDrama('${escapeHtml(latest.source)}', '${escapeHtml(latest.id)}', '${escapeHtml(latest.title)}', ${latest.lastEpisode})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>Lanjut Ep ${latest.lastEpisode}</span>
      </button>
    </div>
  `;
}

// ===== 1. INITIALIZATION & SOURCES =====

async function initApp() {
  // Purge any stale client session cache
  try {
    sessionStorage.clear();
    clientMemoryCache.clear();
    const savedSource = localStorage.getItem('dracin_last_selected_source');
    if (savedSource) appState.currentSource = savedSource;
  } catch (e) {}

  await loadSources();
  await loadFeed();
  renderContinueWatchingBanner();
  initSearch();
  initInfiniteScroll();
  initSourcesDrag();
  initPlayerEventListeners();

  // Handle URL deep-link (e.g. ?source=dramawave&id=QCJvQG2LLD&ep=26)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const pSrc = urlParams.get('source');
    const pId = urlParams.get('id');
    const pEp = urlParams.get('ep');
    if (pId) {
      setTimeout(() => {
        openDrama(pSrc || 'dramawave', pId, 'Memuat Drama...', pEp ? Number(pEp) : 1);
      }, 400);
    }
  } catch (e) {}
}

async function loadSources() {
  const container = el('sourcesPillsBar');
  if (!container) return;

  try {
    const res = await fetch(`/api/drama/sources?_v=${Date.now()}`);
    const data = await res.json();
    if (data.success && data.sources && Array.isArray(data.sources)) {
      appState.sources = data.sources;
      renderSourcesPills();
    }
  } catch (err) {
    // Fallback default list
    appState.sources = [
      { key: 'dramawave', name: 'DramaWave', badge: 'HD & Subtitle', desc: 'Direct M3U8 streaming dengan 20+ subtitle multi-bahasa' },
      { key: 'freereels', name: 'FreeReels', badge: 'Gratis & Sub', desc: 'Direct stream cepat dengan subtitle Indonesia' },
      { key: 'netshort', name: 'NetShort', badge: 'Direct MP4', desc: 'Kualitas original MP4 dengan subtitle Indonesia' },
      { key: 'dramabox', name: 'DramaBox', badge: 'Popular', desc: 'Provider drama box nomor 1 di Asia' },
      { key: 'shortmax', name: 'ShortMax', badge: 'Trending', desc: 'Katalog ribuan drama pendek bertema CEO & Reinkarnasi' },
      { key: 'melolo', name: 'Melolo', badge: 'Multi-Bitrate', desc: 'Pilihan resolusi 720p, 540p, 360p' },
      { key: 'dramanova', name: 'DramaNova', badge: 'Romance / 18+', desc: 'Drama romantis & dewasa' },
      { key: 'reelshort', name: 'ReelShort', badge: 'Hot', desc: 'Drama pendek billionaire & werewolf viral' },
      { key: 'goodshort', name: 'GoodShort', badge: 'Recom', desc: 'Drama pilihan terfavorit penonton' },
      { key: 'flickreels', name: 'FlickReels', badge: 'Top Rank', desc: 'Serial drama rating tinggi' },
      { key: 'idrama', name: 'iDrama', badge: 'Viral', desc: 'Koleksi drama pendek Asia terpopuler' },
      { key: 'dramabite', name: 'DramaBite', badge: 'Fresh', desc: 'Update drama baru setiap hari' },
      { key: 'moboreels', name: 'MoboReels', badge: 'Trending', desc: 'Drama pendek pilihan trending penonton' }
    ];
    renderSourcesPills();
  }
}

function getProviderBrandLogo(src) {
  const logoPath = `/assets/logos/${src.key}.svg`;
  return `<img src="${logoPath}" alt="${escapeHtml(src.name)}" class="source-logo-img"/>`;
}

function renderSourcesPills() {
  const container = el('sourcesPillsBar');
  if (!container) return;
  container.innerHTML = '';

  const totalCount = appState.sources.length;
  if (el('liveSourcesCount')) el('liveSourcesCount').textContent = `${totalCount} Sources Ready`;
  if (el('heroProvidersCount')) el('heroProvidersCount').textContent = `${totalCount}`;

  appState.sources.forEach(src => {
    const btn = document.createElement('button');
    btn.className = 'source-btn' + (src.key === appState.currentSource ? ' active' : '');
    btn.dataset.source = src.key;
    const logoHtml = getProviderBrandLogo(src);
    btn.innerHTML = `
      ${logoHtml}
      <span class="source-name-text">${escapeHtml(src.name)}</span>
      ${src.badge ? `<span class="source-badge">${escapeHtml(src.badge)}</span>` : ''}
    `;
    btn.onclick = () => selectSource(src.key, src.name, src.desc);
    container.appendChild(btn);
  });
}

function scrollSources(direction) {
  const container = el('sourcesPillsBar');
  if (!container) return;
  const scrollAmount = 260 * direction;
  container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
}

function initSourcesDrag() {
  const slider = el('sourcesPillsBar');
  if (!slider) return;

  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener('mousedown', (e) => {
    isDown = true;
    slider.classList.add('dragging');
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });

  slider.addEventListener('mouseleave', () => {
    isDown = false;
    slider.classList.remove('dragging');
  });

  slider.addEventListener('mouseup', () => {
    isDown = false;
    slider.classList.remove('dragging');
  });

  slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    slider.scrollLeft = scrollLeft - walk;
  });

  // Mouse wheel horizontal scroll support
  slider.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      slider.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

function selectSource(sourceKey, sourceName, sourceDesc = '') {
  appState.currentSource = sourceKey;
  try { localStorage.setItem('dracin_last_selected_source', sourceKey); } catch {}

  appState.currentPage = 1;
  appState.currentQuery = '';
  
  if (el('headerSearchInput')) el('headerSearchInput').value = '';
  hide('headerSearchClear');

  if (el('sourceDesc')) el('sourceDesc').textContent = sourceDesc || 'Streaming drama pilihan';

  document.querySelectorAll('.source-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.source === sourceKey || b.textContent.includes(sourceName));
  });

  if (appState.currentFeedType === 'history') {
    setFeedType('trending');
  } else {
    loadFeed();
  }
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
    recommended: '💎 Rekomendasi Pilihan',
    history: '🕒 Riwayat Tontonan Anda'
  };
  if (el('currentFeedTitle')) el('currentFeedTitle').textContent = titles[type] || type;

  if (type === 'history') {
    show('btnClearHistory');
    hide('continueWatchingSection');
    renderHistoryFeed();
  } else {
    hide('btnClearHistory');
    renderContinueWatchingBanner();
    loadFeed();
  }
}

function renderHistoryFeed() {
  hide('dramaCatalogLoader');
  hide('dramaPagination');
  const grid = el('dramaGridContainer');
  if (!grid) return;
  grid.innerHTML = '';

  const history = getWatchHistory();

  if (history.length === 0) {
    show('dramaEmptyState');
    if (el('dramaEmptyState')) {
      el('dramaEmptyState').innerHTML = `
        <div class="empty-emoji">🕒</div>
        <h3>Belum Ada Riwayat Tontonan</h3>
        <p>Drama yang Anda tonton akan otomatis tersimpan di sini agar mudah dilanjutkan kapan saja.</p>
      `;
    }
    if (el('feedCountBadge')) el('feedCountBadge').textContent = '0 drama';
    return;
  }

  hide('dramaEmptyState');
  if (el('feedCountBadge')) el('feedCountBadge').textContent = `${history.length} drama`;

  history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'drama-card history-card';

    const fallbackCover = getFallbackPosterSvg(item.title);
    const posterSrc = item.cover || fallbackCover;

    card.innerHTML = `
      <div class="poster-wrap">
        <img src="${escapeHtml(posterSrc)}" alt="${escapeHtml(item.title)}" class="poster-img" loading="lazy" onerror="this.onerror=null; this.src='${fallbackCover}'"/>
        <div class="poster-overlay-gradient"></div>
        <span class="badge-episodes">Ep ${item.lastEpisode} / ${item.totalEpisodes}</span>
        <button class="card-history-del-btn" onclick="removeFromHistory('${escapeHtml(item.id)}', '${escapeHtml(item.source)}', event)" title="Hapus dari riwayat">✕</button>
        <div class="card-history-progress-bar">
          <div class="card-history-progress-fill" style="width: ${item.progress || 5}%"></div>
        </div>
        <div class="play-hover-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      <div class="card-content">
        <h4 class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h4>
        <div class="card-tags">
          <span class="card-tag">${escapeHtml(item.source.toUpperCase())}</span>
          <span class="card-tag" style="color:var(--accent-mint)">Lanjut: Ep ${item.lastEpisode}</span>
        </div>
      </div>
    `;

    card.onclick = () => openDrama(item.source, item.id, item.title, item.lastEpisode);
    grid.appendChild(card);
  });
}

// ===== 2. FEED & CATALOG (WITH INFINITE SCROLL) =====

async function loadFeed(isAppend = false) {
  if (appState.currentFeedType === 'history') {
    renderHistoryFeed();
    return;
  }

  if (isAppend) {
    if (appState.isLoadingMore || !appState.hasMorePages) return;
    appState.isLoadingMore = true;
    show('infiniteScrollLoader');
    hide('infiniteScrollEnded');
  } else {
    appState.currentPage = 1;
    appState.hasMorePages = true;
    appState.loadedDramaIds = new Set();
    appState.totalLoadedItems = 0;
    show('dramaCatalogLoader');
    hide('dramaEmptyState');
    hide('infiniteScrollLoader');
    hide('infiniteScrollEnded');
    const grid = el('dramaGridContainer');
    if (grid) grid.innerHTML = '';
    if (el('feedCountBadge')) el('feedCountBadge').textContent = 'Memuat...';
  }

  try {
    const url = `/api/drama/feed?source=${encodeURIComponent(appState.currentSource)}&type=${encodeURIComponent(appState.currentFeedType)}&page=${appState.currentPage}`;
    const data = await fetchWithClientCache(url, 10 * 60 * 1000);
    
    hide('dramaCatalogLoader');
    hide('infiniteScrollLoader');
    appState.isLoadingMore = false;

    if (data.success && data.items && data.items.length > 0) {
      // Filter duplicate items
      const newItems = data.items.filter(item => {
        if (!item || !item.id) return false;
        if (appState.loadedDramaIds.has(item.id)) return false;
        appState.loadedDramaIds.add(item.id);
        return true;
      });

      if (newItems.length > 0) {
        appendGrid(newItems);
        appState.totalLoadedItems += newItems.length;
        if (el('feedCountBadge')) el('feedCountBadge').textContent = `${appState.totalLoadedItems} drama dimuat`;

        // Jika item baru yang dimuat kurang dari 6, kemungkinan halaman terakhir
        if (data.items.length < 6) {
          appState.hasMorePages = false;
          if (appState.currentPage > 1 || appState.totalLoadedItems > 6) {
            show('infiniteScrollEnded');
          }
        }
      } else {
        // Semua item halaman ini sudah pernah dimuat
        appState.hasMorePages = false;
        if (appState.currentPage > 1) {
          show('infiniteScrollEnded');
        }
      }
    } else {
      appState.hasMorePages = false;
      if (!isAppend) {
        show('dramaEmptyState');
        if (el('feedCountBadge')) el('feedCountBadge').textContent = '0 drama';
      } else {
        show('infiniteScrollEnded');
      }
    }
  } catch (err) {
    hide('dramaCatalogLoader');
    hide('infiniteScrollLoader');
    appState.isLoadingMore = false;
    if (!isAppend) {
      show('dramaEmptyState');
    }
  }
}

function renderGrid(dramas) {
  const grid = el('dramaGridContainer');
  if (!grid) return;
  grid.innerHTML = '';
  appendGrid(dramas);
}

function appendGrid(dramas) {
  const grid = el('dramaGridContainer');
  if (!grid) return;

  dramas.forEach(d => {
    const card = document.createElement('div');
    card.className = 'drama-card';

    const epBadge = d.episodes > 0 ? `<span class="badge-episodes">${d.episodes} Ep</span>` : '';
    const statusBadge = d.isCompleted ? `<span class="badge-status">Tamat</span>` : '';
    const tagsHtml = (d.tags || []).slice(0, 2).map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('');
    const sourceBadge = d.source ? `<span class="card-tag" style="background:rgba(250,204,21,0.15);color:var(--primary);">${escapeHtml(d.source.toUpperCase())}</span>` : '';

    const fallbackCover = getFallbackPosterSvg(d.title);
    const posterSrc = d.cover || fallbackCover;

    card.innerHTML = `
      <div class="poster-wrap">
        <img src="${escapeHtml(posterSrc)}" alt="${escapeHtml(d.title)}" class="poster-img" loading="lazy" onerror="this.onerror=null; this.src='${fallbackCover}'"/>
        <div class="poster-overlay-gradient"></div>
        ${epBadge}
        ${statusBadge}
        <div class="play-hover-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
      <div class="card-content">
        <h4 class="card-title" title="${escapeHtml(d.title)}">${escapeHtml(d.title)}</h4>
        <div class="card-tags">
          ${sourceBadge}
          ${tagsHtml}
        </div>
      </div>
    `;

    const actualSrc = d.source || appState.currentSource;
    card.onclick = () => openDrama(actualSrc, d.id, d.title);
    grid.appendChild(card);
  });
}

function initInfiniteScroll() {
  if ('IntersectionObserver' in window) {
    const sentinel = el('infiniteScrollSentinel');
    if (sentinel) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !appState.isLoadingMore && appState.hasMorePages && !appState.currentQuery && appState.currentFeedType !== 'history') {
          appState.currentPage++;
          loadFeed(true);
        }
      }, { rootMargin: '500px' });
      observer.observe(sentinel);
    }
  }

  // Window scroll fallback
  window.addEventListener('scroll', () => {
    if (appState.isLoadingMore || !appState.hasMorePages || appState.currentQuery || appState.currentFeedType === 'history') return;
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 600;
    if (scrollPosition >= threshold) {
      appState.currentPage++;
      loadFeed(true);
    }
  }, { passive: true });
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
        appState.currentQuery = '';
        loadFeed();
      }
    }, 350);
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
  hide('infiniteScrollLoader');
  hide('infiniteScrollEnded');
  const grid = el('dramaGridContainer');
  if (grid) grid.innerHTML = '';
  if (el('feedCountBadge')) el('feedCountBadge').textContent = `Mencari "${query}"...`;

  try {
    const url = `/api/drama/search?source=${encodeURIComponent(appState.currentSource)}&query=${encodeURIComponent(query)}`;
    const data = await fetchWithClientCache(url, 5 * 60 * 1000);
    hide('dramaCatalogLoader');

    if (data.success && data.items && data.items.length > 0) {
      renderGrid(data.items);
      if (el('feedCountBadge')) el('feedCountBadge').textContent = `${data.items.length} drama ditemukan`;
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

let playbackSessionId = 0;

async function openDrama(source, dramaId, fallbackTitle = '', startEpisode = null) {
  source = resolveActualSource(dramaId, source);
  const currentSession = ++playbackSessionId;
  show('theaterModal');
  hide('fullscreenEpDrawer');

  // Sinkronkan active source ke provider drama yang dipilih
  if (source) {
    appState.currentSource = source;
    try { localStorage.setItem('dracin_last_selected_source', source); } catch {}
    document.querySelectorAll('.source-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.source === source || b.textContent.toLowerCase().includes(source.toLowerCase()));
    });
  }

  // Cek riwayat tontonan jika startEpisode tidak ditentukan
  let resumeEp = startEpisode;
  if (!resumeEp) {
    const history = getWatchHistory();
    const existing = history.find(item => item.id === dramaId);
    if (existing && existing.lastEpisode) {
      resumeEp = existing.lastEpisode;
    }
  }
  const initialEp = resumeEp || 1;

  // Hentikan video dan stream sebelumnya secara tuntas
  const video = el('playerVideo');
  if (video) {
    try { video.pause(); } catch {}
    video.removeAttribute('src');
    video.load();
  }

  if (appState.hlsPlayer) {
    try {
      appState.hlsPlayer.stopLoad();
      appState.hlsPlayer.detachMedia();
      appState.hlsPlayer.destroy();
    } catch {}
    appState.hlsPlayer = null;
  }

  // Populate placeholder state
  if (el('theaterDramaTitle')) el('theaterDramaTitle').textContent = fallbackTitle || 'Memuat drama...';
  if (el('fsDramaTitle')) el('fsDramaTitle').textContent = fallbackTitle || 'Memuat drama...';
  if (el('theaterSourceBadge')) el('theaterSourceBadge').textContent = source.toUpperCase();
  if (el('fsSourceBadge')) el('fsSourceBadge').textContent = source.toUpperCase();
  if (el('theaterEpisodeIndicator')) el('theaterEpisodeIndicator').textContent = `Episode ${initialEp}`;
  if (el('fsEpCurrent')) el('fsEpCurrent').textContent = `Ep ${initialEp}`;
  if (el('theaterSynopsisText')) el('theaterSynopsisText').textContent = 'Mengambil sinopsis drama...';
  if (el('theaterEpisodesGrid')) el('theaterEpisodesGrid').innerHTML = '<div style="color:#888;font-size:12px;padding:10px;">Memuat episode...</div>';
  if (el('fsEpisodesGrid')) el('fsEpisodesGrid').innerHTML = '<div style="color:#888;font-size:12px;padding:10px;">Memuat episode...</div>';
  show('videoLoader');

  try {
    const data = await fetchWithClientCache(`/api/drama/detail?source=${encodeURIComponent(source)}&id=${encodeURIComponent(dramaId)}`, 30 * 60 * 1000);

    // Jika user sudah ganti drama atau menutup modal, batalkan eksekusi
    if (currentSession !== playbackSessionId) return;

    if (data.success && data.drama) {
      const d = data.drama;
      d.source = source;
      appState.activeDrama = d;
      appState.totalEpisodes = d.totalEpisodes || (d.episodes?.length) || 1;
      appState.episodesList = d.episodes || [];

      if (el('theaterDramaTitle')) el('theaterDramaTitle').textContent = d.title;
      if (el('fsDramaTitle')) el('fsDramaTitle').textContent = d.title;
      if (el('theaterSynopsisText')) el('theaterSynopsisText').textContent = d.synopsis || 'Tidak ada sinopsis tersedia.';
      if (el('theaterEpisodesTotal')) el('theaterEpisodesTotal').textContent = `${appState.totalEpisodes} Ep`;
      if (el('fsEpisodesTotal')) el('fsEpisodesTotal').textContent = `${appState.totalEpisodes}`;

      const tagsContainer = el('theaterTagsContainer');
      if (tagsContainer) {
        tagsContainer.innerHTML = (d.tags || []).map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('');
      }

      renderEpisodesDrawer();
      playEpisode(source, dramaId, initialEp, currentSession);
    }
  } catch (err) {
    if (currentSession !== playbackSessionId) return;
    hide('videoLoader');
    if (el('theaterSynopsisText')) el('theaterSynopsisText').textContent = 'Gagal memuat detail drama: ' + err.message;
  }
}

function renderEpisodesDrawer() {
  const container = el('theaterEpisodesGrid');
  const fsContainer = el('fsEpisodesGrid');
  if (container) container.innerHTML = '';
  if (fsContainer) fsContainer.innerHTML = '';

  const total = appState.totalEpisodes || 30;
  for (let i = 1; i <= total; i++) {
    // Regular Drawer Tile
    if (container) {
      const btn = document.createElement('button');
      btn.className = 'ep-tile-btn' + (i === appState.currentEpisode ? ' active' : '');
      btn.id = `tileEp_${i}`;
      btn.textContent = `Ep ${i}`;
      btn.onclick = (e) => {
        e.stopPropagation();
        playEpisode(appState.currentSource, appState.activeDrama?.id, i);
      };
      container.appendChild(btn);
    }

    // Fullscreen In-Video Drawer Tile
    if (fsContainer) {
      const fsBtn = document.createElement('button');
      fsBtn.className = 'ep-tile-btn' + (i === appState.currentEpisode ? ' active' : '');
      fsBtn.id = `fsTileEp_${i}`;
      fsBtn.textContent = `Ep ${i}`;
      fsBtn.onclick = (e) => {
        e.stopPropagation();
        playEpisode(appState.currentSource, appState.activeDrama?.id, i);
        hide('fullscreenEpDrawer');
      };
      fsContainer.appendChild(fsBtn);
    }
  }
}

async function playEpisode(source, dramaId, epNum, sessionId = null) {
  const currentSession = sessionId || playbackSessionId;
  appState.currentEpisode = epNum;
  
  if (el('theaterEpisodeIndicator')) el('theaterEpisodeIndicator').textContent = `Episode ${epNum}`;
  if (el('fsEpCurrent')) el('fsEpCurrent').textContent = `Ep ${epNum}`;

  // Highlight tile di kedua drawer
  document.querySelectorAll('.ep-tile-btn').forEach(tile => tile.classList.remove('active'));
  
  const currentTile = el(`tileEp_${epNum}`);
  if (currentTile) {
    currentTile.classList.add('active');
    currentTile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const currentFsTile = el(`fsTileEp_${epNum}`);
  if (currentFsTile) {
    currentFsTile.classList.add('active');
    currentFsTile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (el('btnPrevEp')) el('btnPrevEp').disabled = (epNum <= 1);
  if (el('btnNextEp')) el('btnNextEp').disabled = (epNum >= appState.totalEpisodes);

  show('videoLoader');
  hide('bigPlayOverlay');

  // Bersihkan player sebelumnya sebelum memuat episode baru
  if (appState.hlsPlayer) {
    try {
      appState.hlsPlayer.stopLoad();
      appState.hlsPlayer.detachMedia();
      appState.hlsPlayer.destroy();
    } catch {}
    appState.hlsPlayer = null;
  }

  const video = el('playerVideo');
  if (video) {
    try { video.pause(); } catch {}
    video.removeAttribute('src');
    video.load();
  }

  // Catat ke riwayat tontonan
  if (appState.activeDrama) {
    saveWatchProgress(appState.activeDrama, epNum, 0, 0);
  }

  try {
    const url = `/api/drama/episode?source=${encodeURIComponent(source)}&id=${encodeURIComponent(dramaId)}&ep=${epNum}&_v=${Date.now()}`;
    const res = await fetch(url);
    const data = await res.json();

    if (currentSession !== playbackSessionId) return; // Discard jika sudah berpindah drama / ditutup
    hide('videoLoader');

    if (data.success && data.videoUrl) {
      appState.currentVideoData = data;
      setupVideoPlayer(data, currentSession);
    } else {
      alert('Gagal memuat stream video episode ' + epNum);
    }
  } catch (err) {
    if (currentSession !== playbackSessionId) return;
    hide('videoLoader');
    alert('Error episode: ' + err.message);
  }
}

function setupVideoPlayer(data, sessionId) {
  const video = el('playerVideo');
  if (!video || sessionId !== playbackSessionId) return;

  let streamUrl = data.videoUrl;

  // Hancurkan instance HLS lama jika ada
  if (appState.hlsPlayer) {
    try {
      appState.hlsPlayer.stopLoad();
      appState.hlsPlayer.detachMedia();
      appState.hlsPlayer.destroy();
    } catch {}
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
    const proxiedM3u8Url = streamUrl.startsWith('/api/') 
      ? streamUrl 
      : `/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`;

    const hls = new Hls({
      maxBufferLength: 15,
      maxMaxBufferLength: 30,
      maxBufferSize: 30 * 1000 * 1000,
      maxBufferHole: 0.5,
      lowLatencyMode: true,
      backBufferLength: 10, // Bersihkan segmen lama di RAM agar tidak lag / buffering bertumpuk
      enableWorker: true,
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      }
    });

    appState.hlsPlayer = hls;
    hls.loadSource(proxiedM3u8Url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, (event, manifestData) => {
      if (sessionId !== playbackSessionId) return;
      hide('videoLoader');
      if (manifestData.levels && manifestData.levels.length > 1) {
        setupHlsQualities(manifestData.levels);
      }
      video.muted = false;
      video.volume = 1;
      video.play().catch(() => {
        show('bigPlayOverlay');
      });
    });

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (event, audioData) => {
      if (sessionId !== playbackSessionId) return;
      if (audioData.audioTracks && audioData.audioTracks.length > 0) {
        const indoIdx = audioData.audioTracks.findIndex(t => 
          (t.name || t.lang || '').toLowerCase().includes('id') || 
          (t.name || t.lang || '').toLowerCase().includes('indo')
        );
        hls.audioTrack = (indoIdx !== -1) ? indoIdx : 0;
      }
      video.muted = false;
      video.volume = 1;
    });

    hls.on(Hls.Events.AUDIO_TRACK_LOADED, () => {
      if (sessionId !== playbackSessionId) return;
      video.muted = false;
      video.volume = 1;
    });

    hls.on(Hls.Events.ERROR, (event, errData) => {
      if (sessionId !== playbackSessionId) return;
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
            video.src = proxiedM3u8Url;
            video.load();
            video.play().catch(() => show('bigPlayOverlay'));
            break;
        }
      }
    });
  } else {
    // Direct MP4 / Native Video
    const shouldProxy = (
      streamUrl.startsWith('http://') ||
      streamUrl.includes('dramahue.com') ||
      streamUrl.includes('dramaboxdb.com') ||
      streamUrl.includes('bytedrama.com') ||
      streamUrl.includes('melolostatic.com') ||
      streamUrl.includes('goodreels.com') ||
      streamUrl.includes('shorttv.live') ||
      streamUrl.includes('crazymaplestudios.com') ||
      streamUrl.includes('kwcdn.com') ||
      streamUrl.includes('kjcdn.com') ||
      streamUrl.includes('alicdn.com') ||
      streamUrl.includes('txmfvideo')
    );

    const playUrl = shouldProxy
      ? `/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`
      : streamUrl;

    video.onerror = () => {
      if (sessionId !== playbackSessionId) return;
      if (!video.src.includes('/api/stream/proxy')) {
        video.src = `/api/stream/proxy?url=${encodeURIComponent(streamUrl)}`;
        video.load();
        video.play().catch(() => show('bigPlayOverlay'));
      }
    };

    video.onloadeddata = () => {
      if (sessionId !== playbackSessionId) return;
      hide('videoLoader');
    };

    video.muted = false;
    video.volume = 1;
    video.src = playUrl;
    video.load();
    video.play().then(() => {
      if (sessionId !== playbackSessionId) return;
      video.muted = false;
      hide('videoLoader');
      hide('bigPlayOverlay');
    }).catch(() => {
      if (sessionId !== playbackSessionId) return;
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
    setupVideoPlayer({ ...appState.currentVideoData, videoUrl: val }, playbackSessionId);
    if (video) video.currentTime = curTime;
  }
}

let controlsHideTimeout = null;

function showControls(autoHideDelay = 4000) {
  const container = el('videoContainer');
  const video = el('playerVideo');
  if (!container) return;

  container.classList.remove('controls-hidden');

  if (controlsHideTimeout) {
    clearTimeout(controlsHideTimeout);
    controlsHideTimeout = null;
  }

  // Sembunyikan kontrol otomatis setelah delay jika video sedang playing
  if (video && !video.paused && !video.ended && autoHideDelay > 0) {
    controlsHideTimeout = setTimeout(() => {
      const drawer = el('fullscreenEpDrawer');
      if (drawer && !drawer.classList.contains('hidden')) return;
      container.classList.add('controls-hidden');
    }, autoHideDelay);
  }
}

function hideControls() {
  const container = el('videoContainer');
  if (!container) return;
  const drawer = el('fullscreenEpDrawer');
  if (drawer && !drawer.classList.contains('hidden')) return;
  container.classList.add('controls-hidden');
  if (controlsHideTimeout) {
    clearTimeout(controlsHideTimeout);
    controlsHideTimeout = null;
  }
}

function toggleControlsVisibility() {
  const container = el('videoContainer');
  if (!container) return;
  if (container.classList.contains('controls-hidden')) {
    showControls(4000);
  } else {
    hideControls();
  }
}

function skipTime(sec) {
  const video = el('playerVideo');
  if (!video) return;
  const dur = video.duration || 0;
  video.currentTime = Math.max(0, Math.min(dur, (video.currentTime || 0) + sec));
  triggerCenterFeedback(sec > 0 ? 'forward' : 'rewind');
  showControls(4000);
}

function initPlayerEventListeners() {
  const video = el('playerVideo');
  const videoContainer = el('videoContainer');
  if (!video || !videoContainer) return;

  // Sync Fullscreen state
  const handleFsChange = () => {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs) {
      videoContainer.classList.add('is-fullscreen');
    } else {
      videoContainer.classList.remove('is-fullscreen');
      hide('fullscreenEpDrawer');
    }
    showControls(4000);
  };
  document.addEventListener('fullscreenchange', handleFsChange);
  document.addEventListener('webkitfullscreenchange', handleFsChange);

  // Desktop mouse movement untuk menampilkan bar kontrol
  videoContainer.addEventListener('mousemove', () => showControls(3500));
  videoContainer.addEventListener('mouseenter', () => showControls(3500));

  // Area Sentuh Instan Khusus Layar (0ms respon untuk HP & Desktop)
  const tapArea = el('videoTapArea') || videoContainer;
  const overlay = el('videoFloatingOverlay');
  
  let lastTapTimestamp = 0;
  const handleScreenTap = (e) => {
    // Abaikan jika klik di kontrol, tombol, select, slider, atau drawer
    if (e.target.closest('.fs-bottom-bar') || 
        e.target.closest('.btn-fs-ep-toggle') || 
        e.target.closest('.btn-fs-close') || 
        e.target.closest('.fs-skip-btn') || 
        e.target.closest('.fs-episodes-drawer') || 
        e.target.closest('.player-big-play-overlay')) {
      return;
    }

    const now = Date.now();
    if (now - lastTapTimestamp < 180) return; // Debounce multi-event
    lastTapTimestamp = now;

    toggleControlsVisibility();
  };

  tapArea.addEventListener('click', handleScreenTap);
  tapArea.addEventListener('touchend', handleScreenTap, { passive: true });
  if (overlay) {
    overlay.addEventListener('click', handleScreenTap);
    overlay.addEventListener('touchend', handleScreenTap, { passive: true });
  }

  // Double Click di Desktop untuk Play / Pause
  tapArea.addEventListener('dblclick', (e) => {
    togglePlay();
  });

  // Tahan bar kontrol tetap terbuka saat user berinteraksi dengan kontrol
  const bottomBar = document.querySelector('.fs-bottom-bar');
  if (bottomBar) {
    bottomBar.addEventListener('click', (e) => {
      e.stopPropagation();
      showControls(5000);
    });
    bottomBar.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      showControls(5000);
    }, { passive: true });
  }

  video.addEventListener('play', () => {
    hide('bigPlayOverlay');
    const playBtn = el('btnPlay');
    if (playBtn) playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    triggerCenterFeedback('play');
    showControls(4000);
  });

  video.addEventListener('pause', () => {
    const playBtn = el('btnPlay');
    if (playBtn) playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    triggerCenterFeedback('pause');
    showControls(0); // Tetap biarkan kontrol terbuka saat video di-pause
  });

  let autoNextTriggered = false;

  const triggerAutoNext = () => {
    if (autoNextTriggered) return;
    const isAutoNext = el('chkAutoNext')?.checked ?? true;
    if (isAutoNext && appState.currentEpisode < appState.totalEpisodes) {
      autoNextTriggered = true;
      showControls(4000);
      setTimeout(() => {
        navigateEpisode(1);
        autoNextTriggered = false;
      }, 500);
    }
  };

  // Auto-next saat video selesai (native ended)
  video.addEventListener('ended', () => {
    showControls(4000);
    triggerAutoNext();
  });

  video.addEventListener('timeupdate', () => {
    const cur = video.currentTime || 0;
    const dur = video.duration || 0;
    if (el('timeCurrent')) el('timeCurrent').textContent = formatTime(cur);
    if (el('timeDuration')) el('timeDuration').textContent = formatTime(dur);
    if (dur > 0 && el('videoSeekBar')) {
      el('videoSeekBar').value = (cur / dur) * 1000;
    }

    // Auto-next backup trigger saat video mencapai akhir playlist (<0.4s tersisa)
    if (dur > 2 && cur > 0 && cur >= (dur - 0.45) && !video.paused) {
      triggerAutoNext();
    }

    // Simpan progres ke riwayat tontonan setiap 3 detik
    const now = Date.now();
    if (now - lastProgressSaveTime > 3000 && appState.activeDrama && cur > 0) {
      lastProgressSaveTime = now;
      saveWatchProgress(appState.activeDrama, appState.currentEpisode, cur, dur);
    }
  });

  el('videoSeekBar')?.addEventListener('input', (e) => {
    const dur = video.duration || 0;
    if (dur > 0) {
      video.currentTime = (e.target.value / 1000) * dur;
    }
    showControls(4000);
  });

  el('volSlider')?.addEventListener('input', (e) => {
    video.volume = e.target.value / 100;
    video.muted = false;
    showControls(4000);
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (el('theaterModal')?.classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      skipTime(5);
    } else if (e.code === 'ArrowLeft') {
      skipTime(-5);
    } else if (e.code === 'KeyF') {
      toggleFullscreen();
    } else if (e.code === 'KeyM') {
      toggleMute();
    } else if (e.code === 'KeyE') {
      toggleFullscreenEpisodes();
    } else if (e.code === 'Escape') {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        closeTheater();
      }
    }
  });
}

function triggerCenterFeedback(type) {
  const ripple = el('centerFeedback');
  const icon = el('rippleIcon');
  if (!ripple || !icon) return;

  if (type === 'play') {
    icon.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  } else if (type === 'pause') {
    icon.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  } else if (type === 'forward') {
    icon.innerHTML = '<span style="font-size:1.1rem;font-weight:900;">+10s ⏩</span>';
  } else if (type === 'rewind') {
    icon.innerHTML = '<span style="font-size:1.1rem;font-weight:900;">⏪ -10s</span>';
  }

  ripple.classList.remove('animate');
  void ripple.offsetWidth; // Reflow
  ripple.classList.add('animate');
  setTimeout(() => ripple.classList.remove('animate'), 450);
}

function togglePlay() {
  const video = el('playerVideo');
  if (!video) return;
  if (video.paused) video.play().catch(() => {});
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

function isCurrentlyFullscreen() {
  const container = el('videoContainer');
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    container?.classList.contains('is-fullscreen')
  );
}

function toggleFullscreen() {
  const container = el('videoContainer');
  if (!container) return;

  const isFs = isCurrentlyFullscreen();

  if (!isFs) {
    // Masuk mode Layar Penuh
    if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {
        container.classList.add('is-fullscreen');
      });
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    } else {
      container.classList.add('is-fullscreen');
    }
    container.classList.add('is-fullscreen');
  } else {
    // Keluar mode Layar Penuh
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    container.classList.remove('is-fullscreen');
    hide('fullscreenEpDrawer');
  }
  showControls(4000);
}

function toggleFullscreenEpisodes(e) {
  if (e) e.stopPropagation();
  const drawer = el('fullscreenEpDrawer');
  if (!drawer) return;

  if (drawer.classList.contains('hidden')) {
    show('fullscreenEpDrawer');
    const currentFsTile = el(`fsTileEp_${appState.currentEpisode}`);
    if (currentFsTile) {
      currentFsTile.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    hide('fullscreenEpDrawer');
  }
}

function exitFullscreenOrTheater() {
  const container = el('videoContainer');
  if (isCurrentlyFullscreen()) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    container?.classList.remove('is-fullscreen');
    hide('fullscreenEpDrawer');
  } else {
    closeTheater();
  }
}

function navigateEpisode(delta) {
  const next = appState.currentEpisode + delta;
  if (next >= 1 && next <= appState.totalEpisodes) {
    playEpisode(appState.currentSource, appState.activeDrama?.id, next);
  }
}

function closeTheater() {
  playbackSessionId++; // Invalidate pending requests

  const video = el('playerVideo');
  if (video) {
    try { video.pause(); } catch {}
    video.removeAttribute('src');
    video.load();
  }

  if (appState.hlsPlayer) {
    try { appState.hlsPlayer.destroy(); } catch {}
    appState.hlsPlayer = null;
  }

  appState.activeDrama = null;
  appState.currentVideoData = null;
  hide('fullscreenEpDrawer');
  hide('theaterModal');
}

// Start
document.addEventListener('DOMContentLoaded', initApp);
