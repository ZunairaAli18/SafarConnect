import { useState, useEffect, useRef } from 'react';
import { MapPin, ArrowLeft, Navigation, DollarSign, Clock, Route, Loader2, AlertTriangle, CloudRain, Wind, Eye, Droplets } from 'lucide-react';

interface RideBookingPageProps {
  onBack: () => void;
  onProceedToConfirmation: (rideDetails: any) => void;
  userToken: string;
  userId: number;
}

interface Location {
  lat: number;
  lon: number;
  display_name: string;
}

interface WeatherDetails {
  temperature?: number;
  wind_speed_ms?: number;
  visibility_m?: number;
  humidity?: number;
  condition?: string;
  severity?: string;
}

export function RideBookingPage({ onBack, onProceedToConfirmation, userToken, userId }: RideBookingPageProps) {
  const [pickupQuery, setPickupQuery] = useState('');
  const [dropQuery, setDropQuery] = useState('');
  const [pickupSuggestions, setPickupSuggestions] = useState<Location[]>([]);
  const [dropSuggestions, setDropSuggestions] = useState<Location[]>([]);
  const [pickupLocation, setPickupLocation] = useState<Location | null>(null);
  const [dropLocation, setDropLocation] = useState<Location | null>(null);
  const [minFare, setMinFare] = useState('');
  const [maxFare, setMaxFare] = useState('');
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [weatherAlert, setWeatherAlert] = useState<string | null>(null);
  const [weatherDetails, setWeatherDetails] = useState<WeatherDetails | null>(null);
  const [weatherSafe, setWeatherSafe] = useState(true);
  const [fareEstimate, setFareEstimate] = useState({
    distance: 0,
    duration: 0,
    estimatedFare: 0
  });
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);

  const API_BASE_URL = 'https://localhost:5000';

  // Load Leaflet CSS and JS
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ((window as any).L) {
        setLeafletLoaded(true);
        return;
      }
      console.log(userToken);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => setLeafletLoaded(true);
      document.head.appendChild(script);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (typeof window !== 'undefined' && mapRef.current && !mapInstanceRef.current && leafletLoaded) {
      const L = (window as any).L;
      if (L) {
        try {
          const map = L.map(mapRef.current).setView([30.3753, 69.3451], 6);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(map);
          
          const pakistanBounds = [[23.5, 60.0], [37.0, 77.0]];
          map.setMaxBounds(pakistanBounds);
          map.setMinZoom(6);
          
          mapInstanceRef.current = map;
        } catch (error) {
          console.error('Error initializing map:', error);
        }
      }
    }
  }, [leafletLoaded]);

  // Search for locations
  const searchLocation = async (query: string, isPickup: boolean) => {
    if (query.length < 3) {
      if (isPickup) setPickupSuggestions([]);
      else setDropSuggestions([]);
      return;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Pakistan')}&limit=5`,
        { headers: { 'User-Agent': 'SafarConnect/1.0' } }
      );
      
      const data = await response.json();
      if (isPickup) setPickupSuggestions(data);
      else setDropSuggestions(data);
    } catch (error) {
      console.error('Error searching location:', error);
    }
  };

  // Update map markers and route
  useEffect(() => {
    if (!leafletLoaded || !mapInstanceRef.current || (!pickupLocation && !dropLocation)) return;

    const L = (window as any).L;
    if (!L) return;

    try {
      mapInstanceRef.current.eachLayer((layer: any) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });

      if (routeLayerRef.current) {
        mapInstanceRef.current.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }

      const bounds: any[] = [];

      if (pickupLocation) {
        const pickupIcon = L.divIcon({
          className: 'custom-marker',
          html: '<div style="background-color: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        
        L.marker([pickupLocation.lat, pickupLocation.lon], { icon: pickupIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup('<b>Pickup Location</b><br>' + pickupLocation.display_name);
        bounds.push([pickupLocation.lat, pickupLocation.lon]);
      }

      if (dropLocation) {
        const dropIcon = L.divIcon({
          className: 'custom-marker',
          html: '<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        
        L.marker([dropLocation.lat, dropLocation.lon], { icon: dropIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup('<b>Drop Location</b><br>' + dropLocation.display_name);
        bounds.push([dropLocation.lat, dropLocation.lon]);
      }

      if (pickupLocation && dropLocation) {
        const routeCoordinates = [
          [pickupLocation.lat, pickupLocation.lon],
          [dropLocation.lat, dropLocation.lon]
        ];

        routeLayerRef.current = L.polyline(routeCoordinates, {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.7,
          dashArray: '10, 10'
        }).addTo(mapInstanceRef.current);

        fetchRoute(pickupLocation, dropLocation);
      }

      if (bounds.length > 0) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
      }

      if (pickupLocation && dropLocation) {
        estimateFareFromBackend();
      }
    } catch (error) {
      console.error('Error updating map:', error);
    }
  }, [pickupLocation, dropLocation, leafletLoaded]);

  // Fetch actual route from OSRM
  const fetchRoute = async (pickup: Location, drop: Location) => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${pickup.lon},${pickup.lat};${drop.lon},${drop.lat}?overview=full&geometries=geojson`
      );
      
      if (!response.ok) throw new Error('Failed to fetch route');
      
      const data = await response.json();
      
      if (data.routes && data.routes.length > 0) {
        const L = (window as any).L;
        if (!L || !mapInstanceRef.current) return;

        if (routeLayerRef.current) {
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
        }

        const coordinates = data.routes[0].geometry.coordinates.map(
          (coord: number[]) => [coord[1], coord[0]]
        );

        routeLayerRef.current = L.polyline(coordinates, {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.8
        }).addTo(mapInstanceRef.current);
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    }
  };

  // Estimate fare from backend
  const estimateFareFromBackend = async () => {
    if (!pickupLocation || !dropLocation) return;

    setEstimating(true);
    setWeatherAlert(null);
    setWeatherDetails(null);
    console.log(userToken);
    try {
      const response = await fetch(`${API_BASE_URL}/estimate_fare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          pickup_lat: pickupLocation.lat,
          pickup_lon: pickupLocation.lon,
          drop_lat: dropLocation.lat,
          drop_lon: dropLocation.lon,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setFareEstimate({
          distance: data.distance_km,
          duration: data.duration_min,
          estimatedFare: data.estimated_fare
        });

        setMinFare((data.estimated_fare * 0.8).toFixed(2));
        setMaxFare((data.estimated_fare * 1.2).toFixed(2));

        // Handle weather alerts
        setWeatherSafe(data.weather_safe);
        if (!data.weather_safe || data.weather_alert) {
          setWeatherAlert(data.weather_alert);
          setWeatherDetails(data.weather_details);
        }
      } else {
        alert('Failed to estimate fare. Please try again.');
      }
    } catch (error) {
      console.error('Error estimating fare:', error);
      alert('Network error. Please check your connection.');
    } finally {
      setEstimating(false);
    }
  };

  // Create ride request
  const handleSubmit = async () => {
    if (!pickupLocation || !dropLocation) {
      alert('Please select both pickup and drop locations');
      return;
    }

    if (!weatherSafe) {
      const proceed = window.confirm(
        `⚠️ WEATHER ALERT: ${weatherAlert}\n\nAre you sure you want to proceed?`
      );
      if (!proceed) return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/create_ride_request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          user_id: userId,
          pickup_name: pickupQuery,
          drop_name: dropQuery,
          pickup_lat: pickupLocation.lat,
          pickup_lon: pickupLocation.lon,
          drop_lat: dropLocation.lat,
          drop_lon: dropLocation.lon,
          min_fare: parseFloat(minFare),
          max_fare: parseFloat(maxFare),
          estimated_fare: fareEstimate.estimatedFare,
          distance_km: fareEstimate.distance,
          duration_min: fareEstimate.duration,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Show weather warning if exists
        if (data.weather_warning) {
          alert(`⚠️ Weather Advisory: ${data.weather_warning}`);
        }

        onProceedToConfirmation({
          ride_id: data.ride_id,
          pickup: pickupQuery,
          drop: dropQuery,
          distance: data.distance_km,
          duration: data.duration_min,
          fare: data.estimated_fare,
          pickupCoords: { lat: pickupLocation.lat, lon: pickupLocation.lon },
          dropCoords: { lat: dropLocation.lat, lon: dropLocation.lon },
        });
      } else {
        alert(`Error: ${data.msg}`);
      }
    } catch (error) {
      console.error('Error creating ride request:', error);
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 p-4 overflow-y-auto">
      <div className="w-full max-w-6xl mx-auto py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">Book a Ride</h1>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Profile
          </button>
        </div>

        {/* Weather Alert Banner */}
        {weatherAlert && (
          <div className={`mb-6 p-4 rounded-lg border-2 ${
            weatherSafe 
              ? 'bg-yellow-900/30 border-yellow-600' 
              : 'bg-red-900/30 border-red-600'
          }`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`w-6 h-6 flex-shrink-0 ${
                weatherSafe ? 'text-yellow-400' : 'text-red-400'
              }`} />
              <div className="flex-1">
                <h3 className={`font-semibold mb-2 ${
                  weatherSafe ? 'text-yellow-200' : 'text-red-200'
                }`}>
                  {weatherSafe ? '⚠️ Weather Advisory' : '🚫 Severe Weather Alert'}
                </h3>
                <p className="text-slate-200 mb-3">{weatherAlert}</p>
                
                {weatherDetails && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {weatherDetails.temperature && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <CloudRain className="w-4 h-4" />
                        <span>{weatherDetails.temperature}°C</span>
                      </div>
                    )}
                    {weatherDetails.wind_speed_ms && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Wind className="w-4 h-4" />
                        <span>{weatherDetails.wind_speed_ms} m/s</span>
                      </div>
                    )}
                    {weatherDetails.visibility_m && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Eye className="w-4 h-4" />
                        <span>{(weatherDetails.visibility_m / 1000).toFixed(1)} km</span>
                      </div>
                    )}
                    {weatherDetails.humidity && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Droplets className="w-4 h-4" />
                        <span>{weatherDetails.humidity}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - Form */}
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur border border-slate-600 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Trip Details</h2>

              {/* Pickup Location */}
              <div className="space-y-2 mb-4 relative">
                <label className="text-slate-200 text-sm font-medium">Pickup Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-blue-400" />
                  <input
                    value={pickupQuery}
                    onChange={(e) => {
                      setPickupQuery(e.target.value);
                      searchLocation(e.target.value, true);
                    }}
                    placeholder="Enter pickup location"
                    className="w-full bg-slate-700/50 border border-slate-600 text-white placeholder:text-slate-400 pl-10 pr-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {pickupSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-slate-800 border border-slate-600 rounded-md mt-1 max-h-48 overflow-y-auto">
                    {pickupSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setPickupLocation(suggestion);
                          setPickupQuery(suggestion.display_name);
                          setPickupSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-700 text-slate-200 text-sm"
                      >
                        {suggestion.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Drop Location */}
              <div className="space-y-2 mb-4 relative">
                <label className="text-slate-200 text-sm font-medium">Drop Location</label>
                <div className="relative">
                  <Navigation className="absolute left-3 top-3 w-4 h-4 text-green-400" />
                  <input
                    value={dropQuery}
                    onChange={(e) => {
                      setDropQuery(e.target.value);
                      searchLocation(e.target.value, false);
                    }}
                    placeholder="Enter drop location"
                    className="w-full bg-slate-700/50 border border-slate-600 text-white placeholder:text-slate-400 pl-10 pr-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                {dropSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-slate-800 border border-slate-600 rounded-md mt-1 max-h-48 overflow-y-auto">
                    {dropSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setDropLocation(suggestion);
                          setDropQuery(suggestion.display_name);
                          setDropSuggestions([]);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-700 text-slate-200 text-sm"
                      >
                        {suggestion.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fare Estimate */}
              {estimating && (
                <div className="bg-slate-700/50 rounded-lg p-4 mb-4 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400 mr-2" />
                  <span className="text-slate-300">Estimating fare...</span>
                </div>
              )}

              {pickupLocation && dropLocation && !estimating && fareEstimate.estimatedFare > 0 && (
                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3 mb-4">
                  <h3 className="text-lg font-semibold text-white">Fare Estimate</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center text-slate-400 text-sm mb-1">
                        <Route className="w-3 h-3 mr-1" />
                        Distance
                      </div>
                      <p className="text-white font-semibold">{fareEstimate.distance} km</p>
                    </div>
                    <div>
                      <div className="flex items-center text-slate-400 text-sm mb-1">
                        <Clock className="w-3 h-3 mr-1" />
                        Duration
                      </div>
                      <p className="text-white font-semibold">{fareEstimate.duration} mins</p>
                    </div>
                    <div>
                      <div className="flex items-center text-slate-400 text-sm mb-1">
                        <DollarSign className="w-3 h-3 mr-1" />
                        Fare
                      </div>
                      <p className="text-white font-semibold">Rs. {fareEstimate.estimatedFare}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Min/Max Fare */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <label className="text-slate-200 text-sm font-medium">Min Fare (Rs.)</label>
                  <input
                    type="number"
                    value={minFare}
                    onChange={(e) => setMinFare(e.target.value)}
                    placeholder="Min fare"
                    className="w-full bg-slate-700/50 border border-slate-600 text-white placeholder:text-slate-400 px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-slate-200 text-sm font-medium">Max Fare (Rs.)</label>
                  <input
                    type="number"
                    value={maxFare}
                    onChange={(e) => setMaxFare(e.target.value)}
                    placeholder="Max fare"
                    className="w-full bg-slate-700/50 border border-slate-600 text-white placeholder:text-slate-400 px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || !pickupLocation || !dropLocation || estimating}
                className={`w-full py-3 px-4 rounded-md font-semibold transition-colors ${
                  loading || !pickupLocation || !dropLocation || estimating
                    ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating Ride Request...
                  </span>
                ) : (
                  'Find Drivers'
                )}
              </button>
            </div>
          </div>

          {/* Right Column - Map */}
          <div>
            <div className="bg-slate-800/50 backdrop-blur border border-slate-600 rounded-lg p-4 h-[600px] lg:h-full">
              <h3 className="text-lg font-semibold text-white mb-3">Route Map</h3>
              <div className="relative w-full h-[calc(100%-2rem)]" style={{ minHeight: '400px' }}>
                {!leafletLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-700/50 rounded-lg">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" />
                      <p className="text-slate-300 text-sm">Loading map...</p>
                    </div>
                  </div>
                )}
                <div ref={mapRef} className="w-full h-full rounded-lg overflow-hidden" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}