import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { MapPin, Navigation, Clock, Phone, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { io } from "socket.io-client";

interface LiveRideTrackingPageProps {
  rideDetails: {
    ride_id: unknown;
    pickup: string;
    drop: string;
    distance: number;
    fare: number;
    pickupCoords: { lat: number; lon: number };
    dropCoords: { lat: number; lon: number };
  };
  driver: {
    id: number;
    name: string;
    rating: number;
    vehicleType: string;
    vehicleModel: string;
    vehicleNumber: string;
  };
  onRideComplete: () => void;
}

interface LocationUpdate {
  lat: number;
  lon: number;
  timestamp: number;
}

export function LiveRideTrackingPage({ rideDetails, driver, onRideComplete }: LiveRideTrackingPageProps) {
  // Ensure coordinates are numbers
  const pickupLat = parseFloat(String(rideDetails.pickupCoords.lat));
  const pickupLon = parseFloat(String(rideDetails.pickupCoords.lon));
  const dropLat = parseFloat(String(rideDetails.dropCoords.lat));
  const dropLon = parseFloat(String(rideDetails.dropCoords.lon));
  
  const [driverLocation, setDriverLocation] = useState<LocationUpdate>({
    lat: pickupLat,
    lon: pickupLon,
    timestamp: Date.now()
  });
  const [rideStatus, setRideStatus] = useState<'arriving' | 'picked_up' | 'in_transit' | 'completed'>('arriving');
  const [eta, setEta] = useState(5);
  const [distanceRemaining, setDistanceRemaining] = useState(rideDetails.distance);
  const [progress, setProgress] = useState(0);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const socketRef = useRef<any>(null);

  // Load Leaflet CSS and JS
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      if (window.L) {
        setLeafletLoaded(true);
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        setLeafletLoaded(true);
      };
      document.head.appendChild(script);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (typeof window !== 'undefined' && mapRef.current && !mapInstanceRef.current && leafletLoaded) {
      // @ts-ignore
      const L = window.L;
      if (L) {
        try {
          const map = L.map(mapRef.current).setView([pickupLat, pickupLon], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(map);

          // Add pickup marker (blue)
          const pickupIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="background-color: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          L.marker([pickupLat, pickupLon], { icon: pickupIcon })
            .addTo(map)
            .bindPopup('<b>Pickup Location</b>');

          // Add drop marker (green)
          const dropIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="background-color: #10b981; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          L.marker([dropLat, dropLon], { icon: dropIcon })
            .addTo(map)
            .bindPopup('<b>Drop Location</b>');

          // Add driver marker (car icon)
          const driverIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="background-color: #f59e0b; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 16px;">🚗</div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          driverMarkerRef.current = L.marker([pickupLat, pickupLon], { icon: driverIcon })
            .addTo(map)
            .bindPopup(`<b>${driver.name}</b><br>${driver.vehicleModel}`);

          // Draw route
          const routeCoordinates = [
            [pickupLat, pickupLon],
            [dropLat, dropLon]
          ];
          L.polyline(routeCoordinates, {
            color: '#3b82f6',
            weight: 4,
            opacity: 0.6,
            dashArray: '10, 10'
          }).addTo(map);

          // Fit bounds to show all markers
          const bounds = [
            [pickupLat, pickupLon],
            [dropLat, dropLon]
          ];
          map.fitBounds(bounds, { padding: [50, 50] });

          mapInstanceRef.current = map;
        } catch (error) {
          console.error('Error initializing map:', error);
        }
      }
    }
  }, [leafletLoaded, rideDetails, driver]);

  // Simulate SocketIO connection and real-time updates
  // useEffect(() => {
  //   // Simulate joining ride room
  //   console.log('Joining ride room:', `ride_${driver.id}_${Date.now()}`);
    
  //   // Simulate receiving location updates
  //   const simulateRide = () => {
  //     let currentStep = 0;
  //     const totalSteps = 50;
      
  //     const interval = setInterval(() => {
  //       currentStep++;
        
  //       // Calculate interpolated position using parsed numbers
  //       const t = currentStep / totalSteps;
  //       const lat = pickupLat + (dropLat - pickupLat) * t;
  //       const lon = pickupLon + (dropLon - pickupLon) * t;
        
  //       const newLocation: LocationUpdate = {
  //         lat,
  //         lon,
  //         timestamp: Date.now()
  //       };
        
  //       setDriverLocation(newLocation);
        
  //       // Update progress
  //       setProgress((t * 100));
        
  //       // Update distance and ETA
  //       const remainingDistance = rideDetails.distance * (1 - t);
  //       setDistanceRemaining(parseFloat(remainingDistance.toFixed(2)));
  //       setEta(Math.max(1, Math.round(remainingDistance / rideDetails.distance * rideDetails.distance * 1.5)));
        
  //       // Update ride status
  //       if (currentStep === 5) {
  //         setRideStatus('picked_up');
  //       } else if (currentStep === 10) {
  //         setRideStatus('in_transit');
  //       } else if (currentStep >= totalSteps) {
  //         setRideStatus('completed');
  //         clearInterval(interval);
  //         setTimeout(() => {
  //           onRideComplete();
  //         }, 2000);
  //       }
        
  //       // Update driver marker on map
  //       if (driverMarkerRef.current && leafletLoaded) {
  //         // @ts-ignore
  //         const L = window.L;
  //         if (L) {
  //           driverMarkerRef.current.setLatLng([lat, lon]);
            
  //           // Optionally pan map to follow driver
  //           if (mapInstanceRef.current) {
  //             mapInstanceRef.current.panTo([lat, lon]);
  //           }
  //         }
  //       }
  //     }, 1000); // Update every second
      
  //     return interval;
  //   };
    
  //   const interval = simulateRide();
    
  //   return () => {
  //     clearInterval(interval);
  //     console.log('Left ride room');
  //   };
  // }, [driver.id, rideDetails, onRideComplete, leafletLoaded, pickupLat, pickupLon, dropLat, dropLon]);
// Connect to backend Socket.IO and listen to ride updates
useEffect(() => {
  if (!leafletLoaded) return;

  // Create socket connection
  const socket = io("http://127.0.0.1:5000", {
    transports: ["websocket"],
  });

  socketRef.current = socket;

  // 1. On connect
  socket.on("connect", () => {
    console.log("Connected:", socket.id);

    // Join passenger ride room
    socket.emit("join_ride", { ride_id: rideDetails.ride_id });

    // Request initial location
    socket.emit("request_current_location", {
      ride_id: rideDetails.ride_id,
    });
  });

  // 2. Receive driver live location
  socket.on("ride_location", (data) => {
    const { lat, lon, timestamp } = data;
    setDriverLocation({ lat, lon, timestamp: Date.now() });

    if (driverMarkerRef.current && mapInstanceRef.current) {
      driverMarkerRef.current.setLatLng([lat, lon]);
      mapInstanceRef.current.panTo([lat, lon]);
    }
  });

  // 3. Receive ride progress data
  socket.on("ride_progress", (data) => {
    const { distance_remaining, eta_minutes, progress } = data;

    setDistanceRemaining(distance_remaining);
    setEta(eta_minutes);
    setProgress(progress);
  });

  // 4. Ride started
  socket.on("ride_started", () => {
    setRideStatus("in_transit");
  });

  // 5. Ride completed
  socket.on("ride_completed", () => {
    setRideStatus("completed");

    setTimeout(() => {
      onRideComplete();
    }, 2000);
  });

  // 6. Any error
  socket.on("location_error", (data) => {
    console.warn("Location Error:", data.msg);
  });

  // Cleanup on unmount
  return () => {
    socket.emit("leave_ride", { ride_id: rideDetails.ride_id });
    socket.disconnect();
  };
}, [leafletLoaded, rideDetails.ride_id]);

  const getStatusMessage = () => {
    switch (rideStatus) {
      case 'arriving':
        return 'Driver is on the way to pick you up';
      case 'picked_up':
        return 'Driver has arrived at pickup location';
      case 'in_transit':
        return 'On the way to destination';
      case 'completed':
        return 'Ride completed!';
      default:
        return 'Tracking ride...';
    }
  };

  const getStatusColor = () => {
    switch (rideStatus) {
      case 'arriving':
        return 'bg-blue-500';
      case 'picked_up':
        return 'bg-yellow-500';
      case 'in_transit':
        return 'bg-green-500';
      case 'completed':
        return 'bg-green-600';
      default:
        return 'bg-slate-500';
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
        <div className="mb-6">
          <h1 className="text-white mb-2">Live Ride Tracking</h1>
          <div className="flex items-center space-x-2">
            <Badge className={`${getStatusColor()} text-white border-0`}>
              {rideStatus.replace('_', ' ').toUpperCase()}
            </Badge>
            <span className="text-slate-300 text-sm">{getStatusMessage()}</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Ride Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Driver Info */}
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6">
              <h3 className="text-white mb-4">Your Driver</h3>
              
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <span className="text-blue-400 text-xl">{driver.name.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-white">{driver.name}</h4>
                  <p className="text-slate-400 text-sm">{driver.vehicleModel}</p>
                  <p className="text-slate-300 text-sm">{driver.vehicleNumber}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                  <Phone className="w-4 h-4 mr-2" />
                  Call
                </Button>
                <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Message
                </Button>
              </div>
            </Card>

            {/* Ride Progress */}
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6">
              <h3 className="text-white mb-4">Ride Progress</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-white">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-600">
                  <div>
                    <div className="flex items-center text-slate-400 text-sm mb-1">
                      <Clock className="w-3 h-3 mr-1" />
                      ETA
                    </div>
                    <p className="text-white">{eta} mins</p>
                  </div>
                  <div>
                    <div className="flex items-center text-slate-400 text-sm mb-1">
                      <Navigation className="w-3 h-3 mr-1" />
                      Distance
                    </div>
                    <p className="text-white">{distanceRemaining} km</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Trip Details */}
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6">
              <h3 className="text-white mb-4">Trip Details</h3>
              
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

                <div className="border-t border-slate-600 pt-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fare</span>
                    <span className="text-white">Rs. {rideDetails.fare}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Safety */}
            <Card className="bg-red-500/10 border-red-500/30 p-4">
              <div className="flex items-center space-x-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">Emergency: Call 1122</span>
              </div>
            </Card>
          </div>

          {/* Right Column - Map */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-4 h-[600px] lg:h-full">
              <h3 className="text-white mb-3">Live Location</h3>
              <div className="relative w-full h-[calc(100%-2rem)]" style={{ minHeight: '500px' }}>
                {!leafletLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-700/50 rounded-lg z-10">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" />
                      <p className="text-slate-300 text-sm">Loading map...</p>
                    </div>
                  </div>
                )}
                <div
                  ref={mapRef}
                  className="w-full h-full rounded-lg overflow-hidden"
                />
              </div>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
