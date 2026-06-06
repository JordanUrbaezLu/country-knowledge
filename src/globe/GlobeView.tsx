import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import type { StateFeature } from "../data/states";
import type { Country, CountryFeature } from "../data/types";

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
  stateFill: "#3f6699", // solid country fill, subdivided by amber borders
  stateFillHover: "rgba(255, 210, 74, 0.55)",
  stateStroke: "#ffd24a",
};

const isState = (o: object): o is StateFeature => (o as StateFeature).__kind === "state";

/** Track an element's pixel size so the canvas fills its container responsively. */
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
  onCountryClick,
  onCountryHover,
  onStateClick,
}: GlobeViewProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const ready = size.width > 0 && size.height > 0;

  const idToCountry = useMemo(
    () => new Map(countries.map((c) => [c.id, c])),
    [countries],
  );

  // When a country's states are shown, swap that country's coarse (110m)
  // polygon out for its detailed (10m) state polygons — so there's no
  // double / mismatched border, just the crisp state outlines.
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
    // Transparent walls keep states flat & clean; only the hovered state shows a wall.
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
    if (isState(obj)) {
      onStateClick?.(obj); // keep the country selected; surface a state fact
      return;
    }
    const c = idToCountry.get((obj as CountryFeature).__id);
    if (c) onCountryClick?.(c);
  };

  const handleHover = (obj: object | null) => {
    if (obj && isState(obj)) {
      setHoveredId(obj.__id);
      onCountryHover?.(null);
      return;
    }
    const id = obj ? (obj as CountryFeature).__id : null;
    setHoveredId(id);
    onCountryHover?.(id ? (idToCountry.get(id) ?? null) : null);
  };

  // Configure orbit controls + initial framing once the globe is mounted.
  useEffect(() => {
    if (!ready) return;
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.6;
    controls.enableZoom = true;
    controls.minDistance = 104; // globe radius is 100 — allow zooming in close for small countries
    controls.maxDistance = 600;
  }, [autoRotate, ready]);

  useEffect(() => {
    if (ready) globeRef.current?.pointOfView({ lat: 20, lng: 0, altitude: 2.3 });
  }, [ready]);

  // Fly the camera to a focus point (e.g. the lit-up country in the game).
  useEffect(() => {
    if (ready && focus) {
      globeRef.current?.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.6 }, 800);
    }
  }, [focus, ready]);

  // Trackpad two-finger swipe -> rotate. OrbitControls maps the swipe gesture
  // (a non-ctrl wheel event) to zoom by default; we intercept it in the capture
  // phase and rotate the camera instead, while letting pinch (ctrlKey) zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!ready || !trackpadRotate || !container) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch-to-zoom -> leave to OrbitControls
      e.preventDefault();
      e.stopPropagation();
      const g = globeRef.current;
      if (!g) return;
      const pov = g.pointOfView();
      const k = 0.22; // degrees per wheel unit
      g.pointOfView(
        {
          lat: clamp(pov.lat - e.deltaY * k, -85, 85),
          lng: pov.lng + e.deltaX * k,
          altitude: pov.altitude,
        },
        0,
      );
    };
    container.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => container.removeEventListener("wheel", onWheel, { capture: true });
  }, [ready, trackpadRotate, containerRef]);

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
    </div>
  );
}
