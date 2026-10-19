import * as THREE from "three";

// Small, locally generated light/material maps keep the room soft on phones
// without shadow maps, post-processing, or additional image downloads.
function canvasTexture(
  size: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ROOM_TEXTURE_UNAVAILABLE");
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function grain(ctx: CanvasRenderingContext2D, size: number, strength: number) {
  const pixels = ctx.getImageData(0, 0, size, size);
  let seed = 137;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const change = (seed / 4294967296 - 0.5) * strength;
    for (let c = 0; c < 3; c++) pixels.data[i + c] += change;
  }
  ctx.putImageData(pixels, 0, 0);
}

export function createRoomTextures() {
  const wall = canvasTexture(512, (ctx) => {
    const base = ctx.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, "#dedcd5");
    base.addColorStop(0.12, "#efeee8");
    base.addColorStop(0.48, "#f7f6f0");
    base.addColorStop(0.94, "#eeede6");
    base.addColorStop(1, "#d9d6cd");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    const daylight = ctx.createRadialGradient(300, 125, 12, 290, 170, 330);
    daylight.addColorStop(0, "#ffffff5c");
    daylight.addColorStop(1, "#ffffff00");
    ctx.fillStyle = daylight;
    ctx.fillRect(0, 0, 512, 512);
    const corners = ctx.createLinearGradient(0, 0, 512, 0);
    corners.addColorStop(0, "#756e601c");
    corners.addColorStop(0.07, "#756e6000");
    corners.addColorStop(0.92, "#756e6000");
    corners.addColorStop(1, "#756e6020");
    ctx.fillStyle = corners;
    ctx.fillRect(0, 0, 512, 512);
    grain(ctx, 512, 1.8);
  });
  const floor = canvasTexture(512, (ctx) => {
    ctx.fillStyle = "#dcd8ce";
    ctx.fillRect(0, 0, 512, 512);
    const light = ctx.createRadialGradient(285, 230, 40, 260, 250, 350);
    light.addColorStop(0, "#f5f2e6");
    light.addColorStop(0.6, "#e6e2d7");
    light.addColorStop(1, "#d3cec2");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, 512, 512);
    grain(ctx, 512, 3.6);
  });
  const shadow = canvasTexture(256, (ctx) => {
    ctx.shadowColor = "#393127";
    ctx.shadowBlur = 17;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 7;
    ctx.fillStyle = "#393127";
    ctx.fillRect(34, 34, 188, 188);
  });
  return { wall, floor, shadow };
}
