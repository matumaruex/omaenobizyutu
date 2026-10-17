"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  exhibitionSlots,
  paintingSize,
  fieldOverview,
  FIELD,
} from "@/lib/layout";
import type { Exhibit } from "@/lib/types";

interface Props {
  exhibits: Exhibit[];
  exhibitionVersion: number;
  fading: boolean;
  active: boolean;
  reducedMotion: boolean;
  lowQuality: boolean;
  onSelect: (id: number) => void;
}
// A continuous, inward-facing sky: no floor, horizon, walls or visual grid.
// The material uses only direction, so it stays still while the viewer looks around.
const skyVertex = `
  varying vec3 direction;
  void main() {
    direction = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFragment = `
  varying vec3 direction;
  float haze(vec3 p) {
    return sin(p.x * 1.6 + sin(p.z * 1.3)) *
      cos(p.y * 1.8 - sin(p.x * 1.2)) * .5 + .5;
  }
  void main() {
    vec3 d = normalize(direction);
    float cloud = haze(d * 2.4) * .65 + haze(d * 5.2 + 4.0) * .35;
    vec3 lavender = vec3(.72, .72, .86);
    vec3 pearl = vec3(.965, .958, .95);
    vec3 color = mix(lavender, pearl, smoothstep(.12, .9, cloud));
    float mint = pow(max(0.0, dot(d, normalize(vec3(-.8, -.4, -.6)))), 3.0);
    color = mix(color, vec3(.85, .93, .91), mint * .5);
    float glow = pow(max(0.0, dot(d, normalize(vec3(.5, .7, -.8)))), 5.0);
    color = mix(color, vec3(1.0, .97, .94), glow * .75);
    float veil = pow(.5 + .5 * sin(d.y * 4.0 + d.x * 2.0 + cloud), 16.0);
    color = mix(color, vec3(.98, .975, 1.0), veil * .22);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
function DreamSky() {
  return (
    <mesh>
      <sphereGeometry args={[150, 48, 32]} />
      <shaderMaterial
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
function Painting({
  exhibit,
  index,
  reducedMotion,
  fading,
}: {
  exhibit: Exhibit;
  index: number;
  reducedMotion: boolean;
  fading: boolean;
}) {
  const materials = useRef<THREE.Material[]>([]);
  const texture = useRef<THREE.Texture | null>(null);
  const [loaded, setLoaded] = useState(false);
  const elapsed = useRef(0);
  const { width, height } = paintingSize(exhibit.artwork);
  const slot = exhibitionSlots(12)[index];
  useEffect(() => {
    // Reuse the already decoded image from the bounded preload queue.
    // Creating a GPU texture does not start another network request.
    const tex = new THREE.Texture(exhibit.image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    texture.current = tex;
    setLoaded(true);
    return () => {
      tex.dispose();
      texture.current = null;
    };
  }, [exhibit.image]);
  useFrame((_, delta) => {
    if (!loaded) return;
    elapsed.current += Math.min(delta, 0.1);
    const opacity = reducedMotion
      ? 1
      : THREE.MathUtils.smoothstep(elapsed.current - index * 0.22, 0, 1.9);
    materials.current.forEach((material) => {
      material.opacity = fading
        ? Math.max(0, material.opacity - delta / 0.6)
        : opacity;
      material.depthWrite = material.opacity > 0.98;
    });
  });
  if (!loaded || !texture.current) return null;
  const remember = (material: THREE.Material | null) => {
    if (material && !materials.current.includes(material))
      materials.current.push(material);
  };
  return (
    <group position={slot.position} rotation={slot.rotation}>
      <mesh position={[0, 0, 0]} userData={{ artworkId: exhibit.id }}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          ref={remember}
          map={texture.current}
          transparent
          opacity={0}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
interface Point {
  x: number;
  y: number;
}
function Controls({
  active,
  onSelect,
  count,
}: {
  active: boolean;
  onSelect: Props["onSelect"];
  count: number;
}) {
  const { camera, gl, scene, size } = useThree();
  const previous = useRef<{
    count: number;
    aspect: number;
    overview: ReturnType<typeof fieldOverview>;
  } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const overview = fieldOverview(count, size.width / size.height);
  const bounds = useRef(overview);
  bounds.current = overview;
  useEffect(() => {
    const next = fieldOverview(count, size.width / size.height);
    const old = previous.current;
    if (!old || (old.count === 0 && count > 0)) {
      camera.position.set(next.x, next.y, next.z);
    } else if (old.aspect !== size.width / size.height) {
      const scale = next.z / old.overview.z;
      camera.position.set(
        next.x + (camera.position.x - old.overview.x) * scale,
        next.y + (camera.position.y - old.overview.y) * scale,
        THREE.MathUtils.clamp(
          camera.position.z * scale,
          FIELD.nearest,
          next.z * 1.1,
        ),
      );
    }
    if (old && old.count !== count && count > 0) {
      camera.position.z = Math.min(camera.position.z, next.z * 1.1);
      camera.updateMatrixWorld();
      const visible = exhibitionSlots(count).some((slot) => {
        const p = new THREE.Vector3(...slot.position).project(camera);
        return Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.84;
      });
      if (!visible) camera.position.set(next.x, next.y, next.z);
    }
    camera.updateMatrixWorld();
    previous.current = {
      count,
      aspect: size.width / size.height,
      overview: next,
    };
  }, [camera, count, size.width, size.height]);
  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement;
    const points = new Map<number, Point>();
    const raycaster = new THREE.Raycaster();
    let start: Point | null = null,
      last: Point | null = null;
    let lastDistance = 0,
      moved = false,
      multiple = false;
    const rect = () => canvas.getBoundingClientRect();
    const viewSize = () => {
      const r = rect(),
        height = 2 * Math.tan((FIELD.fov * Math.PI) / 360) * camera.position.z;
      return { width: (height * r.width) / r.height, height };
    };
    const constrain = () => {
      const b = bounds.current,
        v = viewSize();
      const x = Math.max(0, b.halfWidth - v.width * 0.35),
        y = Math.max(0, b.halfHeight - v.height * 0.35);
      camera.position.x = THREE.MathUtils.clamp(
        camera.position.x,
        b.x - x,
        b.x + x,
      );
      camera.position.y = THREE.MathUtils.clamp(
        camera.position.y,
        b.y - y,
        b.y + y,
      );
      camera.updateMatrixWorld();
    };
    const pan = (dx: number, dy: number) => {
      const r = rect(),
        v = viewSize();
      camera.position.x -= (dx / r.width) * v.width;
      camera.position.y += (dy / r.height) * v.height;
      constrain();
    };
    // Keep the point between the fingers beneath their midpoint while zooming.
    const zoom = (factor: number, from: Point, to = from) => {
      const r = rect(),
        before = viewSize();
      const nx = (p: Point) => (p.x - r.left) / r.width - 0.5;
      const ny = (p: Point) => 0.5 - (p.y - r.top) / r.height;
      const wx = camera.position.x + nx(from) * before.width;
      const wy = camera.position.y + ny(from) * before.height;
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z * factor,
        FIELD.nearest,
        bounds.current.z * 1.1,
      );
      const after = viewSize();
      camera.position.x = wx - nx(to) * after.width;
      camera.position.y = wy - ny(to) * after.height;
      constrain();
    };
    const select = (p: Point) => {
      const r = rect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((p.x - r.left) / r.width) * 2 - 1,
          (-(p.y - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find(
          (i) =>
            i.object.userData.artworkId &&
            (i.object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>)
              .material.opacity > 0.25,
        );
      if (hit) onSelect(hit.object.userData.artworkId);
    };
    const pair = () => {
      const [a, b] = [...points.values()];
      return {
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
    };
    const down = (e: PointerEvent) => {
      if (
        !activeRef.current ||
        (e.pointerType === "mouse" && e.button !== 0) ||
        points.size >= 2
      )
        return;
      const p = { x: e.clientX, y: e.clientY };
      points.set(e.pointerId, p);
      canvas.setPointerCapture(e.pointerId);
      if (points.size === 1) {
        start = last = p;
        moved = false;
        multiple = false;
      } else {
        multiple = moved = true;
        const p = pair();
        last = p.midpoint;
        lastDistance = p.distance;
      }
    };
    const move = (e: PointerEvent) => {
      if (!activeRef.current || !points.has(e.pointerId)) return;
      const p = { x: e.clientX, y: e.clientY };
      points.set(e.pointerId, p);
      if (points.size === 2) {
        const next = pair();
        if (last && lastDistance > 1 && next.distance > 1)
          zoom(lastDistance / next.distance, last, next.midpoint);
        last = next.midpoint;
        lastDistance = next.distance;
      } else if (start && last) {
        if (!moved) {
          if (Math.hypot(p.x - start.x, p.y - start.y) < 8) return;
          moved = true;
          pan(p.x - start.x, p.y - start.y);
        } else pan(p.x - last.x, p.y - last.y);
        last = p;
      }
    };
    const up = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      const tap = !moved && !multiple && points.size === 1;
      points.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      if (points.size) {
        start = last = [...points.values()][0];
        moved = true;
      } else {
        start = last = null;
        lastDistance = 0;
      }
      if (tap && activeRef.current) select({ x: e.clientX, y: e.clientY });
    };
    const cancel = (e: PointerEvent) => {
      if (!points.delete(e.pointerId)) return;
      start = last = [...points.values()][0] ?? null;
      moved = true;
      multiple = true;
      lastDistance = 0;
    };
    const clear = () => {
      const ids = [...points.keys()];
      points.clear();
      start = last = null;
      moved = multiple = false;
      lastDistance = 0;
      ids.forEach((id) => {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      });
    };
    const wheel = (e: WheelEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      const delta =
        e.deltaY *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect().height : 1);
      zoom(Math.exp(THREE.MathUtils.clamp(delta, -150, 150) * 0.002), {
        x: e.clientX,
        y: e.clientY,
      });
    };
    const keydown = (e: KeyboardEvent) => {
      if (
        !activeRef.current ||
        (e.target as HTMLElement)?.matches("textarea,input,select")
      )
        return;
      const r = rect(),
        center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "+",
          "=",
          "-",
          "0",
        ].includes(e.key)
      )
        e.preventDefault();
      if (e.key === "ArrowLeft") pan(42, 0);
      if (e.key === "ArrowRight") pan(-42, 0);
      if (e.key === "ArrowUp") pan(0, 42);
      if (e.key === "ArrowDown") pan(0, -42);
      if (e.key === "+" || e.key === "=") zoom(0.85, center);
      if (e.key === "-") zoom(1.15, center);
      if (e.key === "0") {
        const b = bounds.current;
        camera.position.set(b.x, b.y, b.z);
      }
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    canvas.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", keydown);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      clear();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [active, camera, gl, scene, onSelect]);
  return null;
}
export default function Room(props: Props) {
  return (
    <Canvas
      className="room-canvas"
      aria-label={`霧の中の絵の空間、展示作品${props.exhibits.length}点`}
      camera={{
        position: [0, 0, 20],
        rotation: [0, 0, 0],
        fov: FIELD.fov,
        near: 0.1,
        far: 400,
      }}
      dpr={props.lowQuality ? [1, 1.5] : [1, 1.7]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#eeedf5");
      }}
    >
      <DreamSky />
      <Controls
        active={props.active}
        onSelect={props.onSelect}
        count={props.exhibits.length}
      />
      {props.exhibits.map((exhibit, index) => (
        <Painting
          key={`${props.exhibitionVersion}:${exhibit.id}`}
          exhibit={exhibit}
          index={index}
          reducedMotion={props.reducedMotion}
          fading={props.fading}
        />
      ))}
    </Canvas>
  );
}
