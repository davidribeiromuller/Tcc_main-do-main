/**
 * Real Street Routing Engine using Open Source Routing Machine (OSRM)
 * Follows actual street geometry, turn restrictions, and driving rules.
 */

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng] points for Leaflet
  distanceKm: number;
  durationMin: number;
  summary?: string;
}

export async function fetchStreetRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RouteResult> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM API error: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const bestRoute = data.routes[0];
      // OSRM coordinates are [lng, lat], convert to Leaflet [lat, lng]
      const latLngs: [number, number][] = bestRoute.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]]
      );
      const distanceKm = Number((bestRoute.distance / 1000).toFixed(1));
      const durationMin = Math.max(1, Math.round(bestRoute.duration / 60));

      return {
        coordinates: latLngs,
        distanceKm,
        durationMin,
        summary: bestRoute.legs?.[0]?.summary || "",
      };
    }
    throw new Error("No route found by OSRM");
  } catch (error) {
    // Fallback to direct geodesic line if network / offline
    console.warn("Real street route fetch failed, using direct line:", error);
    const distanceKm = calculateHaversineKm(fromLat, fromLng, toLat, toLng);
    const durationMin = Math.max(1, Math.ceil(distanceKm * 2.2));
    return {
      coordinates: [
        [fromLat, fromLng],
        [toLat, toLng],
      ],
      distanceKm,
      durationMin,
    };
  }
}

function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}
