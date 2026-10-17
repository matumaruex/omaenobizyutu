"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { exhibitionSlots, paintingSize, ROOM } from "@/lib/layout";
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
function Architecture() {
  return (
    <group>
      <ambientLight intensity={1.5} />
      <hemisphereLight args={["#ffffff", "#d0cec8", 1.7]} />
      <directionalLight position={[-6, 7, 5]} intensity={2.4} />
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[20.4, 0.2, 20.4]} />
        <meshStandardMaterial color="#e9e8e3" roughness={0.88} />
      </mesh>
      <mesh position={[0, ROOM.height / 2, -10]}>
        <boxGeometry args={[20.4, ROOM.height, 0.2]} />
        <meshStandardMaterial color="#fdfdfb" />
      </mesh>
      <mesh position={[0, ROOM.height / 2, 10]}>
        <boxGeometry args={[20.4, ROOM.height, 0.2]} />
        <meshStandardMaterial color="#fdfdfb" />
      </mesh>
      <mesh position={[-10, ROOM.height / 2, 0]}>
        <boxGeometry args={[0.2, ROOM.height, 20]} />
        <meshStandardMaterial color="#f5f5f2" />
      </mesh>
      <mesh position={[10, ROOM.height / 2, 0]}>
        <boxGeometry args={[0.2, ROOM.height, 20]} />
        <meshStandardMaterial color="#f5f5f2" />
      </mesh>
      <mesh position={[0, ROOM.height, 0]}>
        <boxGeometry args={[20.4, 0.15, 20.4]} />
        <meshStandardMaterial color="#fafaf7" />
      </mesh>
      {/* Shallow reveals make the pure white architecture legible. */}
      {[-9.87, 9.87].map((z) => (
        <mesh key={z} position={[0, 0.05, z]}>
          <boxGeometry args={[20, 0.09, 0.025]} />
          <meshStandardMaterial color="#deded8" />
        </mesh>
      ))}
      {[-9.87, 9.87].map((x) => (
        <mesh key={x} position={[x, 0.05, 0]}>
          <boxGeometry args={[0.025, 0.09, 20]} />
          <meshStandardMaterial color="#deded8" />
        </mesh>
      ))}
      {[-5, 5].map((x) => (
        <group key={x}>
          <mesh position={[x, 5.65, 0]}>
            <boxGeometry args={[0.045, 0.035, 17]} />
            <meshStandardMaterial color="#b7b8b2" />
          </mesh>
          {[-6, 0, 6].map((z) => (
            <mesh key={z} position={[x, 5.56, z]} rotation={[0.25, 0, 0]}>
              <cylinderGeometry args={[0.065, 0.065, 0.19, 12]} />
              <meshStandardMaterial color="#d4d4ce" />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 5.7, -1]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.6, 13]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
      {[-6.65, -3.33, 0, 3.33, 6.65].map((x) => (
        <mesh key={x} position={[x, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.008, 20]} />
          <meshStandardMaterial color="#deddd7" />
        </mesh>
      ))}
      {[-6.65, -3.33, 0, 3.33, 6.65].map((z) => (
        <mesh key={z} position={[0, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[20, 0.008]} />
          <meshStandardMaterial color="#deddd7" />
        </mesh>
      ))}
    </group>
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
      <mesh position={[0.018, -0.03, -0.035]}>
        <boxGeometry args={[width + 0.14, height + 0.14, 0.025]} />
        <meshBasicMaterial
          ref={remember}
          color="#cecec8"
          transparent
          opacity={0}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[width + 0.09, height + 0.09, 0.075]} />
        <meshStandardMaterial
          ref={remember}
          color="#bbb9b1"
          roughness={0.7}
          transparent
          opacity={0}
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
    const look = (dx: number, dy: number) => {
      yaw.current =
        THREE.MathUtils.euclideanModulo(
          yaw.current + dx * 0.0024 + Math.PI,
          Math.PI * 2,
        ) - Math.PI;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + dy * 0.0024,
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
          look(e.clientX - drag.startX, e.clientY - drag.startY);
        } else {
          look(dx, dy);
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
  return (
    <Canvas
      className="room-canvas"
      aria-label={`中央から見回す白い展示室、展示作品${props.exhibits.length}点`}
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
        gl.setClearColor("#f6f6f2");
      }}
    >
      <Architecture />
      <Controls active={props.active} onSelect={props.onSelect} />
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
