/**
 * Демо-изображения рисуются как SVG и растрируются через sharp.
 * Текста на них нет намеренно: в Docker-образе нет системных шрифтов.
 */

/** Обложка 2:3 — рассвет над горной грядой и одинокая фигура. */
export const coverSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1026"/>
      <stop offset="0.45" stop-color="#2a2350"/>
      <stop offset="0.7" stop-color="#b3546a"/>
      <stop offset="0.86" stop-color="#f2a65a"/>
      <stop offset="1" stop-color="#f7d58b"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff4d6"/>
      <stop offset="0.5" stop-color="#ffd48a" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#ffb35c" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7d58b" stop-opacity="0"/>
      <stop offset="1" stop-color="#f3c28a" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="800" height="1200" fill="url(#sky)"/>
  <g fill="#fff" opacity="0.7">
    <circle cx="120" cy="140" r="1.6"/><circle cx="260" cy="90" r="1.2"/><circle cx="420" cy="170" r="1.4"/>
    <circle cx="610" cy="110" r="1.8"/><circle cx="700" cy="230" r="1.1"/><circle cx="70" cy="300" r="1.2"/>
    <circle cx="340" cy="260" r="1"/><circle cx="530" cy="310" r="1.3"/><circle cx="190" cy="380" r="0.9"/>
  </g>
  <circle cx="400" cy="860" r="260" fill="url(#sun)"/>
  <path d="M0 880 L120 760 L210 830 L330 690 L430 800 L540 700 L650 810 L800 720 L800 1200 L0 1200 Z" fill="#3b2446" opacity="0.85"/>
  <path d="M0 960 L150 860 L260 930 L380 850 L500 940 L640 860 L800 950 L800 1200 L0 1200 Z" fill="#23172f"/>
  <rect y="820" width="800" height="200" fill="url(#fog)"/>
  <path d="M0 1040 Q400 990 800 1040 L800 1200 L0 1200 Z" fill="#120c1a"/>
  <g fill="#0a0710">
    <rect x="394" y="962" width="12" height="44" rx="5"/>
    <circle cx="400" cy="952" r="9"/>
    <path d="M394 970 L372 1010 L380 1012 L398 978 Z"/>
    <path d="M406 968 L436 930 L440 934 L410 976 Z"/>
  </g>
</svg>`;

/** Фон «после боя»: холодный туманный рассвет, тёмный по краям для читаемости. */
export const aftermathBgSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1320"/>
      <stop offset="0.55" stop-color="#2b3547"/>
      <stop offset="0.8" stop-color="#6b6a74"/>
      <stop offset="1" stop-color="#8a7a70"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.8" r="0.6">
      <stop offset="0" stop-color="#e8c9a0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#e8c9a0" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.65"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#s)"/>
  <rect width="1920" height="1080" fill="url(#glow)"/>
  <path d="M0 820 L260 700 L420 780 L640 660 L860 760 L1080 650 L1320 770 L1540 680 L1920 790 L1920 1080 L0 1080 Z" fill="#1d222d" opacity="0.8"/>
  <path d="M0 900 L300 840 L560 900 L840 830 L1120 910 L1400 840 L1700 900 L1920 860 L1920 1080 L0 1080 Z" fill="#12151c"/>
  <rect width="1920" height="1080" fill="url(#vig)"/>
</svg>`;
