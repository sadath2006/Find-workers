const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');

// Transparent SVG reproducing the exact logo badge contour and elements
const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Rich Red Gradient matching uploaded logo -->
    <linearGradient id="red-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E50914" />
      <stop offset="100%" stop-color="#B00000" />
    </linearGradient>

    <!-- Glowing White Beam -->
    <linearGradient id="laser-glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
      <stop offset="20%" stop-color="#FFFFFF" stop-opacity="0.8" />
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="1" />
      <stop offset="80%" stop-color="#FFFFFF" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </linearGradient>

    <!-- Drop Shadow for soft depth on worker -->
    <filter id="soft-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.25" />
    </filter>
  </defs>

  <!-- 1. Exact Red Badge Contour:
       - Sharp Top-Left Corner at (22, 22)
       - Straight Top Edge from (22, 22) to (240, 22)
       - Smooth Right/Bottom Curve to (240, 490)
       - Smooth Curve from (240, 490) to (22, 280)
       - Straight Vertical Left Edge from (22, 280) up to (22, 22)
  -->
  <path d="M 22,22 
           L 240,22 
           C 380,22 490,130 490,270 
           C 490,400 380,490 240,490 
           C 110,490 22,390 22,280 
           Z" 
        fill="url(#red-gradient)" />

  <!-- 2. White Viewfinder Brackets -->
  <path d="M 160,110 L 160,82 A 12,12 0 0,1 172,70 L 200,70" stroke="#FFFFFF" stroke-width="11" stroke-linecap="round" fill="none" />
  <path d="M 352,110 L 352,82 A 12,12 0 0,0 340,70 L 312,70" stroke="#FFFFFF" stroke-width="11" stroke-linecap="round" fill="none" />
  <path d="M 160,208 L 160,236 A 12,12 0 0,0 172,248 L 200,248" stroke="#FFFFFF" stroke-width="11" stroke-linecap="round" fill="none" />
  <path d="M 352,208 L 352,222 A 10,10 0 0,0 342,232 L 332,232" stroke="#FFFFFF" stroke-width="11" stroke-linecap="round" fill="none" />

  <!-- 3. Worker Silhouette -->
  <!-- Helmet Dome -->
  <path d="M 202,142 C 202,80 310,80 310,142 Z" fill="#FFFFFF" />
  <!-- Helmet Brim -->
  <path d="M 192,140 C 192,140 256,154 320,140 C 325,145 320,150 320,150 C 256,162 192,150 192,150 Z" fill="#FFFFFF" />
  
  <!-- Head & Neck -->
  <path d="M 218,172 C 218,146 294,146 294,172 C 294,204 278,220 256,220 C 234,220 218,204 218,172 Z" fill="#FFFFFF" />
  
  <!-- Shoulders / Collar -->
  <path d="M 168,286 C 168,238 205,225 256,225 C 307,225 344,238 344,286 L 344,294 L 168,294 Z" fill="#FFFFFF" />
  <path d="M 235,225 L 256,262 L 277,225 Z" fill="#B00000" />

  <!-- 4. Glowing Horizontal Eye Scanner Beam -->
  <line x1="140" y1="175" x2="372" y2="175" stroke="url(#laser-glow)" stroke-width="14" stroke-linecap="round" />
  <line x1="170" y1="175" x2="342" y2="175" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />

  <!-- 5. Map Location Pin on Worker's Right Side -->
  <ellipse cx="330" cy="286" rx="20" ry="6" fill="none" stroke="#FFFFFF" stroke-width="3" />
  <path d="M 330,286 C 308,262 308,232 330,232 C 352,232 352,262 330,286 Z" fill="#FFFFFF" />
  <circle cx="330" cy="248" r="6" fill="#B00000" />

  <!-- 6. Typography "Find My" -->
  <text x="256" y="348" font-family="Montserrat, system-ui, -apple-system, sans-serif" font-size="48" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="-0.5">Find My</text>

  <!-- "Workers" with Pin for 'o' -->
  <text x="256" y="410" font-family="Montserrat, system-ui, -apple-system, sans-serif" font-size="58" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">
    <tspan>W</tspan>
    <tspan fill="none" letter-spacing="24">o</tspan>
    <tspan>rkers</tspan>
  </text>
  
  <!-- Pin icon replacing 'o' in Workers -->
  <g transform="translate(196, 376) scale(0.88)">
    <path d="M 12,30 C -3,15 -3,0 12,0 C 27,0 27,15 12,30 Z" fill="#FFFFFF" />
    <circle cx="12" cy="10" r="5" fill="#B00000" />
  </g>

  <!-- 7. Tagline: SCAN • IDENTIFY • TRACK -->
  <line x1="105" y1="444" x2="145" y2="444" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" />
  <text x="256" y="448" font-family="Montserrat, system-ui, -apple-system, sans-serif" font-size="12" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="2.5">SCAN  •  IDENTIFY  •  TRACK</text>
  <line x1="367" y1="444" x2="407" y2="444" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" />
</svg>`;

fs.writeFileSync('public/logo.svg', svgContent);

function convertSvgToPng(width, outputPath) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: width }
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`Updated ${outputPath} (${width}x${width} PNG)`);
}

// Write out all transparent PNG files
convertSvgToPng(512, 'public/logo.png');
convertSvgToPng(512, 'public/logo-512.png');
convertSvgToPng(192, 'public/logo-192.png');
convertSvgToPng(180, 'public/apple-touch-icon.png');
convertSvgToPng(64, 'public/favicon.png');
convertSvgToPng(512, 'src/assets/logo.png');

fs.copyFileSync('public/favicon.png', 'public/favicon.ico');
console.log('Updated public/favicon.ico');
