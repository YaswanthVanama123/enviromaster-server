/**
 * Mapbox Service
 * Provides geocoding and driving directions functionality using Mapbox APIs
 */

import axios from 'axios';
import logger from "../../utils/logger.js";

const MAPBOX_GEOCODING_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const MAPBOX_DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';

/**
 * Geocode an address string to coordinates
 * @param {string} address - Full address string
 * @returns {Promise<{lng: number, lat: number}>} Coordinates
 */
export async function geocodeAddress(address) {
  if (!address || address.trim() === '') {
    throw new Error('Address is required for geocoding');
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN environment variable is not set');
  }

  const response = await axios.get(
    `${MAPBOX_GEOCODING_URL}/${encodeURIComponent(address)}.json`,
    {
      params: {
        access_token: accessToken,
        limit: 1,
        country: 'us'
      }
    }
  );

  if (!response.data.features || response.data.features.length === 0) {
    throw new Error(`Unable to geocode address: ${address}`);
  }

  const [lng, lat] = response.data.features[0].center;
  return { lng, lat, formattedAddress: response.data.features[0].place_name };
}

const MAPBOX_CONTEXT_FIELDS = {
  place: 'city',
  locality: 'city',
  region: 'region',
  postcode: 'postalCode',
  country: 'country',
};

export async function reverseGeocode(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error('Valid longitude and latitude are required for reverse geocoding');
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN environment variable is not set');
  }

  const response = await axios.get(
    `${MAPBOX_GEOCODING_URL}/${longitude},${latitude}.json`,
    {
      params: {
        access_token: accessToken,
        limit: 1,
        types: 'address,place,locality,postcode,region,country',
      },
      timeout: 8000,
    }
  );

  const feature = response.data?.features?.[0];
  if (!feature) {
    throw new Error(`Unable to reverse geocode coordinates: ${latitude}, ${longitude}`);
  }

  const parts = { address: feature.place_name || '', city: '', region: '', postalCode: '', country: '' };

  for (const entry of feature.context || []) {
    const kind = String(entry.id || '').split('.')[0];
    const field = MAPBOX_CONTEXT_FIELDS[kind];
    if (field && !parts[field]) {
      parts[field] = entry.text || '';
    }
  }

  const ownKind = String(feature.id || '').split('.')[0];
  const ownField = MAPBOX_CONTEXT_FIELDS[ownKind];
  if (ownField && !parts[ownField]) {
    parts[ownField] = feature.text || '';
  }

  return parts;
}

/**
 * Get driving time between two addresses
 * @param {string} fromAddress - Origin address
 * @param {string} toAddress - Destination address
 * @returns {Promise<{durationMinutes: number, distanceMiles: number}>} Driving time and distance
 */
export async function getDrivingTime(fromAddress, toAddress) {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN environment variable is not set');
  }

  // Geocode both addresses
  const fromCoords = await geocodeAddress(fromAddress);
  const toCoords = await geocodeAddress(toAddress);

  // Get driving directions
  const response = await axios.get(
    `${MAPBOX_DIRECTIONS_URL}/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}`,
    {
      params: {
        access_token: accessToken,
        geometries: 'geojson',
        overview: 'simplified'
      }
    }
  );

  if (!response.data.routes || response.data.routes.length === 0) {
    throw new Error('No route found between the addresses');
  }

  const route = response.data.routes[0];
  const durationSeconds = route.duration;
  const distanceMeters = route.distance;

  return {
    durationMinutes: durationSeconds / 60,
    distanceMiles: distanceMeters / 1609.34, // Convert meters to miles
    fromCoords,
    toCoords
  };
}

/**
 * Get driving times from one address to multiple destinations
 * @param {string} fromAddress - Origin address
 * @param {Array<{name: string, address: string}>} destinations - Array of destination addresses
 * @returns {Promise<Array<{name: string, durationMinutes: number, distanceMiles: number}>>}
 */
export async function getDrivingTimesToMultiple(fromAddress, destinations) {
  const results = [];

  for (const dest of destinations) {
    try {
      const result = await getDrivingTime(fromAddress, dest.address);
      results.push({
        name: dest.name,
        address: dest.address,
        durationMinutes: result.durationMinutes,
        distanceMiles: result.distanceMiles
      });
    } catch (error) {
      logger.error(`Error getting driving time to ${dest.name}:`, error.message);
      results.push({
        name: dest.name,
        address: dest.address,
        durationMinutes: null,
        distanceMiles: null,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Build a full address string from customer fields
 * @param {Object} customer - Customer object with address fields
 * @returns {string} Full address string
 */
export function buildAddressString(customer) {
  if (!customer) return '';

  const parts = [];

  if (customer.address) parts.push(customer.address);
  if (customer.city) parts.push(customer.city);
  if (customer.state) parts.push(customer.state);
  if (customer.zipCode) parts.push(customer.zipCode);

  return parts.join(', ');
}

export default {
  geocodeAddress,
  reverseGeocode,
  getDrivingTime,
  getDrivingTimesToMultiple,
  buildAddressString
};
