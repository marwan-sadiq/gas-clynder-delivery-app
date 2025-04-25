import polyline from '@mapbox/polyline';

const API_KEY = 'AIzaSyCNQ0Ltm-G89UgQJ8qxpxtONn6-9JMe4P8'; // Make sure this is secure in real apps
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds
const MAX_RETRIES = 2;
const TIMEOUT = 10000; // 10 seconds

// Cache structure
interface CacheEntry {
  data: {
    coords: { latitude: number; longitude: number }[];
    duration: number;
    distance: number;
  };
  timestamp: number;
}

const routeCache = new Map<string, CacheEntry>();

export async function getRoutePolyline(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number }
): Promise<{
  coords: { latitude: number; longitude: number }[];
  duration: number;
  distance: number;
}> {
  // Create cache key from coordinates
  const cacheKey = `${origin.latitude},${origin.longitude}-${destination.latitude},${destination.longitude}`;
  
  // Check cache
  const cached = routeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    return cached.data;
  }

  const originStr = `${origin.latitude},${origin.longitude}`;
  const destStr = `${destination.latitude},${destination.longitude}`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&key=${API_KEY}&mode=driving&alternatives=false&overview=simplified`;

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const json = await res.json();

      if (!json.routes?.[0]?.overview_polyline?.points) {
        console.warn('No valid routes returned from Google API.');
        continue; // Try again if we have retries left
      }

      const points = polyline.decode(json.routes[0].overview_polyline.points);
      const coords = points.map((point: [number, number]) => ({
        latitude: point[0],
        longitude: point[1],
      }));

      const duration = json.routes[0].legs[0].duration.value / 60; // seconds to minutes
      const distance = json.routes[0].legs[0].distance.value / 1000; // meters to kilometers

      const result = {
        coords,
        duration: Math.round(duration),
        distance: Number(distance.toFixed(1))
      };

      // Store in cache
      routeCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      // Clean up old cache entries
      if (routeCache.size > 50) { // Limit cache size
        const now = Date.now();
        for (const [key, value] of routeCache.entries()) {
          if (now - value.timestamp > CACHE_EXPIRY) {
            routeCache.delete(key);
          }
        }
      }

      return result;

    } catch (error: any) {
      lastError = error;
      if (error.name === 'AbortError') {
        console.warn(`Request timeout on attempt ${attempt + 1}`);
      } else {
        console.error(`Error fetching route on attempt ${attempt + 1}:`, error);
      }
      // Wait before retry, with exponential backoff
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  console.error('All route fetch attempts failed');
  return { coords: [], duration: 0, distance: 0 };
}