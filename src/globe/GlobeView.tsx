import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import type { StateFeature } from "../data/states";
import type { Country, CountryFeature } from "../data/types";
import { pointInGeometry } from "../lib/geo";

/** A persistent, billboarded label pinned to a lat/lng on the globe (reveal). */
export interface GlobeMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** accent/border/dot color */
  color: string;
  /** larger styling (used for the answer) */
  emphasis?: boolean;
  /** render as a compact compass pole badge instead of a name pill */
  pole?: "N" | "S";
}

// Always-on orientation aid: the poles track the real globe rotation.
const POLE_MARKERS: GlobeMarker[] = [
  { id: "pole-N", lat: 90, lng: 0, label: "N", color: "#f87171", pole: "N" },
  { id: "pole-S", lat: -90, lng: 0, label: "S", color: "#7dd3fc", pole: "S" },
];

export interface GlobeViewProps {
  countries: Country[];
  /** country to "light up" (game). When set, all others dim. */
  highlightId?: string | null;
  /** multiple countries to light up at once, each in its own color (reveal). */
  highlights?: Record<string, string> | null;
  /** floating name labels pinned to the globe (reveal). */
  markers?: GlobeMarker[] | null;
  /** show always-on N/S compass pole badges (orientation aid). */
  poles?: boolean;
  /** camera altitude when focusing (globe radii); lower = closer. */
  focusAltitude?: number;
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
   * beneath it is continuously highlighted and named. The pill under the
   * reticle is tappable and triggers the same onCountryClick/onStateClick as
   * tapping the polygon itself — i.e. the crosshair *is* the click on touch
   * devices. With showLabels=false (game) the pill hides the name and renders
   * a "Select this country" button instead.
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

// three-globe renders the globe as a sphere of this radius at the origin.
const GLOBE_RADIUS = 100;

// Vertical screen position of the crosshair (fraction of container height).
// Sits at the centre of the area that stays visible above the mobile bottom
// sheet; the focus effect below uses it to aim selections at the reticle.
const CROSSHAIR_TOP = 0.32;

// camera altitude used when focusing a country (globe radii above surface)
const FOCUS_ALTITUDE = 1.6;

/**
 * Degrees of latitude between the screen centre and what the crosshair sees,
 * for a camera fov (deg) at FOCUS_ALTITUDE. Law of sines on the triangle
 * globe-centre → camera → ray/sphere intersection.
 */
function crosshairLatOffset(fovDeg: number): number {
  const ndcY = 1 - 2 * CROSSHAIR_TOP; // crosshair in NDC (+0.36 = above centre)
  const theta = Math.atan(ndcY * Math.tan(((fovDeg * Math.PI) / 180) / 2));
  const s = (1 + FOCUS_ALTITUDE) * Math.sin(theta); // D·sinθ / R, D = R(1+alt)
  if (s >= 1) return 0; // ray would miss the globe; keep plain centring
  return ((Math.asin(s) - theta) * 180) / Math.PI;
}

const isState = (o: object): o is StateFeature => (o as StateFeature).__kind === "state";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type CrosshairTarget =
  | { kind: "country"; id: string; name: string; country: Country }
  | { kind: "state"; id: string; name: string; state: StateFeature };

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
  highlights = null,
  markers = null,
  poles = true,
  focusAltitude,
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
  // Fixed-size reticle box: the raycast samples ITS centre. The label pill is
  // absolutely positioned below it so its appearance never moves the reticle
  // (sampling the outer wrapper used to shift the probe point ~18px whenever
  // the pill mounted, causing flicker near coastlines).
  const reticleRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [crosshairTarget, setCrosshairTarget] = useState<CrosshairTarget | null>(null);
  const ready = size.width > 0 && size.height > 0;

