import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Navigation, Clock, DollarSign, User, CheckCircle, XCircle, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { io, Socket } from 'socket.io-client';

interface RideRequest {
  id: string;
  riderName: string;
  pickup: string;
  drop: string;
  pickupCoords: { lat: number; lon: number };
  dropCoords: { lat: number; lon: number };
  distance: number;
  fare: number;
  estimatedTime: number;
  timestamp: string;
}

interface DriverDashboardProps {
  onLogout: () => void;
  onBackToProfile: () => void;
  onAcceptRide: (request: RideRequest) => void;
}

export function DriverDashboard({ onLogout, onBackToProfile, onAcceptRide }: DriverDashboardProps) {
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [totalRides, setTotalRides] = useState(0);
  const [rating, setRating] = useState(0);

  const driverId = localStorage.getItem('driverId'); // Driver ID from localStorage
  console.log(driverId);
  const authToken = localStorage.getItem('authToken'); // JWT token from localStorage
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:5000'); // replace with your server URL

    socketRef.current.on('connect', () => {
      console.log('Connected to socket server', socketRef.current?.id);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);
  useEffect(() => {
    // Fetch driver stats
    fetch(`http://127.0.0.1:5000/driver/${driverId}/stats`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setTotalRides(data.total_rides);
          setRating(data.average_rating || 0);
        }
      })
      .catch(console.error);

    // Fetch pending rides
    fetch(`http://127.0.0.1:5000/driver/${driverId}/get_requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.rides.length > 0) {
          const mappedRides = data.rides.map((r: any) => ({
            id: r.ride_id.toString(),
            riderName: r.user_name,
            pickup: r.pickup,
            drop: r.drop,
            pickupCoords: { lat: r.pickup_latitude, lon: r.pickup_longitude },
            dropCoords: { lat: r.drop_latitude, lon: r.drop_longitude },
            distance: r.distance_km,
            fare: r.fare,
            estimatedTime: r.duration_min,
            timestamp: r.ride_date,
          }));
          setRideRequests(mappedRides);
        }
      })
      .catch(console.error);
  }, []);

  const handleAccept = async (request: RideRequest) => {

  try {
    const res = await fetch(
      `http://localhost:5000/driver/${driverId}/accept_ride`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ ride_id: request.id }),
      }
    );

    const data = await res.json();

    if (data.ok) {
      socketRef.current?.emit('driver_accept_ride_socket', {
        ride_id: request.id,
        driver_id: driverId,
        driver_name: 'Driver Name', // optional, you can fetch from state
      });
      // Remove from UI list
      setRideRequests(prev => prev.filter(r => r.id !== request.id));
      onAcceptRide(request);   // your existing callback
    } else {
      alert(data.msg);
    }
  } catch (err) {
    console.error(err);
    alert("Error accepting ride");
  }
};


  const handleReject = async (rideId: string) => {

  try {
    const res = await fetch(
      `http://localhost:5000/driver/${driverId}/reject`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ ride_id: rideId }),
      }
    );

    const data = await res.json();

    if (data.ok) {
      socketRef.current?.emit('driver_reject_ride_socket', {
        ride_id: rideId,
        driver_id: driverId,
      });
      setRideRequests(prev => prev.filter(r => r.id !== rideId));
    } else {
      alert(data.msg);
    }
  } catch (err) {
    console.error(err);
    alert("Error rejecting ride");
  }
};


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-4xl mx-auto py-6">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-white mb-2">Driver Dashboard</h1>
            <p className="text-slate-300">
              {rideRequests.length} pending {rideRequests.length === 1 ? 'request' : 'requests'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onBackToProfile}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <User className="w-4 h-4 mr-2" />
              Profile
            </Button>
            <Button variant="ghost" onClick={onLogout} className="text-slate-300 hover:text-white">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="bg-green-500/10 border-green-500/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Rides</p>
                <p className="text-white text-2xl mt-1">{totalRides}</p>
              </div>
              <div className="bg-green-500/20 p-3 rounded-full">
                <Navigation className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </Card>

          <Card className="bg-yellow-500/10 border-yellow-500/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Rating</p>
                <p className="text-white text-2xl mt-1">{rating} ⭐</p>
              </div>
              <div className="bg-yellow-500/20 p-3 rounded-full">
                <User className="w-6 h-6 text-yellow-400" />
              </div>
            </div>
          </Card>
        </div>

        {/* Pending Ride Requests */}
        <div>
          <h2 className="text-white mb-4">Pending Ride Requests</h2>
          
          {rideRequests.length === 0 ? (
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-12">
              <div className="text-center">
                <div className="bg-slate-700/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-white mb-2">No Pending Requests</h3>
                <p className="text-slate-400">
                  New ride requests will appear here. Keep your app open to receive requests.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {rideRequests.map((request) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6 hover:border-green-500/30 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        {/* Left Section - Ride Details */}
                        <div className="flex-1 space-y-4">
                          <div className="flex items-center space-x-3">
                            <div className="bg-blue-500/20 p-2 rounded-full">
                              <User className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-white">{request.riderName}</p>
                              <p className="text-slate-400 text-sm">{request.timestamp}</p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-start space-x-3">
                              <MapPin className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-slate-400 text-xs">Pickup</p>
                                <p className="text-white text-sm">{request.pickup}</p>
                              </div>
                            </div>

                            <div className="flex items-start space-x-3">
                              <Navigation className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-slate-400 text-xs">Drop</p>
                                <p className="text-white text-sm">{request.drop}</p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-4 pt-2">
                            <Badge variant="outline" className="border-slate-600 text-slate-300">
                              <Navigation className="w-3 h-3 mr-1" />
                              {request.distance} km
                            </Badge>
                            <Badge variant="outline" className="border-slate-600 text-slate-300">
                              <Clock className="w-3 h-3 mr-1" />
                              ~{request.estimatedTime} mins
                            </Badge>
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              <DollarSign className="w-3 h-3 mr-1" />
                              Rs. {request.fare}
                            </Badge>
                          </div>
                        </div>

                        {/* Right Section - Action Buttons */}
                        <div className="flex lg:flex-col gap-3 lg:w-32">
                          <Button onClick={() => handleAccept(request)} className="flex-1 lg:w-full bg-green-600 hover:bg-green-700 text-white">
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Accept
                          </Button>
                          <Button onClick={() => handleReject(request.id)} variant="outline" className="flex-1 lg:w-full border-red-500/50 text-red-400 hover:bg-red-500/10">
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Help Section */}
        <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6 mt-6">
          <h3 className="text-white mb-3">Need Help?</h3>
          <p className="text-slate-400 text-sm mb-4">
            Having issues or questions? Contact our driver support team 24/7.
          </p>
          <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
            Contact Support
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}
