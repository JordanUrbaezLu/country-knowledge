import { useEffect, useState } from "react";
import type { ActiveQuestion } from "./useRoom";

/** Local countdown anchored to the server-synced remaining time at receipt. */
export function useCountdown(q: ActiveQuestion | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!q) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [q]);

  if (!q) return { secondsLeft: 0, fraction: 0, expired: true };
  const endsAt = q.receivedAt + q.remainingMs;
  const remaining = Math.max(0, endsAt - now);
  const fraction = q.durationMs > 0 ? Math.min(1, remaining / q.durationMs) : 0;
  return { secondsLeft: Math.ceil(remaining / 1000), fraction, expired: remaining <= 0 };
}

export function TimerRing({
  fraction,
  secondsLeft,
}: {
  fraction: number;
  secondsLeft: number;
}) {
  const R = 18;
  const C = 2 * Math.PI * R;
  const urgent = secondsLeft <= 5;
  const color = urgent ? "#fb7185" : "#38bdf8";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className={urgent ? "animate-pulse" : ""}>
      <circle cx="22" cy="22" r={R} stroke="rgba(255,255,255,.15)" strokeWidth="4" fill="none" />
      <circle
        cx="22"
        cy="22"
        r={R}
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - fraction)}
        transform="rotate(-90 22 22)"
        style={{ transition: "stroke-dashoffset .15s linear" }}
      />
      <text x="22" y="27" textAnchor="middle" fontSize="15" fontWeight="700" fill="#e8edf6">
        {secondsLeft}
      </text>
    </svg>
  );
}
