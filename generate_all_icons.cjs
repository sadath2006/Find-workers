const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

// High-fidelity SVG representing the exact user logo
const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Vibrant Red Badge Gradient -->
    <linearGradient id="badge-red" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EA111B" />
      <stop offset="30%" stop-color="#DC0A14" />
      <stop offset="70%" stop-color="#C0040D" />
      <stop offset="100%" stop-color="#9C0006" />
    </linearGradient>

    <!-- Glowing White/Red Laser Visor -->
    <linearGradient id="laser-glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
      <stop offset="15%" stop-color="#FFFFFF" stop-opacity="0.75" />
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="1" />
      <stop offset="85%" stop-color="#FFFFFF" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </linearGradient>

    <!-- Soft red eye flare filter -->
    <filter id="eye-glow" x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- 1. Exact Red Badge Contour:
       - Sharp Top-Left Corner at (24, 28)
       - Flat Horizontal Top from (24, 28) to (259, 28)
       - Perfect Circular Arc for Right and Bottom: (259, 28) -> (494, 263) -> (259, 498) -> (24, 263)
       - Flat Vertical Left Edge from (24, 263) up to (24, 28)
  -->
  <path d="M 24,28 
           L 259,28 
           A 235,235 0 0,1 494,263 
           A 235,235 0 0,1 259,498 
           A 235,235 0 0,1 24,263 
           Z" 
        fill="url(#badge-red)" />

  <!-- 2. Four Viewfinder Scanner Brackets -->
  <!-- Top-Left -->
  <path d="M 158,118 L 158,86 A 14,14 0 0,1 172,72 L 204,72" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  <!-- Top-Right -->
  <path d="M 354,118 L 354,86 A 14,14 0 0,0 340,72 L 308,72" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  <!-- Bottom-Left -->
  <path d="M 158,206 L 158,236 A 14,14 0 0,0 172,250 L 204,250" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  <!-- Bottom-Right -->
  <path d="M 354,206 L 354,222 A 10,10 0 0,0 344,232 L 334,232" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" />

  <!-- 3. Worker Figure (Helmet & Upper Body) -->
  <!-- Hard Hat Dome -->
  <path d="M 200,140 C 200,74 312,74 312,140 Z" fill="#FFFFFF" />
  <!-- Hard Hat Center Ridge -->
  <path d="M 245,76 C 245,72 267,72 267,76 L 263,138 L 249,138 Z" fill="#F4F4F4" opacity="0.9" />
  <!-- Hard Hat Curved Brim -->
  <path d="M 188,140 C 188,140 256,155 324,140 C 330,146 324,152 324,152 C 256,165 188,152 188,152 Z" fill="#FFFFFF" />
  
  <!-- Face & Chin -->
  <path d="M 218,170 C 218,144 294,144 294,170 C 294,204 278,222 256,222 C 234,222 218,204 218,170 Z" fill="#FFFFFF" />
  
  <!-- Upper Torso / Shoulders -->
  <path d="M 166,290 C 166,238 205,224 256,224 C 307,224 346,238 346,290 L 346,298 L 166,298 Z" fill="#FFFFFF" />
  <!-- Torso V-Neck opening matching badge background -->
  <path d="M 234,224 L 256,264 L 278,224 Z" fill="#9C0006" />

  <!-- 4. Glowing Red Flare & Horizontal White Laser Scan Line -->
  <!-- Red eye visor glow -->
  <ellipse cx="256" cy="176" rx="48" ry="10" fill="#FF3333" opacity="0.55" filter="url(#eye-glow)" />
  <!-- Laser Beam -->
  <line x1="136" y1="176" x2="376" y2="176" stroke="url(#laser-glow)" stroke-width="14" stroke-linecap="round" />
  <line x1="168" y1="176" x2="344" y2="176" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" />
  <ellipse cx="256" cy="176" rx="22" ry="3.5" fill="#FFFFFF" />

  <!-- 5. Map Location Marker Pin (Right of Worker) -->
  <ellipse cx="330" cy="290" rx="24" ry="7.5" fill="none" stroke="#FFFFFF" stroke-width="4" />
  <path d="M 330,290 C 304,262 304,230 330,230 C 356,230 356,262 330,290 Z" fill="#FFFFFF" />
  <circle cx="330" cy="248" r="7.5" fill="#9C0006" />

  <!-- 6. Typography "Find My" -->
  <text x="256" y="348" font-family="'Montserrat', 'Arial Black', -apple-system, system-ui, sans-serif" font-size="50" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="-0.5">Find My</text>

  <!-- 7. Typography "Workers" with Embedded Pin -->
  <text x="256" y="412" font-family="'Montserrat', 'Arial Black', -apple-system, system-ui, sans-serif" font-size="60" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">
    <tspan>W</tspan>
    <tspan fill="none" letter-spacing="24">o</tspan>
    <tspan>rkers</tspan>
  </text>
  
  <!-- Location Pin substituting 'o' in Workers -->
  <g transform="translate(196, 376) scale(0.92)">
    <path d="M 12,33 C -4,17 -4,0 12,0 C 28,0 28,17 12,33 Z" fill="#FFFFFF" />
    <circle cx="12" cy="11" r="5.5" fill="#9C0006" />
  </g>

  <!-- 8. Tagline: SCAN • IDENTIFY • TRACK -->
  <line x1="102" y1="447" x2="142" y2="447" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" />
  <text x="256" y="451" font-family="'Montserrat', -apple-system, system-ui, sans-serif" font-size="12" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="2.8">SCAN  •  IDENTIFY  •  TRACK</text>
  <line x1="370" y1="447" x2="410" y2="447" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" />
</svg>`;

// Save SVG to public
fs.writeFileSync('public/logo.svg', svgContent);

function renderPng(dimension, dest) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: dimension }
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(dest, pngBuffer);
  console.log(`Generated ${dest} (${dimension}x${dimension} PNG)`);
}

// Generate all required PNG files
renderPng(512, 'public/logo.png');
renderPng(512, 'public/logo-512.png');
renderPng(192, 'public/logo-192.png');
renderPng(180, 'public/apple-touch-icon.png');
renderPng(64, 'public/favicon.png');
renderPng(512, 'src/assets/logo.png');

// Create favicon.ico from favicon.png
fs.copyFileSync('public/favicon.png', 'public/favicon.ico');
console.log('Updated public/favicon.ico');

console.log('All PNG logos generated and saved successfully.');
