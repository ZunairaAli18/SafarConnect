import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Star, Car, Clock, MapPin, Navigation, CheckCircle, Loader2, AlertTriangle, CloudRain, Wind, Eye, Droplets } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { io, Socket } from 'socket.io-client';

interface RideConfirmationPageProps {
  onBack: () => void;
  onRideAccepted: (driver: Driver, rideId: number) => void;
  userToken: string;
  rideDetails: {
    ride_id: number;
    pickup: string;
    drop: string;
    distance: number;
    duration: number;
    fare: number;
    pickupCoords: { lat: number; lon: number };
    dropCoords: { lat: number; lon: number };
    recommended_drivers?: Driver[];
  };
}

interface Driver {
  driver_id: number;
  name: string;
  phone: string;
  rating: number;
  distance_km: number;
  vehicle_type: string;
  vehicle_number: string;
  profile_picture?: string;
}

interface WeatherDetails {
  temperature?: number;
  wind_speed_ms?: number;
  visibility_m?: number;
  humidity?: number;
  condition?: string;
  severity?: string;
}

interface RideDetails {
  ride_id: number;
  user_id: number;
  pickup: string;
  drop: string;
  pickup_latitude: number;
  pickup_longitude: number;
  drop_latitude: number;
  drop_longitude: number;
  fare: number;
  distance_km: number;
  duration_min: number;
}
interface SelectedDriver {
  driver_id: number;
  name: string;
}
export function RideConfirmationPage({ onBack, onRideAccepted, userToken, rideDetails }: RideConfirmationPageProps) {
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'pending' | 'accepted' | 'rejected'>('idle');
  const [requesting, setRequesting] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>(rideDetails.recommended_drivers || []);
  const [loading, setLoading] = useState(!rideDetails.recommended_drivers);
  const [weatherAlert, setWeatherAlert] = useState<string | null>(null);
  const [weatherDetails, setWeatherDetails] = useState<WeatherDetails | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const API_BASE_URL = 'http://localhost:5000';

  // Initialize Socket.IO
  useEffect(() => {
    const newSocket = io(API_BASE_URL, {
      auth: { token: userToken },
      transports: ['websocket', 'polling']
    });

    setSocket(newSocket);

    // Connection events
    newSocket.on('connect', () => {
      console.log('Connected to server');
      // Join the ride room
      newSocket.emit('join_ride', { ride_id: rideDetails.ride_id });
    });

    newSocket.on('joined_room', (data: any) => {
      console.log('Joined room:', data);
    });

    // Listen for driver acceptance
    newSocket.on('driver_accepted', (data: { driver_name: any; }) => {
      console.log('Driver accepted:', data);
      setRequestStatus('accepted');
      alert(`Great! ${data.driver_name} has accepted your ride request!`);
    });

    // Listen for driver rejection
    newSocket.on('driver_rejected', (data: any) => {
      console.log('Driver rejected:', data);
      setRequestStatus('rejected');
      setSelectedDriver(null);
      alert('Driver declined your request. Please select another driver.');
    });

    // Listen for ride started
    newSocket.on('ride_started', (data: any) => {
      console.log('Ride started:', data);
      if (selectedDriver) {
        onRideAccepted(selectedDriver, rideDetails.ride_id);
      }
    });

    newSocket.on('connect_error', (error: any) => {
      console.error('Connection error:', error);
    });

    return () => {
      newSocket.emit('leave_ride', { ride_id: rideDetails.ride_id });
      newSocket.close();
    };
  }, [rideDetails.ride_id, userToken]);

  // Fetch recommended drivers if not provided
  useEffect(() => {
    if (!rideDetails.recommended_drivers || rideDetails.recommended_drivers.length === 0) {
      fetchRecommendedDrivers();
    }
  }, []);

  const fetchRecommendedDrivers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/recommend_drivers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          ride_id: rideDetails.ride_id,
          pickup_lat: rideDetails.pickupCoords.lat,
          pickup_lon: rideDetails.pickupCoords.lon,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setDrivers(data.drivers || []);
      } else {
        console.error('Failed to fetch drivers:', data.msg);
      }
    } catch (error) {
      console.error('Error fetching drivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async () => {
    if (!selectedDriver) return;
    
    setRequesting(true);
    setWeatherAlert(null);
    setWeatherDetails(null);
    console.log(selectedDriver);
    try {
      const response = await fetch(`${API_BASE_URL}/request_driver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          ride_id: rideDetails.ride_id,
          driver_id: selectedDriver.driver_id,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Show weather warning if exists
        if (data.weather_warning) {
          alert(`⚠️ Weather Advisory: ${data.weather_warning}`);
        }

        setRequestStatus('pending');
        alert('Request sent to driver! Waiting for acceptance...');

        // Emit socket event to notify driver
        if (socket) {
          socket.emit('ride_request_sent', {
            ride_id: rideDetails.ride_id,
            driver_id: selectedDriver.driver_id,
          });
        }
      } else {
        // Handle weather-related errors
        if (data.weather_alert) {
          setWeatherAlert(data.weather_alert);
          setWeatherDetails(data.weather_details);
        }
        alert(`Error: ${data.msg}`);
      }
    } catch (error) {
      console.error('Error requesting driver:', error);
      alert('Network error. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const getEstimatedTime = (distanceKm: number) => {
    const minutes = Math.round((distanceKm / 30) * 60);
    return `${minutes} mins`;
  };

  const getButtonContent = () => {
    if (requesting) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Sending Request...
        </>
      );
    }
    
    switch (requestStatus) {
      case 'pending':
        return (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Waiting for Driver...
          </>
        );
      case 'accepted':
        return (
          <>
            <CheckCircle className="w-4 h-4 mr-2" />
            Driver Accepted - Waiting to Start
          </>
        );
      case 'rejected':
        return 'Driver Declined - Select Another';
      default:
        return (
          <>
            <CheckCircle className="w-4 h-4 mr-2" />
            Send Request
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-6xl mx-auto py-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">Select Your Driver</h1>
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        {/* Weather Alert Banner */}
        {weatherAlert && (
          <div className="mb-6 p-4 rounded-lg border-2 bg-red-900/30 border-red-600">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 text-red-400" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2 text-red-200">
                  🚫 Cannot Assign Driver - Severe Weather
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

        {/* Status Banner */}
        {requestStatus === 'pending' && (
          <div className="mb-6 p-4 rounded-lg border-2 bg-yellow-900/30 border-yellow-600">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
              <div>
                <h3 className="font-semibold text-yellow-200">Request Sent</h3>
                <p className="text-slate-200 text-sm">Waiting for {selectedDriver?.name} to accept your ride request...</p>
              </div>
            </div>
          </div>
        )}

        {requestStatus === 'accepted' && (
          <div className="mb-6 p-4 rounded-lg border-2 bg-green-900/30 border-green-600">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <div>
                <h3 className="font-semibold text-green-200">Request Accepted!</h3>
                <p className="text-slate-200 text-sm">{selectedDriver?.name} has accepted your ride. Waiting for driver to start the ride...</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Ride Details */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Trip Summary</h2>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <MapPin className="w-5 h-5 text-blue-400 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-slate-400 text-sm">Pickup</p>
                    <p className="text-white text-sm">{rideDetails.pickup}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Navigation className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-slate-400 text-sm">Drop</p>
                    <p className="text-white text-sm">{rideDetails.drop}</p>
                  </div>
                </div>

                <div className="border-t border-slate-600 pt-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-sm">Distance</span>
                    <span className="text-white">{rideDetails.distance} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 text-sm">Duration</span>
                    <span className="text-white">{rideDetails.duration} mins</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Fare</span>
                    <span className="text-white font-bold text-lg">Rs. {rideDetails.fare}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Selected Driver Details */}
            {selectedDriver && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Selected Driver</h3>
                  
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
                      <span className="text-blue-400 text-2xl font-bold">
                        {selectedDriver.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-semibold text-lg">{selectedDriver.name}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        <span className="text-white text-sm">{selectedDriver.rating.toFixed(1)}</span>
                      </div>
                    </div>
                    {requestStatus === 'accepted' && (
                      <CheckCircle className="w-6 h-6 text-green-400" />
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Vehicle Type</span>
                      <span className="text-white">{selectedDriver.vehicle_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Number</span>
                      <span className="text-white">{selectedDriver.vehicle_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Distance Away</span>
                      <span className="text-white">{selectedDriver.distance_km} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Arrival Time</span>
                      <span className="text-white">{getEstimatedTime(selectedDriver.distance_km)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Phone</span>
                      <span className="text-white">{selectedDriver.phone}</span>
                    </div>
                  </div>

                  <Button
                    onClick={handleSendRequest}
                    disabled={requesting || requestStatus === 'pending' || requestStatus === 'accepted'}
                    className={`w-full mt-6 ${
                      requestStatus === 'accepted' 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : requestStatus === 'pending'
                        ? 'bg-yellow-600'
                        : 'bg-blue-600 hover:bg-blue-700'
                    } text-white`}
                    size="lg"
                  >
                    {getButtonContent()}
                  </Button>
                </Card>
              </motion.div>
            )}
          </div>

          {/* Right Column - Available Drivers */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6">
              <h2 className="text-xl font-semibold text-white mb-4">
                Available Drivers {drivers.length > 0 && `(${drivers.length})`}
              </h2>
              
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  <span className="ml-3 text-slate-300">Loading drivers...</span>
                </div>
              ) : drivers.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-slate-300 text-lg">No drivers available nearby</p>
                  <p className="text-slate-400 text-sm mt-2">Please try again later</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {drivers.map((driver) => (
                    <motion.div
                      key={driver.driver_id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Card
                        onClick={() => requestStatus === 'idle' || requestStatus === 'rejected' ? setSelectedDriver(driver) : null}
                        className={`cursor-pointer transition-all ${
                          selectedDriver?.driver_id === driver.driver_id
                            ? 'bg-blue-600/20 border-blue-500'
                            : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'
                        } ${
                          requestStatus === 'pending' || requestStatus === 'accepted'
                            ? 'opacity-50 cursor-not-allowed'
                            : ''
                        } p-4`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                              <span className="text-blue-400 text-lg font-bold">
                                {driver.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <h3 className="text-white font-semibold">{driver.name}</h3>
                              <div className="flex items-center space-x-1 mt-1">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                <span className="text-white text-xs">{driver.rating.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                          {selectedDriver?.driver_id === driver.driver_id && (
                            <CheckCircle className="w-5 h-5 text-blue-400" />
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 text-xs">
                            <Car className="w-3 h-3 text-slate-400" />
                            <span className="text-slate-300">{driver.vehicle_type}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs">
                            <Badge variant="outline" className="text-slate-300 border-slate-500">
                              {driver.vehicle_number}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">{driver.distance_km} km away</span>
                            <div className="flex items-center space-x-1 text-slate-300">
                              <Clock className="w-3 h-3" />
                              <span>{getEstimatedTime(driver.distance_km)}</span>
                            </div>
                          </div>
                          <div className="text-xs text-slate-400">
                            {driver.phone}
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}

              {!selectedDriver && drivers.length > 0 && (
                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-blue-300 text-sm text-center">
                    Select a driver to send your ride request
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}