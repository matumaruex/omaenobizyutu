"use client";
import { useRef, useState } from "react";
import type { Motion } from "./Room";
export default function Joystick({
  motion,
}: {
  motion: React.RefObject<Motion>;
}) {
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  function update(e: React.PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - box.left - box.width / 2) / 36,
      y = (e.clientY - box.top - box.height / 2) / 36;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }
    motion.current.x = x;
    motion.current.y = y;
    setThumb({ x: x * 29, y: y * 29 });
  }
  function reset() {
    pointer.current = null;
    motion.current.x = 0;
    motion.current.y = 0;
    setThumb({ x: 0, y: 0 });
  }
  return (
    <div
      className="joystick"
      role="group"
      aria-label="移動スティック"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <span
        className="joystick-thumb"
        style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
      />
      <span className="joystick-label">移動</span>
    </div>
  );
}
