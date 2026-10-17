"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { exhibitionSlots, paintingSize, SPHERE } from "@/lib/layout";
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
      <sphereGeometry args={[30, 48, 32]} />
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
    <group position={slot.position} rotation={[...slot.rotation, "YXZ"]}>
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
function Controls({
  active,
  onSelect,
}: Omit<
  Props,
  "exhibits" | "reducedMotion" | "lowQuality" | "exhibitionVersion" | "fading"
>) {
  const { camera, gl, scene } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (!active) {
      keys.current.clear();
    }
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    let drag: {
      startX: number;
      startY: number;
      moved: boolean;
      lastX: number;
      lastY: number;
      distance: number;
      pointerId: number;
    } | null = null;
    const select = (x: number, y: number) => {
      const bounds = canvas.getBoundingClientRect();
      const point = new THREE.Vector2(
        ((x - bounds.left) / bounds.width) * 2 - 1,
        (-(y - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(point, camera);
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find(
          (i) =>
            i.object.userData.artworkId &&
            (i.object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>)
              .material.opacity > 0.25,
        );
      if (hit) {
        onSelect(hit.object.userData.artworkId);
        return true;
      }
      return false;
    };
    const look = (dx: number, dy: number) => {
      yaw.current =
        THREE.MathUtils.euclideanModulo(
          yaw.current + dx * 0.0024 + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + dy * 0.0024,
        -SPHERE.lookLimit,
        SPHERE.lookLimit,
      );
      camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    };
    const down = (e: PointerEvent) => {
      if (!activeRef.current || drag) return;
      drag = {
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        lastX: e.clientX,
        lastY: e.clientY,
        distance: 0,
        pointerId: e.pointerId,
      };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!activeRef.current) return;
      if (drag && drag.pointerId === e.pointerId) {
        const dx = e.clientX - drag.lastX,
          dy = e.clientY - drag.lastY;
        drag.distance += Math.abs(dx) + Math.abs(dy);
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        if (!drag.moved) {
          if (drag.distance < 8) return;
          drag.moved = true;
          look(e.clientX - drag.startX, e.clientY - drag.startY);
        } else {
          look(dx, dy);
        }
      }
    };
    const up = (e: PointerEvent) => {
      if (!activeRef.current || !drag || drag.pointerId !== e.pointerId) return;
      const tap = !drag.moved;
      drag = null;
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      if (tap) select(e.clientX, e.clientY);
    };
    const keydown = (e: KeyboardEvent) => {
      if (
        !activeRef.current ||
        (e.target as HTMLElement)?.matches("textarea,input,select")
      )
        return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
    };
    const clear = () => {
      keys.current.clear();
      drag = null;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", clear);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    canvas.addEventListener("lostpointercapture", clear);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", clear);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      canvas.removeEventListener("lostpointercapture", clear);
    };
  }, [active, camera, gl, scene, onSelect]);
  useFrame((_, delta) => {
    if (!active) return;
    const pressed = (code: string) => (keys.current.has(code) ? 1 : 0);
    const step = Math.min(delta, 0.05) * 0.9;
    yaw.current += (pressed("ArrowLeft") - pressed("ArrowRight")) * step;
    pitch.current = THREE.MathUtils.clamp(
      pitch.current + (pressed("ArrowUp") - pressed("ArrowDown")) * step,
      -SPHERE.lookLimit,
      SPHERE.lookLimit,
    );
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
  });
  return null;
}
export default function Room(props: Props) {
  return (
    <Canvas
      className="room-canvas"
      aria-label={`球状の3D空間、展示作品${props.exhibits.length}点`}
      camera={{
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        fov: 68,
        near: 0.1,
        far: 65,
      }}
      dpr={props.lowQuality ? 1 : [1, 1.7]}
      gl={{ antialias: !props.lowQuality, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#eeedf5");
      }}
    >
      <DreamSky />
      <Controls {...props} />
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
