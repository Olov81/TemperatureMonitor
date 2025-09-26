import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import './App.css';

interface TemperatureDataPoint {
  datetime: string;
  temperatur: string;
}

interface Station {
  title: string;
  id: string;
  temp: string;
  data: TemperatureDataPoint[];
}

interface ApiResponse {
  full_exec_time: number;
  title: string;
  client: string;
  stations: Station[];
}

interface ChartData {
  datetime: string;
  temperature: number;
  time: string; // for display purposes
  date: string; // for display purposes
}

const App: React.FC = () => {
  const [data, setData] = useState<ChartData[]>([]);
  const [movingAverageData, setMovingAverageData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stationInfo, setStationInfo] = useState<Station | null>(null);
  const [seasonInfo, setSeasonInfo] = useState<{ season: string; message: string }>({ season: 'unknown', message: '' });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [usingCachedData, setUsingCachedData] = useState(false);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload; // Get the full data point
      const fullDate = new Date(data.datetime);
      const formattedDateTime = fullDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Determine if this is the moving average chart or raw data
      const isMovingAverage = payload[0].name?.includes('Moving Average');
      
      return (
        <div style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
          padding: '10px',
          fontSize: '14px'
        }}>
          <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', color: '#495057' }}>
            📅 {formattedDateTime}
          </p>
          <p style={{ margin: '0', color: payload[0].color }}>
            🌡️ {isMovingAverage ? '24h Moving Average' : 'Temperature'}: {payload[0].value.toFixed(1)}°C
          </p>
        </div>
      );
    }
    return null;
  };

  // Cache management constants
  const CACHE_KEY = 'temperatureData';
  const CACHE_DURATION_MS = 55 * 60 * 1000; // 55 minutes (slightly less than 1 hour for safety)

  // Function to check if cached data is still valid
  const isCacheValid = (timestamp: number): boolean => {
    const now = Date.now();
    return (now - timestamp) < CACHE_DURATION_MS;
  };

  // Function to save data to cache
  const saveToCache = (data: any, stationInfo: any) => {
    const cacheData = {
      data,
      stationInfo,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      console.log('📦 Data saved to cache');
    } catch (error) {
      console.warn('Failed to save to cache:', error);
    }
  };

  // Function to load data from cache
  const loadFromCache = (): { data: any; stationInfo: any; timestamp: number } | null => {
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (!cachedData) return null;
      
      const parsed = JSON.parse(cachedData);
      if (!parsed.timestamp || !isCacheValid(parsed.timestamp)) {
        console.log('🗑️ Cache expired, removing old data');
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      
      console.log('⚡ Using cached data from', new Date(parsed.timestamp).toLocaleString());
      return parsed;
    } catch (error) {
      console.warn('Failed to load from cache:', error);
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
  };

  // Function to convert API data to chart format
  const convertApiDataToChartData = (apiData: TemperatureDataPoint[]): ChartData[] => {
    return apiData.map(point => {
      const dateTime = new Date(point.datetime);
      return {
        datetime: point.datetime,
        temperature: parseFloat(point.temperatur),
        time: dateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        date: dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };
    });
  };

  // Function to calculate 24-hour trailing moving average
  const calculateMovingAverage = (data: ChartData[], windowSize: number = 24): ChartData[] => {
    return data.map((point, index) => {
      // Use trailing window: take the current point and the previous (windowSize-1) points
      const start = Math.max(0, index - windowSize + 1);
      const end = index + 1;
      
      // Get the values in the trailing window
      const windowData = data.slice(start, end);
      
      // Calculate average
      const sum = windowData.reduce((acc, item) => acc + item.temperature, 0);
      const average = sum / windowData.length;
      
      return {
        ...point,
        temperature: Math.round(average * 10) / 10 // Round to 1 decimal place
      };
    });
  };

  // Function to detect season based on temperature patterns
  const detectSeason = (movingAvgData: ChartData[]): { season: string; message: string } => {
    const hoursIn5Days = 5 * 24; // 120 hours
    let consecutiveHoursBelow0 = 0;
    let consecutiveHoursBelow10 = 0;
    let hasBeenAbove10InLast5Days = false;
    
    // Check the last 5 days (120 hours) of data
    const last5Days = movingAvgData.slice(-hoursIn5Days);
    
    // Check if any temperature was above 10°C in the last 5 days
    hasBeenAbove10InLast5Days = last5Days.some(point => point.temperature > 10);
    
    // Count consecutive hours below thresholds (from the end)
    for (let i = movingAvgData.length - 1; i >= 0; i--) {
      if (movingAvgData[i].temperature < 0) {
        consecutiveHoursBelow0++;
      } else {
        break; // Stop counting if temperature goes above 0°C
      }
    }
    
    for (let i = movingAvgData.length - 1; i >= 0; i--) {
      if (movingAvgData[i].temperature < 10) {
        consecutiveHoursBelow10++;
      } else {
        break; // Stop counting if temperature goes above 10°C
      }
    }
    
    // Determine season based on conditions
    if (consecutiveHoursBelow0 >= hoursIn5Days) {
      return { season: 'winter', message: 'Seems like it\'s winter!' };
    } else if (consecutiveHoursBelow10 >= hoursIn5Days) {
      return { season: 'autumn', message: 'Seems like it\'s autumn!' };
    } else if (hasBeenAbove10InLast5Days) {
      return { season: 'summer', message: 'Seems like it\'s summer!' };
    } else {
      return { season: 'unknown', message: '' };
    }
  };

  // Function to fetch temperature data from the real API
  const fetchTemperatureData = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setUsingCachedData(false);
    
    try {
      // First check local cache unless force refresh is requested
      if (!forceRefresh) {
        const cachedData = loadFromCache();
        if (cachedData) {
          console.log('📱 Using local cached data to save API quota');
          setStationInfo(cachedData.stationInfo);
          const chartData = convertApiDataToChartData(cachedData.data);
          setData(chartData);
          setMovingAverageData(calculateMovingAverage(chartData, 24));
          setSeasonInfo(detectSeason(chartData));
          setLastUpdated(new Date(cachedData.timestamp));
          setUsingCachedData(true);
          setLoading(false);
          return;
        }
      }

      // Use Netlify Function for server-side caching in production, fallback to direct API locally
      const isProduction = window.location.hostname !== 'localhost';
      
      let response;
      
      if (isProduction) {
        // Production: Use Netlify Function
        const functionUrl = '/.netlify/functions/temperature';
        console.log('🌐 Fetching from Netlify Function:', functionUrl);
        
        response = await axios.get(functionUrl, {
          timeout: 15000,
        });
        
        // Handle Netlify Function response format
        const functionResponse = response.data;
        
        if (!functionResponse.success) {
          throw new Error(functionResponse.error || 'Function returned error');
        }
        
        if (functionResponse.stations && functionResponse.stations.length > 0) {
          const station = functionResponse.stations[0];
          
          // Save to local cache as backup
          saveToCache(station.data, station);
          
          setStationInfo(station);
          const chartData = convertApiDataToChartData(station.data);
          setData(chartData);
          
          const movingAvg = calculateMovingAverage(chartData, 24);
          setMovingAverageData(movingAvg);
          
          const currentSeason = detectSeason(movingAvg);
          setSeasonInfo(currentSeason);
          
          setLastUpdated(new Date(functionResponse.timestamp));
          setUsingCachedData(functionResponse.cached);
          
          console.log(`✅ Successfully loaded ${functionResponse.cached ? 'server-cached' : 'fresh'} data from Netlify Function`);
        } else {
          setError('No temperature data available from the function');
        }
      } else {
        // Local development: Use direct API call with CORS proxy
        const corsProxy = 'https://api.allorigins.win/get?url=';
        const apiUrl = 'http://api.temperatur.nu/tnu_1.17.php?p=vasastan&cli=apan&span=1week&data';
        const proxyUrl = corsProxy + encodeURIComponent(apiUrl);
        
        console.log('🔧 Local development: Fetching from API via CORS proxy...');
        
        response = await axios.get(proxyUrl, {
          timeout: 15000,
        });
        
        let apiData;
        // Handle CORS proxy response format
        if (response.data.contents) {
          try {
            apiData = JSON.parse(response.data.contents);
          } catch (parseError) {
            throw new Error('Failed to parse API response');
          }
        } else {
          apiData = response.data;
        }
        
        if (apiData.stations && apiData.stations.length > 0) {
          const station = apiData.stations[0];
          
          // Save to local cache
          saveToCache(station.data, station);
          
          setStationInfo(station);
          const chartData = convertApiDataToChartData(station.data);
          setData(chartData);
          
          const movingAvg = calculateMovingAverage(chartData, 24);
          setMovingAverageData(movingAvg);
          
          const currentSeason = detectSeason(movingAvg);
          setSeasonInfo(currentSeason);
          
          setLastUpdated(new Date());
          setUsingCachedData(false);
          
          console.log('✅ Successfully loaded fresh data from direct API (local development)');
        } else {
          setError('No temperature data available from the API');
        }
      }
      
    } catch (err) {
      console.error('Error fetching data:', err);
      
      // If API fails, try to use local example data as fallback
      try {
        const exampleDataResponse = await import('./ExampleData.json');
        const exampleData = exampleDataResponse.default as ApiResponse;
        
        if (exampleData.stations && exampleData.stations.length > 0) {
          const station = exampleData.stations[0];
          setStationInfo(station);
          const chartData = convertApiDataToChartData(station.data);
          setData(chartData);
          
          // Calculate 24-hour moving average for fallback data too
          const movingAvg = calculateMovingAverage(chartData, 24);
          setMovingAverageData(movingAvg);
          
          // Detect current season
          const currentSeason = detectSeason(movingAvg);
          setSeasonInfo(currentSeason);
          
          setError('Using sample data (API temporarily unavailable)');
        }
      } catch (fallbackErr) {
        setError('Failed to fetch temperature data. Please try refreshing the page.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on component mount
  useEffect(() => {
    fetchTemperatureData();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Temperature Monitor</h1>
        {stationInfo && (
          <div className="station-info">
            <h2>{stationInfo.title}</h2>
            <p>Current temperature: <strong>{stationInfo.temp}°C</strong></p>
            {seasonInfo.message && (
              <div className={`season-announcement ${seasonInfo.season}`}>
                {seasonInfo.season === 'summer' && '☀️'}
                {seasonInfo.season === 'autumn' && '🍂'}
                {seasonInfo.season === 'winter' && '❄️'}
                <strong> {seasonInfo.message} </strong>
                {seasonInfo.season === 'summer' && '☀️'}
                {seasonInfo.season === 'autumn' && '🍂'}
                {seasonInfo.season === 'winter' && '❄️'}
                <br />
                <small>
                  {seasonInfo.season === 'summer' && 'Daily average temperature has been above 10°C recently'}
                  {seasonInfo.season === 'autumn' && 'Daily average temperature has been below 10°C for more than 5 days'}
                  {seasonInfo.season === 'winter' && 'Daily average temperature has been below 0°C for more than 5 days'}
                </small>
              </div>
            )}
          </div>
        )}
        
        <div className="controls">
          <button 
            onClick={() => fetchTemperatureData(true)} 
            disabled={loading}
            className="refresh-button"
          >
            {loading ? 'Loading...' : 'Refresh Data'}
          </button>
        </div>

        {/* Cache status and last updated info */}
        {lastUpdated && (
          <div className="cache-status">
            {usingCachedData && (
              <span className="cache-indicator">
                {window.location.hostname === 'localhost' 
                  ? '📱 Using local browser cache'
                  : '🌍 Using server-cached data (shared by all users - saves API quota)'}
              </span>
            )}
            <span className="last-updated">
              Last updated: {lastUpdated.toLocaleString()}
            </span>
            {usingCachedData && window.location.hostname !== 'localhost' && (
              <span className="cache-info">
                Server refreshes data every 55 minutes automatically
              </span>
            )}
            {window.location.hostname === 'localhost' && (
              <span className="dev-info">
                🔧 Local development mode - fetching directly from API
              </span>
            )}
          </div>
        )}
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="charts-container">
          <div className="chart-container">
            <h3>Hourly Temperature Data</h3>
            {data.length > 0 ? (
              <ResponsiveContainer width="100%" height={350} minWidth={300}>
                <LineChart
                  data={data}
                  margin={{
                    top: 5,
                    right: 20,
                    left: 10,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft' }}
                    tick={{ fontSize: 12 }}
                    domain={['dataMin - 2', 'dataMax + 2']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="temperature" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6 }}
                    name="Temperature"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              !loading && (
                <div className="no-data">
                  {error ? 'Unable to load temperature data' : 'No temperature data available'}
                </div>
              )
            )}
          </div>

          <div className="chart-container">
            <h3>24-Hour Moving Average</h3>
            {movingAverageData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350} minWidth={300}>
                <LineChart
                  data={movingAverageData}
                  margin={{
                    top: 5,
                    right: 20,
                    left: 10,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft' }}
                    tick={{ fontSize: 12 }}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="temperature" 
                    stroke="#ff7300" 
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                    name="24h Moving Average"
                  />
                  <ReferenceLine 
                    y={10} 
                    stroke="#8B4513" 
                    strokeDasharray="5 5" 
                    strokeWidth={2}
                    label={{ value: "Autumn (10°C)", position: "insideTopRight" }}
                  />
                  <ReferenceLine 
                    y={0} 
                    stroke="#4169E1" 
                    strokeDasharray="3 3" 
                    strokeWidth={2}
                    label={{ value: "Winter (0°C)", position: "insideBottomRight" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              !loading && (
                <div className="no-data">
                  No moving average data available
                </div>
              )
            )}
          </div>
        </div>
        
        <div className="data-info">
          <p>
            <strong>Data Source:</strong> temperatur.nu API - Vasastan, Örebro
          </p>
          <p>
            <strong>Data Range:</strong> Last 7 days of hourly temperature readings
          </p>
          {data.length > 0 && (
            <p>
              <strong>Data Points:</strong> {data.length} temperature readings
            </p>
          )}
        </div>
      </header>
    </div>
  );
};

export default App;