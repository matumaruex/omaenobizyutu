"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  constrainPosition,
  exhibitionSlots,
  paintingSize,
  ROOM,
} from "@/lib/layout";
import type { Exhibit } from "@/lib/types";

export interface Motion {
  x: number;
  y: number;
}
interface Props {
  exhibits: Exhibit[];
  exhibitionVersion: number;
  fading: boolean;
  active: boolean;
  reducedMotion: boolean;
  lowQuality: boolean;
  joystick: React.RefObject<Motion>;
  onSelect: (id: number) => void;
  onPosition?: (x: number, z: number) => void;
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
      <mesh position={[width / 2 - 0.16, -height / 2 - 0.19, 0]}>
        <planeGeometry args={[0.3, 0.085]} />
        <meshBasicMaterial
          ref={remember}
          color="#e4e3de"
          transparent
          opacity={0}
        />
      </mesh>
    </group>
  );
}
function Controls({
  active,
  joystick,
  onSelect,
  onPosition,
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
  const lastReport = useRef(0);
  const wasMoving = useRef(false);
  useEffect(() => {
    if (!active) {
      keys.current.clear();
      joystick.current.x = 0;
      joystick.current.y = 0;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }, [active, joystick]);
  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    let drag: {
      x: number;
      y: number;
      lastX: number;
      lastY: number;
      distance: number;
      pointerType: string;
    } | null = null;
    const select = (x: number, y: number) => {
      const bounds = canvas.getBoundingClientRect();
      const point =
        document.pointerLockElement === canvas
          ? new THREE.Vector2(0, 0)
          : new THREE.Vector2(
              ((x - bounds.left) / bounds.width) * 2 - 1,
              (-(y - bounds.top) / bounds.height) * 2 + 1,
            );
      raycaster.setFromCamera(point, camera);
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find((i) => i.object.userData.artworkId && i.distance < 24);
      if (hit) {
        onSelect(hit.object.userData.artworkId);
        return true;
      }
      return false;
    };
    const look = (dx: number, dy: number) => {
      yaw.current += dx * 0.0024;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current + dy * 0.0024,
        -1.15,
        1.15,
      );
      camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    };
    const down = (e: PointerEvent) => {
      if (!activeRef.current) return;
      drag = {
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        distance: 0,
        pointerType: e.pointerType,
      };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!activeRef.current) return;
      if (document.pointerLockElement === canvas)
        look(e.movementX, e.movementY);
      else if (drag) {
        const dx = e.clientX - drag.lastX,
          dy = e.clientY - drag.lastY;
        drag.distance += Math.abs(dx) + Math.abs(dy);
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        look(dx, dy);
      }
    };
    const up = (e: PointerEvent) => {
      if (!activeRef.current || !drag) return;
      const tap = drag.distance < 8;
      const mouse = drag.pointerType === "mouse";
      drag = null;
      if (
        tap &&
        !select(e.clientX, e.clientY) &&
        mouse &&
        !document.pointerLockElement
      ) {
        try {
          canvas.requestPointerLock()?.catch(() => {});
        } catch {
          /* Drag look remains available. */
        }
      }
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.code === "Escape" && document.pointerLockElement === canvas) {
        document.exitPointerLock();
        keys.current.clear();
        return;
      }
      if (
        !activeRef.current ||
        (e.target as HTMLElement)?.matches("textarea,input,select")
      )
        return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      onPosition?.(camera.position.x, camera.position.z);
    };
    const clear = () => {
      keys.current.clear();
      drag = null;
      joystick.current.x = 0;
      joystick.current.y = 0;
    };
    const lock = () => {
      if (!document.pointerLockElement) clear();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", clear);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    document.addEventListener("pointerlockchange", lock);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", clear);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      document.removeEventListener("pointerlockchange", lock);
    };
  }, [camera, gl, scene, onSelect, onPosition, joystick]);
  useFrame((state, delta) => {
    if (!active) return;
    const pressed = (codes: string[]) =>
      codes.some((k) => keys.current.has(k)) ? 1 : 0;
    let x =
      pressed(["KeyD", "ArrowRight"]) -
      pressed(["KeyA", "ArrowLeft"]) +
      joystick.current.x;
    let z =
      pressed(["KeyS", "ArrowDown"]) -
      pressed(["KeyW", "ArrowUp"]) +
      joystick.current.y;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    const speed = Math.min(delta, 0.05) * 3;
    const [nextX, nextZ] = constrainPosition(
      camera.position.x +
        (x * Math.cos(yaw.current) + z * Math.sin(yaw.current)) * speed,
      camera.position.z +
        (-x * Math.sin(yaw.current) + z * Math.cos(yaw.current)) * speed,
    );
    camera.position.set(nextX, ROOM.eye, nextZ);
    if (
      state.clock.elapsedTime - lastReport.current > 0.3 ||
      (wasMoving.current && length === 0)
    ) {
      onPosition?.(nextX, nextZ);
      lastReport.current = state.clock.elapsedTime;
    }
    wasMoving.current = length > 0;
  });
  return null;
}
export default function Room(props: Props) {
  return (
    <Canvas
      className="room-canvas"
      aria-label={`白い3D展示室、展示作品${props.exhibits.length}点`}
      camera={{
        position: [0, ROOM.eye, 7.2],
        rotation: [0, 0, 0],
        fov: 64,
        near: 0.1,
        far: 65,
      }}
      dpr={props.lowQuality ? 1 : [1, 1.7]}
      gl={{ antialias: !props.lowQuality, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#f6f6f2");
      }}
    >
      <Architecture />
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