  // Pre-allocated Three.js objects reused every poll frame (avoid GC pressure).
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcRef = useRef(new THREE.Vector2());
  const hitRef = useRef(new THREE.Vector3());
  const globeSphereRef = useRef(new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS));

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

  // Accessors are memoized so a re-render that doesn't change what they read
  // (e.g. the crosshair pill updating) doesn't hand globe.gl new props and
  // force a full polygon restyle.
  const dimOthers = !!highlightId || (!!highlights && Object.keys(highlights).length > 0);

  const capColor = useCallback(
    (obj: object): string => {
      if (isState(obj)) {
        return obj.__id === hoveredId ? COLORS.stateFillHover : COLORS.stateFill;
      }
      const id = (obj as CountryFeature).__id;
      if (highlights && highlights[id]) return highlights[id];
      if (id === highlightId) return COLORS.highlight;
      if (id === selectedId) return COLORS.selected;
      if (id === hoveredId) return COLORS.hover;
      return dimOthers ? COLORS.landDim : COLORS.land;
    },
    [hoveredId, highlightId, highlights, selectedId, dimOthers],
  );

  const sideColor = useCallback(
    (obj: object): string => {
      if (isState(obj)) return obj.__id === hoveredId ? "rgba(255, 210, 74, 0.4)" : "rgba(0,0,0,0)";
      return "rgba(15, 30, 60, 0.7)";
    },
    [hoveredId],
  );

  const strokeColor = useCallback(
    (obj: object): string => (isState(obj) ? COLORS.stateStroke : "#86b0e8"),
    [],
  );

  // Altitude changes rebuild polygon geometry, which is expensive across ~180
  // countries — on touch devices the crosshair sweeps hover constantly while
  // panning, so hover there is colour-only (no lift).
  const altitude = useCallback(
    (obj: object): number => {
      if (isState(obj)) return !crosshair && obj.__id === hoveredId ? 0.03 : 0.012;
      const id = (obj as CountryFeature).__id;
      if (highlights && highlights[id]) return 0.06;
      if (id === highlightId) return 0.06;
      if (id === selectedId) return 0.02;
      if (!crosshair && id === hoveredId) return 0.02;
      return 0.01;
    },
    [hoveredId, highlightId, highlights, selectedId, crosshair],
  );

  const label = useCallback(
    (obj: object): string => {
      // On mobile/crosshair mode we suppress globe.gl's floating tooltip — the
      // crosshair pill shows the name instead.
      if (crosshair) return "";
      if (isState(obj)) {
        return `<div style="background:rgba(60,40,5,.92);color:#ffd24a;padding:4px 8px;border-radius:6px;font:600 13px system-ui;border:1px solid rgba(255,210,74,.5)">${obj.__name}</div>`;
      }
      if (!showLabels) return "";
      const c = idToCountry.get((obj as CountryFeature).__id);
      return c
        ? `<div style="background:rgba(5,7,15,.85);color:#e8edf6;padding:4px 8px;border-radius:6px;font:600 13px system-ui;border:1px solid rgba(125,170,224,.4)">${c.name}</div>`
        : "";
    },
    [crosshair, showLabels, idToCountry],
  );

  // Persistent floating labels (reveal): a colored pill pinned above its point.
  // pointer-events:none so labels never block globe drag/zoom.
  const htmlElement = useCallback((d: object): HTMLElement => {
    const m = d as GlobeMarker;
    const el = document.createElement("div");
    // Compact compass badge for the poles (centered on the point).
    if (m.pole) {
      el.style.cssText = "pointer-events:none;transform:translate(-50%,-50%);will-change:transform;";
      el.innerHTML =
        `<div style="display:flex;flex-direction:column;align-items:center;` +
        `font:800 11px system-ui,sans-serif;color:${m.color};` +
        `text-shadow:0 0 4px rgba(0,0,0,.9),0 0 2px rgba(0,0,0,.9);opacity:.92">` +
        `${m.pole === "N" ? "▲" : "▼"}<span style="letter-spacing:.5px">${m.pole}</span></div>`;
      return el;
    }
    el.style.cssText =
      "pointer-events:none;transform:translate(-50%,-115%);white-space:nowrap;will-change:transform;";
    const big = m.emphasis;
    el.innerHTML =
      `<div style="display:flex;align-items:center;gap:6px;` +
      `padding:${big ? "4px 11px" : "3px 9px"};border-radius:9999px;` +
      `background:rgba(5,7,15,.86);border:1.5px solid ${m.color};color:#eef2fb;` +
      `font:${big ? 700 : 600} ${big ? 14 : 12}px system-ui,sans-serif;` +
      `box-shadow:0 2px 10px rgba(0,0,0,.55)">` +
      `<span style="width:9px;height:9px;border-radius:9999px;background:${m.color};` +
      `box-shadow:0 0 7px ${m.color}"></span>${escapeHtml(m.label)}</div>`;
    return el;
  }, []);

  const handleClick = useCallback(
    (obj: object) => {
      if (isState(obj)) { onStateClick?.(obj); return; }
      const c = idToCountry.get((obj as CountryFeature).__id);
      if (c) onCountryClick?.(c);
    },
    [idToCountry, onCountryClick, onStateClick],
  );

  const handleHover = useCallback(
    (obj: object | null) => {
      // On crosshair mode the poll loop drives hoveredId; ignore globe.gl mouse events.
      if (crosshair) return;
      if (obj && isState(obj)) { setHoveredId(obj.__id); onCountryHover?.(null); return; }
      const id = obj ? (obj as CountryFeature).__id : null;
      setHoveredId(id);
      onCountryHover?.(id ? (idToCountry.get(id) ?? null) : null);
    },
    [crosshair, idToCountry, onCountryHover],
  );

  // The crosshair pill mimics a real click on whatever is under the reticle.
  const handleCrosshairSelect = useCallback(() => {
    if (!crosshairTarget) return;
    if (crosshairTarget.kind === "state") onStateClick?.(crosshairTarget.state);
    else onCountryClick?.(crosshairTarget.country);
  }, [crosshairTarget, onCountryClick, onStateClick]);

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
    if (!ready || !focus) return;
    let lat = focus.lat;
    const alt = focusAltitude ?? FOCUS_ALTITUDE;
    if (crosshair) {
      // Land the focused country under the reticle, not the screen centre
      // (which sits behind/near the bottom sheet on phones).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const camera = (globeRef.current as any)?.camera?.();
      lat = clamp(lat - crosshairLatOffset(camera?.fov ?? 50), -85, 85);
    }
    globeRef.current?.pointOfView({ lat, lng: focus.lng, altitude: alt }, 800);
  }, [focus, ready, crosshair, focusAltitude]);

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

  // Clear any stale crosshair-driven hover state when the crosshair goes away.
  useEffect(() => {
    if (!crosshair) {
      setCrosshairTarget(null);
      setHoveredId(null);
    }
  }, [crosshair]);

  /**
   * Crosshair polling loop (~10 fps): raycast from the camera through the
   * reticle centre, intersect the globe sphere, convert the hit to lat/lng
   * (three-globe's cartesian2Polar formula), then point-in-polygon test the
   * active feature set. Skips everything while the camera is at rest.
   */
  useEffect(() => {
    if (!crosshair || !ready) return;
    let raf: number;
    let last = 0;
    const INTERVAL = 100; // ms between raycasts while the camera moves
    let lastCam: number[] | null = null;
    let lastId: string | null | undefined; // undefined → force first detection

    const poll = (ts: number) => {
      raf = requestAnimationFrame(poll);
      if (ts - last < INTERVAL) return;
      last = ts;

      const gl = globeRef.current;
      const reticleEl = reticleRef.current;
      if (!gl || !reticleEl) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const glAny = gl as any;
      const camera: THREE.Camera | undefined = glAny.camera?.();
      const renderer: THREE.WebGLRenderer | undefined = glAny.renderer?.();
      if (!camera || !renderer) return;

      // Idle skip: no camera movement since the last sample → nothing to do.
      const { position: p, quaternion: q } = camera;
      const cam = [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
      if (lastCam && lastId !== undefined && cam.every((v, i) => v === lastCam![i])) return;
      lastCam = cam;

      // Reticle centre in Normalised Device Coordinates (-1..1).
      const canvas = renderer.domElement;
      const cRect = canvas.getBoundingClientRect();
      const chRect = reticleEl.getBoundingClientRect();
      const cx = chRect.left + chRect.width / 2;
      const cy = chRect.top + chRect.height / 2;
      ndcRef.current.set(
        ((cx - cRect.left) / cRect.width) * 2 - 1,
        -((cy - cRect.top) / cRect.height) * 2 + 1,
      );

      const apply = (id: string | null, target: CrosshairTarget | null) => {
        if (id === lastId) return;
        lastId = id;
        setHoveredId(id);
        setCrosshairTarget(target);
        onCountryHover?.(target?.kind === "country" ? target.country : null);
      };

      // Cast a ray from the camera through the reticle and intersect the globe sphere.
      raycasterRef.current.setFromCamera(ndcRef.current, camera);
      if (!raycasterRef.current.ray.intersectSphere(globeSphereRef.current, hitRef.current)) {
        apply(null, null);
        return;
      }

      // Convert the 3D hit point to lat/lng using three-globe's exact cartesian2Polar formula.
      const { x, y, z } = hitRef.current;
      const phi = Math.acos(Math.max(-1, Math.min(1, y / GLOBE_RADIUS)));
      const theta = Math.atan2(z, x);
      const lat = 90 - phi * (180 / Math.PI);
      const lng = 90 - theta * (180 / Math.PI) - (theta < -Math.PI / 2 ? 360 : 0);

      // Check state features first (they're rendered on top of the selected country).
      if (stateFeatures && stateFeatures.length) {
        for (const sf of stateFeatures) {
          if (pointInGeometry(lng, lat, sf.geometry)) {
            apply(sf.__id, { kind: "state", id: sf.__id, name: sf.__name, state: sf });
            return;
          }
        }
      }

      // Then check country features.
      for (const c of countries) {
        if (pointInGeometry(lng, lat, c.feature.geometry)) {
          apply(c.id, { kind: "country", id: c.id, name: c.name, country: c });
          return;
        }
      }

      apply(null, null);
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [crosshair, ready, countries, stateFeatures, onCountryHover]);

  // What the crosshair pill renders:
  //  - explore (showLabels): the target's name — tap to select it.
  //  - game (no labels): a "Select this country" button, name hidden.
  const pill =
    crosshair && crosshairTarget
      ? showLabels
        ? { text: `${crosshairTarget.name} ›`, state: crosshairTarget.kind === "state" }
        : crosshairTarget.kind === "country" && onCountryClick
          ? { text: "Select this country", state: false }
          : null
      : null;

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
          polygonsTransitionDuration={crosshair ? 0 : 300}
          onPolygonClick={handleClick}
          onPolygonHover={handleHover}
          htmlElementsData={poles ? [...POLE_MARKERS, ...(markers ?? [])] : (markers ?? [])}
          htmlLat={(d: object) => (d as GlobeMarker).lat}
          htmlLng={(d: object) => (d as GlobeMarker).lng}
          htmlAltitude={0.02}
          htmlElement={htmlElement}
        />
      )}

      {/* Crosshair overlay — touch devices only, driven by the poll loop above */}
      {crosshair && ready && (
        <div
          ref={reticleRef}
          style={{ top: `${CROSSHAIR_TOP * 100}%` }}
          className="pointer-events-none absolute left-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2"
        >
          {/* The + arms */}
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/60 shadow-[0_0_2px_rgba(0,0,0,0.9)]" />
          <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-white/60 shadow-[0_0_2px_rgba(0,0,0,0.9)]" />
          {/* Centre dot */}
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_3px_rgba(0,0,0,0.9)]" />

          {/* Tappable action pill, absolutely positioned so the reticle never shifts */}
          {pill && (
            <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2">
              <button
                onClick={handleCrosshairSelect}
                className={[
                  "pointer-events-auto whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold shadow-lg backdrop-blur",
                  pill.state
                    ? "border-amber-400/40 bg-slate-900/85 text-amber-300 active:bg-slate-800"
                    : showLabels
                      ? "border-white/20 bg-slate-900/80 text-slate-100 active:bg-slate-800"
                      : "border-sky-300/40 bg-sky-500 text-slate-950 active:bg-sky-300",
                ].join(" ")}
              >
                {pill.text}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
