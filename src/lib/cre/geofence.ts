/**
 * @file geofence.ts
 * @notice Geofencing and spatial boundary verification for humanitarian relief delivery zones.
 */

import { CreCoordinates, GeofenceZone } from "./types";

export const RELIEF_ZONES: GeofenceZone[] = [
  {
    id: "ZONE-FLOOD-4",
    name: "Flood Zone 4",
    minLat: 14.0,
    maxLat: 15.5,
    minLng: 120.0,
    maxLng: 122.0,
    centerLat: 14.5995,
    centerLng: 120.9842,
    radiusKm: 75,
  },
  {
    id: "ZONE-DISTRICT-DELTA",
    name: "District Delta",
    minLat: 13.5,
    maxLat: 14.2,
    minLng: 121.0,
    maxLng: 121.8,
    centerLat: 13.85,
    centerLng: 121.4,
    radiusKm: 50,
  },
  {
    id: "ZONE-SECTOR-A",
    name: "Disaster Sector A",
    minLat: 15.0,
    maxLat: 16.5,
    minLng: 119.5,
    maxLng: 121.0,
    centerLat: 15.75,
    centerLng: 120.25,
    radiusKm: 85,
  },
];

export interface GeofenceCheckResult {
  inZone: boolean;
  matchedZone?: GeofenceZone;
  distanceKmFromCenter?: number;
  reason: string;
}

/**
 * Calculates great-circle distance between two GPS points using the Haversine formula.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export class GeofenceValidator {
  private zones: GeofenceZone[];

  constructor(customZones?: GeofenceZone[]) {
    this.zones = customZones || RELIEF_ZONES;
  }

  public verifyCoordinates(targetRegion: string, coords: CreCoordinates): GeofenceCheckResult {
    const regionQuery = (targetRegion || "").toLowerCase().trim();

    // 1. Locate zone definition matching the target region
    const matchedZone = this.zones.find((z) =>
      regionQuery.includes(z.name.toLowerCase()) || z.name.toLowerCase().includes(regionQuery)
    );

    if (!matchedZone) {
      return {
        inZone: false,
        reason: `Target region '${targetRegion}' does not match any recognized relief perimeter.`,
      };
    }

    // 2. Perform bounding box check
    const inBoundingBox =
      coords.latitude >= matchedZone.minLat &&
      coords.latitude <= matchedZone.maxLat &&
      coords.longitude >= matchedZone.minLng &&
      coords.longitude <= matchedZone.maxLng;

    // 3. Perform radial distance check from center
    const distanceKm = calculateHaversineDistanceKm(
      coords.latitude,
      coords.longitude,
      matchedZone.centerLat,
      matchedZone.centerLng
    );

    const withinRadius = distanceKm <= matchedZone.radiusKm;

    if (inBoundingBox && withinRadius) {
      return {
        inZone: true,
        matchedZone,
        distanceKmFromCenter: distanceKm,
        reason: `Coordinates (${coords.latitude}, ${coords.longitude}) verified inside ${matchedZone.name} perimeter (${distanceKm} km from epicenter).`,
      };
    }

    return {
      inZone: false,
      matchedZone,
      distanceKmFromCenter: distanceKm,
      reason: `Coordinates (${coords.latitude}, ${coords.longitude}) are outside ${matchedZone.name} perimeter (${distanceKm} km from epicenter, max allowed ${matchedZone.radiusKm} km).`,
    };
  }

  public getAllowedRegions(): string[] {
    return this.zones.map((z) => z.name);
  }
}

export const geofenceValidator = new GeofenceValidator();
