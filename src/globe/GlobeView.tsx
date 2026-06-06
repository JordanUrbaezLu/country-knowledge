import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import type { StateFeature } from "../data/states";
import type { Country, CountryFeature } from "../data/types";
import { pointInGeometry } from "../lib/geo";

export interface GlobeViewProps {
  countries: Country[];
  /** country to "light up" (game). When set, all others dim. */
  highlightId?: string | null;
  /** currently selected country (explore). */
  selectedId?: string | null;
  /** show name tooltip on country hover. Disable in the locate game. */
  showLabels?: boolean;
  /** idle spin. */
  autoRotate?: boolean;
  /** rotate the camera to this point when it changes. */
  focus?: { lat: number; lng: number } | null;
  /** map a trackpad two-finger swipe to rotation (pinch still zooms). */
  trackpadRotate?: boolean;
  /** state/province polygons for the selected country (overlaid + hoverable). */
  stateFeatures?: StateFeature[] | null;
  /**
   * Show a crosshair at a fixed point on the screen; whatever country/state is
   * beneath it is continuously highlighted and named. Designed for touch devices
   * where there is no hover cursor.
   */
  crosshair?: boolean;
  onCountryClick?: (country: Country) => void;
  onCountryHover?: (country: Country | null) => void;
  onStateClick?: (state: StateFeature) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const COLORS = {
  land: "rgba(56, 89, 148, 0.65)",
  landDim: "rgba(38, 56, 92, 0.4)",
  hover: "rgba(125, 170, 224, 0.92)",
  selected: "#3b6bb0",
  highlight: "#f59e0b",
  stateFill: "#3f6699",
  stateFillHover: "rgba(255, 210, 74, 0.55)",
  stateStroke: "#ffd24a",
};

const isState = (o: object): o is StateFeature => (o as StateFeature).__kind === "state";

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

export default function GlobeView({
  countries,
  highlightId = null,
  selectedId = null,
  showLabels = true,
  autoRotate = false,
  focus = null,
  trackpadRotate = true,
  stateFeatures = null,
  crosshair = false,
  onCountryClick,
  onCountryHover,
  onStateClick,
}: GlobeViewProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const crosshairRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [crosshairName, setCrosshairName] = useState<string | null>(null);
  const ready = size.width > 0 && size.height > 0;

  const idToCountry = useMemo(() => new Map(countries.map((c) => [c.id, c])), [countries]);

  const polygons = useMemo<object[]>(() => {
    if (stateFeatures && stateFeatures.length) {
      return [
        ...countries.filter((c) => c.id !== selectedId).map((c) => c.feature),
        ...stateFeatures,
      ];
    }
    return countries.map((c) => c.feature);
  }, [countries, stateFeatures, selectedId]);

  const globeMaterial = useMemo(
    () => new THREE.MeshPhongMaterial({ color: "#0b1b34", shininess: 6 }),
    [],
  );

  const capColor = (obj: object): string => {
    if (isState(obj)) {
      return obj.__id === hoveredId ? COLORS.stateFillHover : COLORS.stateFill;
    }
    const id = (obj as CountryFeature).__id;
    if (id === highlightId) return COLORS.highlight;
    if (id === selectedId) return COLORS.selected;
    if (id === hoveredId) return COLORS.hover;
    return highlightId ? COLORS.landDim : COLORS.land;
  };

  const sideColor = (obj: object): string => {
    if (isState(obj)) return obj.__id === hoveredId ? "rgba(255, 210, 74, 0.4)" : "rgba(0,0,0,0)";
    return "rgba(15, 30, 60, 0.7)";
  };

  const strokeColor = (obj: object): string =>
    isState(obj) ? COLORS.stateStroke : "#86b0e8";

  const altitude = (obj: object): number => {
    if (isState(obj)) return obj.__id === hoveredId ? 0.03 : 0.012;
    const id = (obj as CountryFeature).__id;
    if (id === highlightId) return 0.06;
    if (id === hoveredId || id === selectedId) return 0.02;
    return 0.01;
  };

  const label = (obj: object): string => {
    // On mobile/crosshair mode we suppress globe.gl's floating tooltip — the
    // crosshair overlay shows the name instead.
    if (crosshair) return "";
    if (isState(obj)) {
      return `<div style="background:rgba(60,40,5,.92);color:#ffd24a;padding:4px 8px;border-radius:6px;font:600 13px system-ui;border:1px solid rgba(255,210,74,.5)">${obj.__name}</div>`;
    }
    if (!showLabels) return "";
    const c = idToCountry.get((obj as CountryFeature).__id);
    return c
      ? `<div style="background:rgba(5,7,15,.85);color:#e8edf6;padding:4px 8px;border-radius:6px;font:600 13px system-ui;border:1px solid rgba(125,170,224,.4)">${c.name}</div>`
      : "";
  };

  const handleClick = (obj: object) => {
    if (isState(obj)) { onStateClick?.(obj); return; }
    const c = idToCountry.get((obj as CountryFeature).__id);
    if (c) onCountryClick?.(c);
  };

  const handleHover = (obj: object | null) => {
    // On crosshair mode the poll loop drives hoveredId; ignore globe.gl mouse events.
    if (crosshair) return;
    if (obj && isState(obj)) { setHoveredId(obj.__id); onCountryHover?.(null); return; }
    const id = obj ? (obj as CountryFeature).__id : null;
    setHoveredId(id);
    onCountryHover?.(id ? (idToCountry.get(id) ?? null) : null);
  };

  // Orbit controls setup.
  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controls = globeRef.current?.controls() as any;
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.6;
    controls.enableZoom = true;
    controls.minDistance = 104;
    controls.maxDistance = 600;
  }, [autoRotate, ready]);

  useEffect(() => {
    if (ready) globeRef.current?.pointOfView({ lat: 20, lng: 0, altitude: 2.3 });
  }, [ready]);

  useEffect(() => {
    if (ready && focus) {
      globeRef.current?.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.6 }, 800);
    }
  }, [focus, ready]);

  // Trackpad two-finger → rotate.
  useEffect(() => {
    const container = containerRef.current;
    if (!ready || !trackpadRotate || !container) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const g = globeRef.current;
      if (!g) return;
      const pov = g.pointOfView();
      const k = 0.22;
      g.pointOfView(
        { lat: clamp(pov.lat - e.deltaY * k, -85, 85), lng: pov.lng + e.deltaX * k, altitude: pov.altitude },
        0,
      );
    };
    container.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => container.removeEventListener("wheel", onWheel, { capture: true });
  }, [ready, trackpadRotate, containerRef]);

  /**
   * Crosshair polling loop — runs at ~8 fps to detect what's under the
   * crosshair element and drive hoveredId + crosshairName.
   *
   * Uses globe.gl's coordinate helpers:
   *   toGlobeCoords(screenX, screenY) → {x,y,z} on globe surface or null
   *   toGeoCoords({x,y,z})            → {lat, lng, altitude}
   * Then performs a point-in-polygon test against the active feature set.
   */
  useEffect(() => {
    if (!crosshair || !ready) return;
    let raf: number;
    let last = 0;
    const INTERVAL = 120; // ms

    const poll = (ts: number) => {
      raf = requestAnimationFrame(poll);
      if (ts - last < INTERVAL) return;
      last = ts;

      const gl = globeRef.current;
      const crosshairEl = crosshairRef.current;
      const containerEl = containerRef.current;
      if (!gl || !crosshairEl || !containerEl) return;

      // Screen position of the crosshair centre, relative to the canvas.
      const chRect = crosshairEl.getBoundingClientRect();
      const cRect = containerEl.getBoundingClientRect();
      const cx = chRect.left + chRect.width / 2 - cRect.left;
      const cy = chRect.top + chRect.height / 2 - cRect.top;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const glAny = gl as any;
      const globeXYZ = glAny.toGlobeCoords?.(cx, cy);
      if (!globeXYZ) {
        setHoveredId(null);
        setCrosshairName(null);
        return;
      }

      const { lat, lng } = (glAny.toGeoCoords?.(globeXYZ) ?? {}) as { lat: number; lng: number };
      if (lat == null || lng == null) return;

      // Check state features first (they're on top of the selected country).
      if (stateFeatures && stateFeatures.length) {
        for (const sf of stateFeatures) {
          if (pointInGeometry(lng, lat, sf.geometry)) {
            setHoveredId(sf.__id);
            setCrosshairName(sf.__name);
            return;
          }
        }
      }

      // Then check country features.
      for (const c of countries) {
        if (pointInGeometry(lng, lat, c.feature.geometry)) {
          setHoveredId(c.id);
          setCrosshairName(c.name);
          onCountryHover?.(c);
          return;
        }
      }

      setHoveredId(null);
      setCrosshairName(null);
      onCountryHover?.(null);
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [crosshair, ready, countries, stateFeatures, onCountryHover, containerRef]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {ready && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="#05070f"
          globeMaterial={globeMaterial}
          showAtmosphere
          atmosphereColor="#5b8bd0"
          atmosphereAltitude={0.16}
          polygonsData={polygons}
          polygonCapColor={capColor}
          polygonSideColor={sideColor}
          polygonStrokeColor={strokeColor}
          polygonAltitude={altitude}
          polygonLabel={label}
          polygonsTransitionDuration={300}
          onPolygonClick={handleClick}
          onPolygonHover={handleHover}
        />
      )}

      {/* Crosshair overlay — mobile only, driven by the poll loop above */}
      {crosshair && ready && (
        <div
          ref={crosshairRef}
          className="pointer-events-none absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2"
        >
          {/* The + arms */}
          <div className="relative flex h-10 w-10 items-center justify-center">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/50" />
            <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-white/50" />
            {/* Centre dot */}
            <div className="h-1.5 w-1.5 rounded-full bg-white/80" />
          </div>
          {/* Country/state name label */}
          {crosshairName && (
            <div className="mt-2 whitespace-nowrap rounded-full border border-white/20 bg-slate-900/80 px-3 py-1 text-center text-sm font-semibold text-slate-100 backdrop-blur">
              {crosshairName}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
