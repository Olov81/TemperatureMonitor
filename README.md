# Temperature Plot

A React application for visualizing temperature data over time with HTTP data fetching capabilities.

## Features

- **Interactive Temperature Chart**: Uses Recharts library to display temperature vs time data
- **HTTP Data Fetching**: Ready to integrate with any temperature data API using Axios
- **Mock Data**: Includes sample temperature data generator for testing
- **Real-time Updates**: Refresh button to fetch latest temperature readings
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **React 17**: Frontend library
- **TypeScript**: Type safety and better developer experience
- **Vite**: Fast build tool and development server
- **Recharts**: Charting library for React
- **Axios**: HTTP client for API requests

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm

### Installation

1. Clone or download this project
2. Navigate to the project directory
3. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173/`

### Build for Production

Create a production build:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Usage

### Connecting to Your API

To connect to your temperature data API:

1. Open `src/App.tsx`
2. Find the `fetchTemperatureData` function
3. Replace the mock data generation with your API call:

```typescript
const fetchTemperatureData = async () => {
  setLoading(true);
  setError(null);
  
  try {
    // Replace this with your actual API endpoint
    const response = await axios.get('https://your-api-endpoint/temperature-data');
    setData(response.data);
  } catch (err) {
    setError('Failed to fetch temperature data');
    console.error('Error fetching data:', err);
  } finally {
    setLoading(false);
  }
};
```

### Expected Data Format

Your API should return an array of objects with the following structure:

```typescript
[
  {
    timestamp: "2023-12-01T10:00:00.000Z", // ISO string
    temperature: 25.5                      // Temperature in Celsius
  },
  // ... more data points
]
```

## Project Structure

```
src/
├── App.tsx          # Main application component
├── App.css          # Application styles
├── main.tsx         # React entry point
└── index.css        # Global styles
```

## Customization

### Chart Appearance

Modify the chart styling in `src/App.tsx` by adjusting the Recharts component props:

- Colors: Change `stroke` and `fill` properties
- Size: Adjust `ResponsiveContainer` height
- Grid: Modify `CartesianGrid` properties
- Axes: Customize `XAxis` and `YAxis` labels and formatting

### Styling

The application uses CSS modules. Modify styles in:
- `src/App.css` for component-specific styles
- `src/index.css` for global styles

## Contributing

1. Fork the project
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.