import * as THREE from "three";

// Baked soft light and one shared local wood image keep surfaces matte without
// shadow maps, normal maps or post-processing on phones.
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
  texture.anisotropy = 4;
  return texture;
}

type Surface = "wall" | "floor" | "ceiling";
const size = 1024;
function paintSurface(
  ctx: CanvasRenderingContext2D,
  surface: Surface,
  wood?: HTMLImageElement,
) {
  ctx.fillStyle = surface === "floor" ? "#dbc2a4" : "#e7cfb3";
  ctx.fillRect(0, 0, size, size);
  if (wood) {
    if (surface === "floor") {
      // Wide planks: varied source strips and staggered ends avoid a tiled grid.
      const count = 20;
      const width = size / count;
      for (let i = 0; i < count; i++) {
        const sourceX = (((i * 137) % 800) / 1024) * wood.naturalWidth;
        ctx.drawImage(
          wood,
          sourceX,
          0,
          wood.naturalWidth / count,
          wood.naturalHeight,
          i * width,
          0,
          width,
          size,
        );
        ctx.fillStyle = i % 3 === 0 ? "#fff7e708" : "#6b4b2b06";
        ctx.fillRect(i * width, 0, width, size);
        ctx.strokeStyle = "#785b3b25";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(i * width, 0);
        ctx.lineTo(i * width, size);
        const end = 210 + ((i * 193) % 600);
        ctx.moveTo(i * width, end);
        ctx.lineTo((i + 1) * width, end);
        ctx.stroke();
      }
      ctx.fillStyle = "#79532f0d";
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.save();
      if (surface === "ceiling") {
        ctx.translate(size, 0);
        ctx.rotate(Math.PI / 2);
      }
      ctx.drawImage(wood, 0, 0, size, size);
      ctx.restore();
      // Broad veneer panels, with discreet joints rather than narrow slats.
      ctx.strokeStyle = "#785b3b1c";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      if (surface === "wall") {
        ctx.moveTo(size / 2, 0);
        ctx.lineTo(size / 2, size);
      } else {
        for (const x of [size / 3, (size * 2) / 3]) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
        }
      }
      ctx.stroke();
    }
  }
  const light = ctx.createRadialGradient(
    size * 0.52,
    size * 0.36,
    30,
    size / 2,
    size / 2,
    size * 0.72,
  );
  light.addColorStop(0, "#fff9ed16");
  light.addColorStop(0.6, "#fff9ed04");
  light.addColorStop(1, "#61472e1a");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size, size);
  if (surface === "wall") {
    const edges = ctx.createLinearGradient(0, 0, 0, size);
    edges.addColorStop(0, "#61472e1a");
    edges.addColorStop(0.08, "#61472e00");
    edges.addColorStop(0.88, "#61472e00");
    edges.addColorStop(1, "#61472e20");
    ctx.fillStyle = edges;
    ctx.fillRect(0, 0, size, size);
    const corners = ctx.createLinearGradient(0, 0, size, 0);
    corners.addColorStop(0, "#61472e18");
    corners.addColorStop(0.1, "#61472e00");
    corners.addColorStop(0.9, "#61472e00");
    corners.addColorStop(1, "#61472e10");
    ctx.fillStyle = corners;
    ctx.fillRect(0, 0, size, size);
  }
}

export function createRoomTextures() {
  const wall = canvasTexture(size, (ctx) => paintSurface(ctx, "wall"));
  const floor = canvasTexture(size, (ctx) => paintSurface(ctx, "floor"));
  const ceiling = canvasTexture(size, (ctx) => paintSurface(ctx, "ceiling"));
  const shadow = canvasTexture(256, (ctx) => {
    ctx.shadowColor = "#393127";
    ctx.shadowBlur = 17;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 7;
    ctx.fillStyle = "#393127";
    ctx.fillRect(34, 34, 188, 188);
  });
  return { wall, floor, ceiling, shadow };
}

export function applyRoomWood(
  textures: ReturnType<typeof createRoomTextures>,
  wood: HTMLImageElement,
) {
  for (const surface of ["wall", "floor", "ceiling"] as const) {
    const canvas = textures[surface].image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    paintSurface(ctx, surface, wood);
    textures[surface].needsUpdate = true;
  }
}
