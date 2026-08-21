const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', 'assets', 'logos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const logos = {
  dramabox: {
    c1: '#ff4500', c2: '#ff1a1a',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_dramabox)"/><polygon points="42,34 72,50 42,66" fill="#ffffff"/><rect x="28" y="34" width="8" height="32" rx="4" fill="#ffffff"/>`
  },
  dramawave: {
    c1: '#0f172a', c2: '#0369a1',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_dramawave)"/><path d="M22 50 Q36 28 50 50 T78 50" fill="none" stroke="#38bdf8" stroke-width="7" stroke-linecap="round"/><polygon points="46,38 66,50 46,62" fill="#ffffff"/>`
  },
  shortmax: {
    c1: '#18181b', c2: '#27272a',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_shortmax)"/><path d="M64 32 C50 25 34 32 34 46 C34 62 66 54 66 70 C66 78 52 80 36 74" fill="none" stroke="#f97316" stroke-width="9" stroke-linecap="round"/><circle cx="50" cy="51" r="8" fill="#38bdf8"/>`
  },
  reelshort: {
    c1: '#e11d48', c2: '#be123c',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_reelshort)"/><text x="50" y="63" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-2">RS</text>`
  },
  reelshortv2: {
    c1: '#e11d48', c2: '#9f1239',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_reelshortv2)"/><text x="50" y="63" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="900" fill="#ffffff" text-anchor="middle">RS2</text>`
  },
  netshort: {
    c1: '#dc2626', c2: '#000000',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_netshort)"/><path d="M30 70 L30 30 L70 70 L70 30" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  freereels: {
    c1: '#8b5cf6', c2: '#6d28d9',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_freereels)"/><circle cx="50" cy="50" r="26" fill="none" stroke="#ffffff" stroke-width="7"/><circle cx="50" cy="50" r="9" fill="#ffffff"/><circle cx="50" cy="30" r="4" fill="#ffd700"/><circle cx="70" cy="50" r="4" fill="#ffd700"/><circle cx="50" cy="70" r="4" fill="#ffd700"/><circle cx="30" cy="50" r="4" fill="#ffd700"/>`
  },
  melolo: {
    c1: '#facc15', c2: '#eab308',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_melolo)"/><circle cx="36" cy="42" r="6" fill="#18181b"/><circle cx="64" cy="42" r="6" fill="#18181b"/><path d="M32 58 Q50 74 68 58" fill="none" stroke="#18181b" stroke-width="7" stroke-linecap="round"/>`
  },
  dramanova: {
    c1: '#ec4899', c2: '#db2777',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_dramanova)"/><polygon points="50,24 76,46 50,78 24,46" fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round"/><line x1="24" y1="46" x2="76" y2="46" stroke="#ffffff" stroke-width="6"/>`
  },
  goodshort: {
    c1: '#1d4ed8', c2: '#2563eb',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_goodshort)"/><polygon points="50,22 58,40 78,42 63,56 68,76 50,65 32,76 37,56 22,42 42,40" fill="#ffd700" stroke="#ffffff" stroke-width="3"/>`
  },
  flickreels: {
    c1: '#f97316', c2: '#ea580c',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_flickreels)"/><rect x="24" y="32" width="38" height="38" rx="8" fill="#ffffff"/><polygon points="64,40 80,30 80,72 64,62" fill="#ffffff"/>`
  },
  stardusttv: {
    c1: '#7e22ce', c2: '#a855f7',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_stardusttv)"/><polygon points="50,20 57,43 80,50 57,57 50,80 43,57 20,50 43,43" fill="#ffffff"/><circle cx="50" cy="50" r="5" fill="#ffd700"/>`
  },
  snackshort: {
    c1: '#f59e0b', c2: '#d97706',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_snackshort)"/><path d="M30 46 L38 78 L62 78 L70 46 Z" fill="#ffffff"/><circle cx="40" cy="36" r="9" fill="#ffffff"/><circle cx="60" cy="36" r="9" fill="#ffffff"/><circle cx="50" cy="28" r="10" fill="#ffffff"/><polygon points="46,52 58,62 46,72" fill="#f59e0b"/>`
  },
  dotdrama: {
    c1: '#4338ca', c2: '#6366f1',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_dotdrama)"/><circle cx="50" cy="50" r="22" fill="#38bdf8"/><circle cx="50" cy="50" r="11" fill="#ffffff"/>`
  },
  flextv: {
    c1: '#7c3aed', c2: '#f97316',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_flextv)"/><text x="50" y="64" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="900" fill="#ffffff" text-anchor="middle">FX</text>`
  },
  dramabite: {
    c1: '#f43f5e', c2: '#e11d48',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_dramabite)"/><circle cx="50" cy="54" r="24" fill="#ffffff"/><circle cx="70" cy="42" r="14" fill="#e11d48"/><path d="M50 26 Q58 18 64 20" stroke="#22c55e" stroke-width="5" stroke-linecap="round" fill="none"/>`
  },
  bstation: {
    c1: '#00aeec', c2: '#008bb9',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_bstation)"/><rect x="24" y="36" width="52" height="38" rx="10" fill="#ffffff"/><line x1="36" y1="24" x2="44" y2="36" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/><line x1="64" y1="24" x2="56" y2="36" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/><circle cx="42" cy="54" r="5" fill="#00aeec"/><circle cx="58" cy="54" r="5" fill="#00aeec"/>`
  },
  donghuaqueen: {
    c1: '#059669', c2: '#10b981',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_donghuaqueen)"/><path d="M24 64 L30 36 L50 50 L70 36 L76 64 Z" fill="#ffd700" stroke="#ffffff" stroke-width="3"/><circle cx="30" cy="32" r="5" fill="#ffffff"/><circle cx="50" cy="44" r="5" fill="#ffffff"/><circle cx="70" cy="32" r="5" fill="#ffffff"/>`
  },
  samehadaku: {
    c1: '#dc2626', c2: '#18181b',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_samehadaku)"/><polygon points="50,20 57,43 80,50 57,57 50,80 43,57 20,50 43,43" fill="#ffffff" transform="rotate(45 50 50)"/><circle cx="50" cy="50" r="9" fill="#dc2626"/>`
  },
  drakorid: {
    c1: '#ec4899', c2: '#3b82f6',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_drakorid)"/><text x="50" y="64" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="900" fill="#ffffff" text-anchor="middle">DK</text>`
  },
  lookseries: {
    c1: '#334155', c2: '#1e293b',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_lookseries)"/><rect x="22" y="30" width="56" height="44" rx="8" fill="#ffffff"/><polygon points="44,42 62,52 44,62" fill="#1e293b"/>`
  },
  dramaqueen: {
    c1: '#6d28d9', c2: '#a855f7',
    svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_dramaqueen)"/><path d="M24 64 L30 36 L50 50 L70 36 L76 64 Z" fill="#ffd700"/><circle cx="50" cy="30" r="6" fill="#ffd700"/>`
  }
};

