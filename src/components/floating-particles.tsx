"use client";

import { useEffect, useState } from "react";

type Particle = {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  hue: string;
};

const HUES = ["#ffb37b", "#c8b6ff", "#a0e7e5", "#ffd6a5"];

/**
 * Ambient drifting "firefly" particles used behind the login/journal pages.
 * Purely decorative, aria-hidden, and generated client-side only (after
 * mount) so server and client markup match on the initial render — no
 * hydration mismatch from randomized values.
 */
export function FloatingParticles({ count = 14 }: { count?: number }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // One-time randomized layout generated after mount; empty on the server
    // render so there's nothing for hydration to mismatch against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParticles(
      Array.from({ length: count }, (_, id) => ({
        id,
        left: Math.random() * 100,
        size: 4 + Math.random() * 6,
        duration: 14 + Math.random() * 12,
        delay: Math.random() * 14,
        drift: (Math.random() - 0.5) * 80,
        hue: HUES[id % HUES.length],
      }))
    );
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute bottom-0 rounded-full blur-[1px]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.hue,
              animation: `drift-up ${p.duration}s ease-in-out ${p.delay}s infinite`,
              "--particle-drift": `${p.drift}px`,
              "--particle-opacity": 0.45,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
