const https = require('https');

// In-memory cache (persists during function lifetime)
let cache = {
  data: null,
  timestamp: null,
  stationInfo: null
};

// Cache duration: 55 minutes (3300 seconds)
const CACHE_DURATION_MS = 55 * 60 * 1000;

// Function to check if cache is still valid
function isCacheValid() {
  if (!cache.timestamp || !cache.data) return false;
  return (Date.now() - cache.timestamp) < CACHE_DURATION_MS;
}

// Function to fetch data from temperatur.nu API
function fetchTemperatureData() {
  return new Promise((resolve, reject) => {
    const apiUrl = 'http://api.temperatur.nu/tnu_1.17.php?p=vasastan&cli=apan&span=1week&data';
    
    https.get(apiUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(new Error('Failed to parse API response'));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('🌡️ Temperature API function called');

    // Check if we have valid cached data
    if (isCacheValid()) {
      console.log('📦 Returning cached data');
      
      // Add cache headers to response
      const cacheHeaders = {
        ...headers,
        'Cache-Control': 'public, max-age=3300', // 55 minutes
        'X-Cache-Status': 'HIT',
        'X-Cache-Timestamp': new Date(cache.timestamp).toISOString()
      };

      return {
        statusCode: 200,
        headers: cacheHeaders,
        body: JSON.stringify({
          success: true,
          cached: true,
          timestamp: cache.timestamp,
          stations: cache.data.stations || [],
          stationInfo: cache.stationInfo
        })
      };
    }

    console.log('🌐 Fetching fresh data from temperatur.nu API');
    
    // Fetch fresh data from API
    const apiData = await fetchTemperatureData();
    
    if (!apiData.stations || apiData.stations.length === 0) {
      throw new Error('No stations data received from API');
    }

    // Update cache
    const now = Date.now();
    cache = {
      data: apiData,
      timestamp: now,
      stationInfo: apiData.stations[0] // Store first station info
    };

    console.log('✅ Fresh data cached successfully');

    // Add cache headers for fresh data
    const freshHeaders = {
      ...headers,
      'Cache-Control': 'public, max-age=3300', // 55 minutes
      'X-Cache-Status': 'MISS',
      'X-Cache-Timestamp': new Date(now).toISOString()
    };

    return {
      statusCode: 200,
      headers: freshHeaders,
      body: JSON.stringify({
        success: true,
        cached: false,
        timestamp: now,
        stations: apiData.stations,
        stationInfo: apiData.stations[0]
      })
    };

  } catch (error) {
    console.error('❌ Error in temperature function:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: Date.now()
      })
    };
  }
};