"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { exhibitionSlots, paintingSize, ROOM, ROOM_WALLS } from "@/lib/layout";
import { createRoomTextures } from "@/lib/room-materials";
import type { Exhibit } from "@/lib/types";

interface Props {
  exhibits: Exhibit[];
  exhibitionVersion: number;
  fading: boolean;
  active: boolean;
  reducedMotion: boolean;
  lowQuality: boolean;
  onSelect: (id: string) => void;
}
type RoomTextures = ReturnType<typeof createRoomTextures>;
const paintingSlots = exhibitionSlots(ROOM.wallCount);
const wallTints = [
  "#ffffff",
  "#faf9f6",
  "#f6f4ef",
  "#f8f6f1",
  "#fbf9f4",
  "#f9f7f2",
  "#f7f5f0",
  "#fcfbf7",
];
function Architecture({ textures }: { textures: RoomTextures }) {
  const span = ROOM.wallWidth;
  return (
    <group>
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#fff9ed", "#b4afa3", 1.1]} />
      <directionalLight position={[-3, 6, 2]} intensity={1.5} color="#fffcf4" />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry
          args={[ROOM.floorRadius, ROOM.wallCount, Math.PI / ROOM.wallCount]}
        />
        <meshBasicMaterial map={textures.floor} toneMapped={false} />
      </mesh>
      {ROOM_WALLS.map((wall, index) => (
        <group
          key={index}
          position={[...wall.position]}
          rotation={[...wall.rotation]}
        >
          <mesh>
            <planeGeometry args={[span, ROOM.height]} />
            <meshBasicMaterial
              map={textures.wall}
              color={wallTints[index]}
              toneMapped={false}
            />
          </mesh>
          {/* A fine recessed joint grounds the wall without a dark skirting board. */}
          <mesh position={[0, -ROOM.height / 2 + 0.018, 0.004]}>
            <planeGeometry args={[span, 0.022]} />
            <meshBasicMaterial
              color="#aca697"
              transparent
              opacity={0.36}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, -ROOM.height / 2 + 0.05, 0.008]}>
            <planeGeometry args={[span, 0.038]} />
            <meshBasicMaterial color="#eeece3" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, ROOM.height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry
          args={[ROOM.floorRadius, ROOM.wallCount, Math.PI / ROOM.wallCount]}
        />
        <meshBasicMaterial color="#e6e4dc" toneMapped={false} />
      </mesh>
    </group>
  );
}
function Painting({
  exhibit,
  index,
  reducedMotion,
  fading,
  shadow,
}: {
  shadow: THREE.Texture;
  exhibit: Exhibit;
  index: number;
  reducedMotion: boolean;
  fading: boolean;
}) {
  const materials = useRef<THREE.Material[]>([]);
  const texture = useRef<THREE.Texture | null>(null);
  const [loaded, setLoaded] = useState(false);
  const elapsed = useRef(0);
  const size = paintingSize(exhibit.artwork);
  const { width, height } = size;
  const mat = 0.075;
  const rail = 0.026;
  const outerWidth = width + (mat + rail) * 2;
  const outerHeight = height + (mat + rail) * 2;
  const slot = paintingSlots[index];
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
      const target = material.userData.contactShadow ? opacity * 0.2 : opacity;
      material.opacity = fading
        ? Math.max(0, material.opacity - delta / 0.6)
        : target;
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
      <mesh position={[0.02, -0.026, -0.069]}>
        <planeGeometry args={[outerWidth * 1.34, outerHeight * 1.34]} />
        <meshBasicMaterial
          ref={remember}
          userData={{ contactShadow: true }}
          map={shadow}
          color="#6e6253"
          transparent
          opacity={0}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[outerWidth, outerHeight, 0.085]} />
        <meshStandardMaterial
          ref={remember}
          color="#9a8b75"
          roughness={0.85}
          transparent
          opacity={0}
        />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[width + mat * 2, height + mat * 2]} />
        <meshBasicMaterial
          ref={remember}
          color="#f7f4eb"
          transparent
          opacity={0}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0.002, -0.003, 0.034]}>
        <planeGeometry args={[width + 0.015, height + 0.015]} />
        <meshBasicMaterial
          ref={remember}
          color="#b8b0a0"
          transparent
          opacity={0}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.041]} userData={{ artworkId: exhibit.id }}>
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
    const pointers = new Set<number>();
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
    const look = (dx: number, dy: number, pointerType: string) => {
      yaw.current =
        THREE.MathUtils.euclideanModulo(
          yaw.current + dx * 0.0024 + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
      pitch.current = THREE.MathUtils.clamp(
        // Keep horizontal swipes steady despite incidental vertical finger drift.
        pitch.current + dy * (pointerType === "touch" ? 0.0006 : 0.0024),
        -ROOM.lookLimit,
        ROOM.lookLimit,
      );
      camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    };
    const down = (e: PointerEvent) => {
      if (!activeRef.current || (e.pointerType === "mouse" && e.button !== 0))
        return;
      pointers.add(e.pointerId);
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size > 1) {
        drag = null;
        return;
      }
      drag = {
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        lastX: e.clientX,
        lastY: e.clientY,
        distance: 0,
        pointerId: e.pointerId,
      };
    };
    const move = (e: PointerEvent) => {
      if (!activeRef.current) return;
      if (pointers.size === 1 && drag && drag.pointerId === e.pointerId) {
        const dx = e.clientX - drag.lastX,
          dy = e.clientY - drag.lastY;
        drag.distance += Math.abs(dx) + Math.abs(dy);
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        if (!drag.moved) {
          if (drag.distance < 8) return;
          drag.moved = true;
          look(e.clientX - drag.startX, e.clientY - drag.startY, e.pointerType);
        } else {
          look(dx, dy, e.pointerType);
        }
      }
    };
    const up = (e: PointerEvent) => {
      const tap =
        activeRef.current &&
        pointers.size === 1 &&
        drag?.pointerId === e.pointerId &&
        !drag.moved;
      pointers.delete(e.pointerId);
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
      const ids = [...pointers];
      pointers.clear();
      ids.forEach((id) => {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      });
    };
    const cancelled = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) clear();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancelled);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    canvas.addEventListener("lostpointercapture", cancelled);
    return () => {
      clear();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancelled);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      canvas.removeEventListener("lostpointercapture", cancelled);
    };
  }, [active, camera, gl, scene, onSelect]);
  useFrame((_, delta) => {
    if (!active) return;
    const pressed = (code: string) => (keys.current.has(code) ? 1 : 0);
    const step = Math.min(delta, 0.05) * 0.9;
    yaw.current += (pressed("ArrowLeft") - pressed("ArrowRight")) * step;
    pitch.current = THREE.MathUtils.clamp(
      pitch.current + (pressed("ArrowUp") - pressed("ArrowDown")) * step,
      -ROOM.lookLimit,
      ROOM.lookLimit,
    );
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
  });
  return null;
}
export default function Room(props: Props) {
  const textures = useMemo(createRoomTextures, []);
  useEffect(
    () => () => Object.values(textures).forEach((t) => t.dispose()),
    [textures],
  );
  return (
    <Canvas
      className="room-canvas"
      aria-label={`中央から見回す八角形の展示室、展示作品${props.exhibits.length}点`}
      camera={{
        position: [0, ROOM.eye, 0],
        rotation: [0, 0, 0],
        fov: ROOM.fov,
        near: 0.1,
        far: 65,
      }}
      dpr={props.lowQuality ? [1, 1.5] : [1, 1.7]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#f4f1e9");
      }}
    >
      <Architecture textures={textures} />
      <Controls active={props.active} onSelect={props.onSelect} />
      {props.exhibits.map((exhibit, index) => (
        <Painting
          key={`${props.exhibitionVersion}:${exhibit.id}`}
          exhibit={exhibit}
          index={index}
          reducedMotion={props.reducedMotion}
          fading={props.fading}
          shadow={textures.shadow}
        />
      ))}
    </Canvas>
  );
}