const remaining = [
  'anyreel','soreel','stareel','kalostv','radreels','freeshort','nunodrama','meloshort',
  'shortswave','sodareels','vibeshort','dramarush','cubetv','lupacine','idrama','happyshort',
  'momeshort','moreshort','storygo','minishort','shorten','mydrama','huangdou','ansflix',
  'bibishort','fundrama','zeroshort','dramaora','bumpit','nunomix','animex','toonshort'
];

const palette = [
  ['#0284c7', '#0369a1'], ['#10b981', '#059669'], ['#f59e0b', '#d97706'],
  ['#ec4899', '#db2777'], ['#8b5cf6', '#7c3aed'], ['#ef4444', '#dc2626'],
  ['#14b8a6', '#0f766e'], ['#6366f1', '#4f46e5'], ['#f97316', '#ea580c']
];

remaining.forEach((k, idx) => {
  if (!logos[k]) {
    const pair = palette[idx % palette.length];
    const letters = k.slice(0, 2).toUpperCase();
    logos[k] = {
      c1: pair[0],
      c2: pair[1],
      svg: `<rect x="8" y="8" width="84" height="84" rx="22" fill="url(#grad_${k})"/><text x="50" y="65" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-1">${letters}</text>`
    };
  }
});

let count = 0;
for (const [key, data] of Object.entries(logos)) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="grad_${key}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${data.c1}"/>
      <stop offset="100%" stop-color="${data.c2}"/>
    </linearGradient>
  </defs>
  ${data.svg}
</svg>`;

  fs.writeFileSync(path.join(dir, `${key}.svg`), svg, 'utf8');
  count++;
}

console.log(`Generated ${count} local SVG brand logos in public/assets/logos/`);
