/**
 * Generates a high-resolution 512x512 transparent PNG logo for Find Worker
 * matching the uploaded biometric shield logo with map pins and face mesh.
 * Background is completely transparent.
 */
let cachedPngDataUrl: string | null = null;

export function getFindWorkerLogoPng(): string {
  if (cachedPngDataUrl) return cachedPngDataUrl;

  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Ensure canvas background is 100% transparent
  ctx.clearRect(0, 0, 512, 512);

  const cx = 256;
  const cy = 230;

  // ----------------------------------------------------
  // 1. Draw Outer Shield (Gradient: Deep Blue -> Teal -> Vibrant Emerald Green)
  // ----------------------------------------------------
  const shieldGradient = ctx.createLinearGradient(80, 50, 430, 460);
  shieldGradient.addColorStop(0, '#0284C7');   // Blue
  shieldGradient.addColorStop(0.35, '#06B6D4'); // Cyan
  shieldGradient.addColorStop(0.7, '#0D9488');  // Teal
  shieldGradient.addColorStop(1, '#10B981');   // Emerald Green

  ctx.save();
  ctx.lineWidth = 16;
  ctx.strokeStyle = shieldGradient;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outer Shield Path
  ctx.beginPath();
  ctx.moveTo(cx, 45);               // Top middle peak
  ctx.lineTo(415, 82);              // Top right shoulder
  ctx.quadraticCurveTo(432, 230, 256, 465); // Right side curve to bottom tip
  ctx.quadraticCurveTo(80, 230, 97, 82);   // Left side curve to top left shoulder
  ctx.closePath();
  ctx.stroke();

  // Inner Shield Line (parallel border)
  ctx.lineWidth = 6;
  ctx.strokeStyle = shieldGradient;
  ctx.beginPath();
  ctx.moveTo(cx, 65);
  ctx.lineTo(395, 98);
  ctx.quadraticCurveTo(410, 225, 256, 442);
  ctx.quadraticCurveTo(102, 225, 117, 98);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // ----------------------------------------------------
  // 2. Draw Biometric Face Mesh (Dark Blue / Teal Wireframe)
  // ----------------------------------------------------
  ctx.save();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#0284C7';
  ctx.fillStyle = '#0284C7';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Face outline nodes
  const foreheadLeft = { x: 175, y: cy - 90 };
  const foreheadCenter = { x: cx, y: cy - 105 };
  const foreheadRight = { x: 337, y: cy - 90 };
  const templeLeft = { x: 155, y: cy - 45 };
  const templeRight = { x: 357, y: cy - 45 };
  const cheekLeft = { x: 165, y: cy + 15 };
  const cheekRight = { x: 347, y: cy + 15 };
  const jawLeft = { x: 185, y: cy + 75 };
  const jawRight = { x: 327, y: cy + 75 };
  const chinLeft = { x: 220, y: cy + 110 };
  const chinCenter = { x: cx, y: cy + 120 };
  const chinRight = { x: 292, y: cy + 110 };

  // Draw Face Outer Boundary
  ctx.beginPath();
  ctx.moveTo(foreheadLeft.x, foreheadLeft.y);
  ctx.lineTo(foreheadCenter.x, foreheadCenter.y);
  ctx.lineTo(foreheadRight.x, foreheadRight.y);
  ctx.lineTo(templeRight.x, templeRight.y);
  ctx.lineTo(cheekRight.x, cheekRight.y);
  ctx.lineTo(jawRight.x, jawRight.y);
  ctx.lineTo(chinRight.x, chinRight.y);
  ctx.lineTo(chinCenter.x, chinCenter.y);
  ctx.lineTo(chinLeft.x, chinLeft.y);
  ctx.lineTo(jawLeft.x, jawLeft.y);
  ctx.lineTo(cheekLeft.x, cheekLeft.y);
  ctx.lineTo(templeLeft.x, templeLeft.y);
  ctx.closePath();
  ctx.stroke();

  // Internal Biometric Polygonal Wireframe Lines
  const noseTop = { x: cx, y: cy - 50 };
  const noseTip = { x: cx, y: cy + 25 };
  const noseLeft = { x: cx - 22, y: cy + 25 };
  const noseRight = { x: cx + 22, y: cy + 25 };

  const eyeInnerLeft = { x: cx - 35, y: cy - 25 };
  const eyeOuterLeft = { x: cx - 75, y: cy - 30 };
  const eyeInnerRight = { x: cx + 35, y: cy - 25 };
  const eyeOuterRight = { x: cx + 75, y: cy - 30 };

  const mouthLeft = { x: cx - 32, y: cy + 60 };
  const mouthCenterTop = { x: cx, y: cy + 55 };
  const mouthCenterBottom = { x: cx, y: cy + 72 };
  const mouthRight = { x: cx + 32, y: cy + 60 };

  ctx.beginPath();
  // Forehead triangles
  ctx.moveTo(foreheadCenter.x, foreheadCenter.y);
  ctx.lineTo(noseTop.x, noseTop.y);
  ctx.moveTo(foreheadLeft.x, foreheadLeft.y);
  ctx.lineTo(noseTop.x, noseTop.y);
  ctx.moveTo(foreheadRight.x, foreheadRight.y);
  ctx.lineTo(noseTop.x, noseTop.y);

  ctx.moveTo(foreheadLeft.x, foreheadLeft.y);
  ctx.lineTo(eyeOuterLeft.x, eyeOuterLeft.y);
  ctx.moveTo(foreheadRight.x, foreheadRight.y);
  ctx.lineTo(eyeOuterRight.x, eyeOuterRight.y);

  // Eye structure & eyebrows
  ctx.moveTo(templeLeft.x, templeLeft.y);
  ctx.lineTo(eyeOuterLeft.x, eyeOuterLeft.y);
  ctx.lineTo(eyeInnerLeft.x, eyeInnerLeft.y);
  ctx.lineTo(noseTop.x, noseTop.y);
  ctx.lineTo(eyeInnerRight.x, eyeInnerRight.y);
  ctx.lineTo(eyeOuterRight.x, eyeOuterRight.y);
  ctx.lineTo(templeRight.x, templeRight.y);

  ctx.moveTo(eyeInnerLeft.x, eyeInnerLeft.y);
  ctx.lineTo(noseTip.x, noseTip.y);
  ctx.moveTo(eyeInnerRight.x, eyeInnerRight.y);
  ctx.lineTo(noseTip.x, noseTip.y);

  // Cheekbones & Nose
  ctx.moveTo(eyeOuterLeft.x, eyeOuterLeft.y);
  ctx.lineTo(cheekLeft.x, cheekLeft.y);
  ctx.lineTo(noseLeft.x, noseLeft.y);
  ctx.lineTo(noseTip.x, noseTip.y);
  ctx.lineTo(noseRight.x, noseRight.y);
  ctx.lineTo(cheekRight.x, cheekRight.y);
  ctx.lineTo(eyeOuterRight.x, eyeOuterRight.y);

  // Mouth & Chin mesh
  ctx.moveTo(noseLeft.x, noseLeft.y);
  ctx.lineTo(mouthLeft.x, mouthLeft.y);
  ctx.lineTo(mouthCenterTop.x, mouthCenterTop.y);
  ctx.lineTo(mouthRight.x, mouthRight.y);
  ctx.lineTo(noseRight.x, noseRight.y);

  ctx.moveTo(noseLeft.x, noseLeft.y);
  ctx.lineTo(jawLeft.x, jawLeft.y);
  ctx.lineTo(chinLeft.x, chinLeft.y);
  ctx.lineTo(mouthCenterBottom.x, mouthCenterBottom.y);
  ctx.lineTo(chinRight.x, chinRight.y);
  ctx.lineTo(jawRight.x, jawRight.y);
  ctx.lineTo(mouthRight.x, mouthRight.y);

  ctx.moveTo(mouthLeft.x, mouthLeft.y);
  ctx.lineTo(mouthCenterBottom.x, mouthCenterBottom.y);
  ctx.lineTo(mouthRight.x, mouthRight.y);

  ctx.moveTo(mouthCenterBottom.x, mouthCenterBottom.y);
  ctx.lineTo(chinCenter.x, chinCenter.y);

  ctx.stroke();
  ctx.restore();

  // ----------------------------------------------------
  // 3. Glowing Horizontal Eye Scan Line (Cyan / Mint Green)
  // ----------------------------------------------------
  ctx.save();
  const scanY = cy - 25;

  // Soft scan beam backdrop glow
  const scanBeamGlow = ctx.createLinearGradient(120, scanY, 392, scanY);
  scanBeamGlow.addColorStop(0, 'rgba(6, 182, 212, 0)');
  scanBeamGlow.addColorStop(0.2, 'rgba(52, 211, 153, 0.25)');
  scanBeamGlow.addColorStop(0.5, 'rgba(52, 211, 153, 0.45)');
  scanBeamGlow.addColorStop(0.8, 'rgba(52, 211, 153, 0.25)');
  scanBeamGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');

  ctx.fillStyle = scanBeamGlow;
  ctx.beginPath();
  ctx.moveTo(120, scanY - 20);
  ctx.lineTo(392, scanY - 20);
  ctx.lineTo(412, scanY + 20);
  ctx.lineTo(100, scanY + 20);
  ctx.closePath();
  ctx.fill();

  // Glowing Scan Line
  ctx.lineWidth = 5;
  const scanLineGradient = ctx.createLinearGradient(110, scanY, 402, scanY);
  scanLineGradient.addColorStop(0, '#06B6D4');
  scanLineGradient.addColorStop(0.3, '#34D399');
  scanLineGradient.addColorStop(0.7, '#34D399');
  scanLineGradient.addColorStop(1, '#06B6D4');

  ctx.strokeStyle = scanLineGradient;
  ctx.beginPath();
  ctx.moveTo(110, scanY);
  ctx.lineTo(402, scanY);
  ctx.stroke();

  // 3 Glowing Scan Nodes
  const scanNodeX = [190, cx, 322];
  scanNodeX.forEach(x => {
    // Outer glow ring
    ctx.beginPath();
    ctx.arc(x, scanY, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(52, 211, 153, 0.35)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, scanY, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#10B981';
    ctx.stroke();
  });
  ctx.restore();

  // ----------------------------------------------------
  // 4. Location Pins & Connected Route Network
  // ----------------------------------------------------
  ctx.save();

  // Left Location Pin (Teal/Green)
  drawPin(ctx, 155, cy + 125, '#0D9488', '#10B981');

  // Right Location Pin (Deep Blue)
  drawPin(ctx, 355, cy + 95, '#0284C7', '#0369A1');

  // Network Route Graph
  const routeNodes = [
    { x: 155, y: cy + 155 },
    { x: 198, y: cy + 185 },
    { x: 238, y: cy + 145 },
    { x: 278, y: cy + 198 },
    { x: 318, y: cy + 165 },
    { x: 355, y: cy + 122 }
  ];

  // Connecting route line
  ctx.beginPath();
  ctx.moveTo(routeNodes[0].x, routeNodes[0].y);
  for (let i = 1; i < routeNodes.length; i++) {
    ctx.lineTo(routeNodes[i].x, routeNodes[i].y);
  }
  ctx.lineWidth = 4;
  const routeGradient = ctx.createLinearGradient(155, cy + 150, 355, cy + 150);
  routeGradient.addColorStop(0, '#0D9488');
  routeGradient.addColorStop(0.5, '#06B6D4');
  routeGradient.addColorStop(1, '#0284C7');
  ctx.strokeStyle = routeGradient;
  ctx.stroke();

  // Route Node Circles
  routeNodes.forEach((node, idx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, idx % 2 === 0 ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = idx % 2 === 0 ? '#10B981' : '#0284C7';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
  });

  ctx.restore();

  // Cache and return high-res transparent PNG
  cachedPngDataUrl = canvas.toDataURL('image/png');
  return cachedPngDataUrl;
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, color1: string, color2: string) {
  ctx.save();
  const pinGrad = ctx.createLinearGradient(x, y - 20, x, y + 10);
  pinGrad.addColorStop(0, color2);
  pinGrad.addColorStop(1, color1);

  ctx.fillStyle = pinGrad;
  ctx.beginPath();
  ctx.arc(x, y - 10, 13, Math.PI * 0.85, Math.PI * 0.15, false);
  ctx.lineTo(x, y + 12);
  ctx.closePath();
  ctx.fill();

  // Inner white hole
  ctx.beginPath();
  ctx.arc(x, y - 10, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
}
