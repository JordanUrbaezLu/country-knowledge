import type { GeoJsonGeometry } from "../data/types";

/** Ray-casting PIP test for one GeoJSON ring (coords in [lng, lat] order). */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Test whether a [lng, lat] point lies inside a GeoJSON Polygon or
 * MultiPolygon geometry (holes are respected).
 */
export function pointInGeometry(lng: number, lat: number, geometry: GeoJsonGeometry): boolean {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    if (!pointInRing(lng, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i])) return false; // inside a hole
    }
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as number[][][][];
    for (const rings of polys) {
      if (!pointInRing(lng, lat, rings[0])) continue;
      let inHole = false;
      for (let i = 1; i < rings.length; i++) {
        if (pointInRing(lng, lat, rings[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
  }
  return false;
}
