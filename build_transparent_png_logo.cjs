const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');

// Transparent background SVG template matching the red badge logo
const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Vibrant Red Badge Gradient -->
    <linearGradient id="red-badge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ED1C24" />
      <stop offset="100%" stop-color="#A80308" />
    </linearGradient>

    <!-- Glowing White Horizontal Laser Beam -->
    <linearGradient id="laser-beam" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
      <stop offset="25%" stop-color="#FFFFFF" stop-opacity="0.6" />
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="1" />
      <stop offset="75%" stop-color="#FFFFFF" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </linearGradient>
  </defs>

  <!-- 1. Outer Red Teardrop / Badge Container with 100% Transparent Background -->
  <path d="M 45,45 L 325,45 C 425,45 475,115 475,245 C 475,375 375,475 245,475 C 125,475 45,375 45,195 Z" fill="url(#red-badge-grad)" />

  <!-- 2. Scanner Brackets in crisp white -->
  <!-- Top-Left Bracket -->
  <path d="M 162,112 L 162,82 A 10,10 0 0,1 172,72 L 202,72" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" fill="none" />
  <!-- Top-Right Bracket -->
  <path d="M 350,112 L 350,82 A 10,10 0 0,0 340,72 L 310,72" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" fill="none" />
  <!-- Bottom-Left Bracket -->
  <path d="M 162,202 L 162,232 A 10,10 0 0,0 172,242 L 202,242" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" fill="none" />
  <!-- Bottom-Right Bracket -->
  <path d="M 350,202 L 350,217 A 8,8 0 0,0 342,225 L 332,225" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" fill="none" />

  <!-- 3. Worker Silhouette & Hard Hat in crisp white -->
  <!-- Helmet Dome -->
  <path d="M 204,142 C 204,80 308,80 308,142 Z" fill="#FFFFFF" />
  <!-- Helmet Brim -->
  <path d="M 194,140 C 194,140 256,153 318,140 C 322,145 318,150 318,150 C 256,161 194,150 194,150 Z" fill="#FFFFFF" />
  
  <!-- Head & Neck -->
  <path d="M 220,172 C 220,147 292,147 292,172 C 292,202 277,219 256,219 C 235,219 220,202 220,172 Z" fill="#FFFFFF" />
  
  <!-- Shoulders & Collar -->
  <path d="M 170,285 C 170,239 206,225 256,225 C 306,225 342,239 342,285 L 342,292 L 170,292 Z" fill="#FFFFFF" />
  <!-- Collar Cutout (showing red badge underneath) -->
  <path d="M 235,225 L 256,262 L 277,225 Z" fill="#A80308" />

  <!-- 4. Glowing Horizontal Laser Beam across Eyes -->
  <line x1="145" y1="175" x2="367" y2="175" stroke="url(#laser-beam)" stroke-width="12" stroke-linecap="round" />
  <line x1="175" y1="175" x2="337" y2="175" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />

  <!-- 5. Map Location Pin on Worker's Right Side -->
  <ellipse cx="330" cy="285" rx="20" ry="6" fill="none" stroke="#FFFFFF" stroke-width="3" />
  <path d="M 330,285 C 308,261 308,232 330,232 C 352,232 352,261 330,285 Z" fill="#FFFFFF" />
  <circle cx="330" cy="247" r="6" fill="#A80308" />

  <!-- 6. Typography "Find My Workers" -->
  <!-- "Find My" -->
  <text x="256" y="344" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Arial, sans-serif" font-size="46" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="-0.5">Find My</text>

  <!-- "Workers" -->
  <text x="256" y="404" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Arial, sans-serif" font-size="56" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">
    <tspan>W</tspan>
    <tspan fill="none" letter-spacing="22">o</tspan>
    <tspan>rkers</tspan>
  </text>
  
  <!-- Location Pin substituting 'o' in Workers -->
  <g transform="translate(198, 371) scale(0.85)">
    <path d="M 12,30 C -3,15 -3,0 12,0 C 27,0 27,15 12,30 Z" fill="#FFFFFF" />
    <circle cx="12" cy="10" r="5" fill="#A80308" />
  </g>

  <!-- 7. Tagline: SCAN • IDENTIFY • TRACK -->
  <line x1="105" y1="438" x2="145" y2="438" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" />
  <text x="256" y="442" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Montserrat', 'Segoe UI', Arial, sans-serif" font-size="12" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="2.5">SCAN  •  IDENTIFY  •  TRACK</text>
  <line x1="367" y1="438" x2="407" y2="438" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" />
</svg>`;

// Save public/logo.svg for fallback vector usage
fs.writeFileSync('public/logo.svg', svgContent);

function convertSvgToPng(width, outputPath) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: width }
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`Successfully generated ${outputPath} (${width}x${width} PNG with transparent background)`);
}

// Generate all transparent PNG icon sizes required by the PWA and browser
convertSvgToPng(512, 'public/logo.png');
convertSvgToPng(512, 'public/logo-512.png');
convertSvgToPng(192, 'public/logo-192.png');
convertSvgToPng(180, 'public/apple-touch-icon.png');
convertSvgToPng(64, 'public/favicon.png');
convertSvgToPng(512, 'src/assets/logo.png');

// Copy favicon.png to favicon.ico for maximum browser compatibility
fs.copyFileSync('public/favicon.png', 'public/favicon.ico');
console.log('Successfully updated public/favicon.ico');

console.log('All PNG logo files updated successfully!');
