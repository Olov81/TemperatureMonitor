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
  minTemperature?: number;
  maxTemperature?: number;
  time: string; // for display purposes
  date: string; // for display purposes
}

const App: React.FC = () => {
  const [data, setData] = useState<ChartData[]>([]);
  const [movingAverageData, setMovingAverageData] = useState<ChartData[]>([]);
  const [minMaxData, setMinMaxData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stationInfo, setStationInfo] = useState<Station | null>(null);
  const [seasonInfo, setSeasonInfo] = useState<{ season: string; message: string }>({ season: 'unknown', message: '' });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [weatherPrediction, setWeatherPrediction] = useState<{
    trend: string;
    confidence: string;
    prediction: string;
    reasoning: string;
    rangeSlope: number;
    currentRange: number;
    averageRange: number;
  } | null>(null);

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
      
      // Determine the chart type
      const isMovingAverage = payload[0].name?.includes('Moving Average');
      const isMinMax = payload.some((p: any) => p.name?.includes('Maximum') || p.name?.includes('Minimum'));
      
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
          {isMinMax ? (
            // Min/Max chart tooltip
            <>
              {payload.map((entry: any, index: number) => (
                <p key={index} style={{ margin: '0', color: entry.color }}>
                  🌡️ {entry.name}: {entry.value.toFixed(1)}°C
                </p>
              ))}
              {data.minTemperature && data.maxTemperature && (
                <p style={{ margin: '5px 0 0 0', fontStyle: 'italic', color: '#6c757d' }}>
                  Range: {(data.maxTemperature - data.minTemperature).toFixed(1)}°C
                </p>
              )}
            </>
          ) : (
            // Regular or moving average tooltip
            <p style={{ margin: '0', color: payload[0].color }}>
              🌡️ {isMovingAverage ? '24h Moving Average' : 'Temperature'}: {payload[0].value.toFixed(1)}°C
            </p>
          )}
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

  // Function to interpolate missing values (NaN) using linear interpolation
  const interpolateMissingValues = (data: ChartData[]): ChartData[] => {
    if (data.length === 0) return data;
    
    const result = [...data];
    let interpolatedCount = 0;
    
    for (let i = 0; i < result.length; i++) {
      if (isNaN(result[i].temperature)) {
        interpolatedCount++;
        
        // Find the nearest valid values before and after this point
        let prevIndex = i - 1;
        let nextIndex = i + 1;
        
        // Find previous valid value
        while (prevIndex >= 0 && isNaN(result[prevIndex].temperature)) {
          prevIndex--;
        }
        
        // Find next valid value
        while (nextIndex < result.length && isNaN(result[nextIndex].temperature)) {
          nextIndex++;
        }
        
        // Interpolate value
        if (prevIndex >= 0 && nextIndex < result.length) {
          // Linear interpolation between two valid points
          const prevTemp = result[prevIndex].temperature;
          const nextTemp = result[nextIndex].temperature;
          const steps = nextIndex - prevIndex;
          const currentStep = i - prevIndex;
          
          result[i].temperature = prevTemp + (nextTemp - prevTemp) * (currentStep / steps);
        } else if (prevIndex >= 0) {
          // Use the last valid value (forward fill)
          result[i].temperature = result[prevIndex].temperature;
        } else if (nextIndex < result.length) {
          // Use the next valid value (backward fill)
          result[i].temperature = result[nextIndex].temperature;
        }
        // If no valid values exist at all, leave as NaN (shouldn't happen in practice)
      }
    }
    
    if (interpolatedCount > 0) {
      console.log(`🔧 Interpolated ${interpolatedCount} missing temperature values`);
    }
    
    return result;
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

  // Function to calculate 24-hour trailing min/max temperatures
  const calculateMinMax = (data: ChartData[], windowSize: number = 24): ChartData[] => {
    return data.map((point, index) => {
      // Use trailing window: take the current point and the previous (windowSize-1) points
      const start = Math.max(0, index - windowSize + 1);
      const end = index + 1;
      
      // Get the values in the trailing window
      const windowData = data.slice(start, end);
      const temps = windowData.map(item => item.temperature);
      
      // Calculate min and max
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);
      
      return {
        ...point,
        minTemperature: Math.round(minTemp * 10) / 10,
        maxTemperature: Math.round(maxTemp * 10) / 10,
        // Keep original temperature for reference
        temperature: point.temperature
      };
    });
  };

  // Function to predict weather based on temperature range slope analysis
  const predictWeatherFromRange = (minMaxData: ChartData[]) => {
    if (minMaxData.length < 48) return null; // Need at least 2 days of data

    // Calculate daily temperature ranges for the last few days
    const dailyRanges: number[] = [];
    const hoursPerDay = 24;
    
    // Get ranges for the last 5 days (or available data)
    for (let day = 0; day < Math.min(5, Math.floor(minMaxData.length / hoursPerDay)); day++) {
      const dayStart = minMaxData.length - (day + 1) * hoursPerDay;
      const dayEnd = minMaxData.length - day * hoursPerDay;
      
      if (dayStart >= 0) {
        const dayData = minMaxData.slice(dayStart, dayEnd);
        const dayRanges = dayData.map(point => 
          (point.maxTemperature || 0) - (point.minTemperature || 0)
        );
        const avgDayRange = dayRanges.reduce((sum, range) => sum + range, 0) / dayRanges.length;
        dailyRanges.unshift(avgDayRange); // Add to beginning to maintain chronological order
      }
    }

    if (dailyRanges.length < 3) return null;

    // Calculate slope of temperature range over recent days
    const n = dailyRanges.length;
    const xValues = Array.from({ length: n }, (_, i) => i);
    const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
    const yMean = dailyRanges.reduce((sum, y) => sum + y, 0) / n;
    
    const numerator = xValues.reduce((sum, x, i) => sum + (x - xMean) * (dailyRanges[i] - yMean), 0);
    const denominator = xValues.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
    
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const currentRange = dailyRanges[dailyRanges.length - 1];
    const averageRange = yMean;

    // Determine weather prediction based on slope and current range
    let trend: string;
    let confidence: string;
    let prediction: string;
    let reasoning: string;

    const slopeThreshold = 0.5; // °C per day
    const rangeThreshold = 8; // °C

    if (Math.abs(slope) < slopeThreshold) {
      trend = 'stable';
      confidence = currentRange > rangeThreshold ? 'high' : 'medium';
      prediction = currentRange > rangeThreshold 
        ? 'Continued clear, stable weather' 
        : 'Continued cloudy, stable conditions';
      reasoning = `Temperature range has been stable around ${currentRange.toFixed(1)}°C`;
    } else if (slope > slopeThreshold) {
      trend = 'increasing';
      confidence = 'medium';
      prediction = 'Clearing skies, improving weather conditions';
      reasoning = `Temperature range increasing by ${slope.toFixed(1)}°C/day - suggests clearing weather`;
    } else {
      trend = 'decreasing';
      confidence = 'medium';
      prediction = 'Increasing cloud cover, possible weather change';
      reasoning = `Temperature range decreasing by ${Math.abs(slope).toFixed(1)}°C/day - suggests increasing clouds`;
    }

    // Adjust confidence based on data consistency
    const rangeVariability = dailyRanges.reduce((sum, range) => sum + Math.abs(range - averageRange), 0) / n;
    if (rangeVariability > 2) {
      confidence = confidence === 'high' ? 'medium' : 'low';
    }

    return {
      trend,
      confidence,
      prediction,
      reasoning,
      rangeSlope: Math.round(slope * 100) / 100,
      currentRange: Math.round(currentRange * 10) / 10,
      averageRange: Math.round(averageRange * 10) / 10
    };
  };

  // Function to detect season based on current 24-hour average temperature
  const detectSeason = (movingAvgData: ChartData[]): { season: string; message: string } => {
    if (movingAvgData.length === 0) {
      return { season: 'unknown', message: '' };
    }
    
    // Get the current (most recent) 24-hour average temperature
    const currentTemp = movingAvgData[movingAvgData.length - 1].temperature;
    
    // Get current date to determine if it's first or second half of year
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11, so add 1 for 1-12
    const isFirstHalfOfYear = currentMonth <= 6; // January-June
    
    // Determine season based on current temperature and time of year
    if (currentTemp < 0) {
      return { season: 'winter', message: 'Winter-like temperatures' };
    } else if (currentTemp < 10) {
      // Temperature between 0-10°C: Spring or Autumn based on time of year
      if (isFirstHalfOfYear) {
        return { season: 'spring', message: 'Spring-like temperatures' };
      } else {
        return { season: 'autumn', message: 'Autumn-like temperatures' };
      }
    } else {
      return { season: 'summer', message: 'Summer-like temperatures' };
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
          const rawChartData = convertApiDataToChartData(cachedData.data);
          const chartData = interpolateMissingValues(rawChartData);
          setData(chartData);
          
          const movingAvg = calculateMovingAverage(chartData, 24);
          setMovingAverageData(movingAvg);
          
          const minMax = calculateMinMax(chartData, 24);
          setMinMaxData(minMax);
          
          const prediction = predictWeatherFromRange(minMax);
          setWeatherPrediction(prediction);
          
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
          const rawChartData = convertApiDataToChartData(station.data);
          const chartData = interpolateMissingValues(rawChartData);
          setData(chartData);
          
          const movingAvg = calculateMovingAverage(chartData, 24);
          setMovingAverageData(movingAvg);
          
          const minMax = calculateMinMax(chartData, 24);
          setMinMaxData(minMax);
          
          const prediction = predictWeatherFromRange(minMax);
          setWeatherPrediction(prediction);
          
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
          const rawChartData = convertApiDataToChartData(station.data);
          const chartData = interpolateMissingValues(rawChartData);
          setData(chartData);
          
          const movingAvg = calculateMovingAverage(chartData, 24);
          setMovingAverageData(movingAvg);
          
          const minMax = calculateMinMax(chartData, 24);
          setMinMaxData(minMax);
          
          const prediction = predictWeatherFromRange(minMax);
          setWeatherPrediction(prediction);
          
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
          const rawChartData = convertApiDataToChartData(station.data);
          const chartData = interpolateMissingValues(rawChartData);
          setData(chartData);
          
          // Calculate 24-hour moving average for fallback data too
          const movingAvg = calculateMovingAverage(chartData, 24);
          setMovingAverageData(movingAvg);
          
          // Calculate 24-hour min/max for fallback data too
          const minMax = calculateMinMax(chartData, 24);
          setMinMaxData(minMax);
          
          // Predict weather from fallback data too
          const prediction = predictWeatherFromRange(minMax);
          setWeatherPrediction(prediction);
          
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
                {seasonInfo.season === 'spring' && '🌸'}
                {seasonInfo.season === 'autumn' && '🍂'}
                {seasonInfo.season === 'winter' && '❄️'}
                <strong> {seasonInfo.message} </strong>
                {seasonInfo.season === 'summer' && '☀️'}
                {seasonInfo.season === 'spring' && '🌸'}
                {seasonInfo.season === 'autumn' && '🍂'}
                {seasonInfo.season === 'winter' && '❄️'}
                <br />
                <small>
                  {seasonInfo.season === 'summer' && 'Current 24-hour average temperature is above 10°C'}
                  {seasonInfo.season === 'spring' && 'Current 24-hour average temperature is between 0°C and 10°C (first half of year)'}
                  {seasonInfo.season === 'autumn' && 'Current 24-hour average temperature is between 0°C and 10°C (second half of year)'}
                  {seasonInfo.season === 'winter' && 'Current 24-hour average temperature is below 0°C'}
                </small>
              </div>
            )}
          </div>
        )}
        
        {/* Weather Prediction based on Temperature Range Analysis */}
        {weatherPrediction && (
          <div className={`weather-prediction ${weatherPrediction.confidence}`}>
            <h3>🌦️ Weather Prediction</h3>
            <div className="prediction-content">
              <div className="main-prediction">
                <strong>{weatherPrediction.prediction}</strong>
                <span className={`confidence-badge ${weatherPrediction.confidence}`}>
                  {weatherPrediction.confidence.toUpperCase()} CONFIDENCE
                </span>
              </div>
              <div className="prediction-details">
                <p><strong>Analysis:</strong> {weatherPrediction.reasoning}</p>
                <div className="range-stats">
                  <span>📊 Current range: <strong>{weatherPrediction.currentRange}°C</strong></span>
                  <span>📈 Average range: <strong>{weatherPrediction.averageRange}°C</strong></span>
                  <span>📉 Trend slope: <strong>{weatherPrediction.rangeSlope > 0 ? '+' : ''}{weatherPrediction.rangeSlope}°C/day</strong></span>
                </div>
              </div>
            </div>
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
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={data}
                  margin={{
                    top: 5,
                    right: 15,
                    left: 5,
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
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={movingAverageData}
                  margin={{
                    top: 5,
                    right: 15,
                    left: 5,
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

          <div className="chart-container">
            <h3>24-Hour Min/Max Temperature Range</h3>
            {minMaxData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={minMaxData}
                  margin={{
                    top: 5,
                    right: 15,
                    left: 5,
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
                    dataKey="maxTemperature" 
                    stroke="#ff4444" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6 }}
                    name="24h Maximum"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="minTemperature" 
                    stroke="#4444ff" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6 }}
                    name="24h Minimum"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              !loading && (
                <div className="no-data">
                  No min/max data available
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