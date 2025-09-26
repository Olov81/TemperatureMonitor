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

  // Function to calculate 24-hour moving average
  const calculateMovingAverage = (data: ChartData[], windowSize: number = 24): ChartData[] => {
    return data.map((point, index) => {
      // Calculate the range for the moving average window
      const start = Math.max(0, index - Math.floor(windowSize / 2));
      const end = Math.min(data.length, index + Math.ceil(windowSize / 2));
      
      // Get the values in the window
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
  const fetchTemperatureData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use CORS proxy for production deployment
      const corsProxy = 'https://api.allorigins.win/get?url=';
      const apiUrl = 'http://api.temperatur.nu/tnu_1.17.php?p=vasastan&cli=apan&span=1week&data';
      const proxyUrl = corsProxy + encodeURIComponent(apiUrl);
      
      console.log('🌐 Fetching from API via CORS proxy...');
      
      // Try to fetch from the API via CORS proxy
      const response = await axios.get(proxyUrl, {
        timeout: 15000, // 15 second timeout for proxy
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
        const station = apiData.stations[0]; // Use the first station
        setStationInfo(station);
        const chartData = convertApiDataToChartData(station.data);
        setData(chartData);
        
        // Calculate 24-hour moving average
        const movingAvg = calculateMovingAverage(chartData, 24);
        setMovingAverageData(movingAvg);
        
        // Detect current season
        const currentSeason = detectSeason(movingAvg);
        setSeasonInfo(currentSeason);
        
        console.log('✅ Successfully loaded temperature data from API');
      } else {
        setError('No temperature data available from the API');
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
            onClick={fetchTemperatureData} 
            disabled={loading}
            className="refresh-button"
          >
            {loading ? 'Loading...' : 'Refresh Data'}
          </button>
        </div>
        
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
                  <Tooltip 
                    formatter={(value: number) => [`${value}°C`, 'Temperature']}
                    labelFormatter={(label: string) => {
                      const dataPoint = data.find(d => d.date === label);
                      return dataPoint ? `${dataPoint.date} at ${dataPoint.time}` : label;
                    }}
                  />
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
                  <Tooltip 
                    formatter={(value: number) => [`${value}°C`, '24h Average']}
                    labelFormatter={(label: string) => {
                      const dataPoint = movingAverageData.find(d => d.date === label);
                      return dataPoint ? `${dataPoint.date} at ${dataPoint.time}` : label;
                    }}
                  />
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