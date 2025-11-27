import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { io, Socket } from "socket.io-client";
import { MapPin, Navigation, Clock, Phone, MessageSquare, AlertCircle, Loader2, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';

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
}

interface DriverLiveRidePageProps {
  rideRequest: RideRequest;
  onCompleteRide: () => void;
  onCancelRide: () => void;
}

interface LocationUpdate {
  lat: number;
  lon: number;
  timestamp: number;
}

let socket: Socket;

export function DriverLiveRidePage({ rideRequest, onCompleteRide, onCancelRide }: DriverLiveRidePageProps) {
  const socketRef = useRef<Socket | null>(null);

  const driverId = parseInt(localStorage.getItem('driverId') || '0', 10);
  const authToken = localStorage.getItem('authToken') || '';
  if (!driverId) console.error('Driver ID not found in localStorage!');

  const rideId = rideRequest.id;
  const pickupLat = rideRequest.pickupCoords.lat;
  const pickupLon = rideRequest.pickupCoords.lon;
  const dropLat = rideRequest.dropCoords.lat;
  const dropLon = rideRequest.dropCoords.lon;

  const initialDriverLat = pickupLat - 0.01;
  const initialDriverLon = pickupLon - 0.01;

  const [rideStatus, setRideStatus] = useState<'arriving' | 'at_pickup' | 'in_transit' | 'completed'>('arriving');
  const [driverLocation, setDriverLocation] = useState<LocationUpdate>({ lat: initialDriverLat, lon: initialDriverLon, timestamp: Date.now() });
  const [progress, setProgress] = useState(0);
  const [distanceRemaining, setDistanceRemaining] = useState(rideRequest.distance);
  const [eta, setEta] = useState(rideRequest.estimatedTime);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);

  // --- Load Leaflet ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ((window as any).L) { setLeafletLoaded(true); return; }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => { setLeafletLoaded(true); };
      document.head.appendChild(script);
    }
  }, []);

  // --- Initialize map ---
  useEffect(() => {
    if (mapRef.current && leafletLoaded && !mapInstanceRef.current) {
      const L = (window as any).L;
      const map = L.map(mapRef.current).setView([initialDriverLat, initialDriverLon], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      const pickupIcon = L.divIcon({ className:'custom-marker', html:`<div style="background-color:#3b82f6;width:24px;height:24px;border-radius:50%;border:3px solid white;"></div>`, iconSize:[24,24], iconAnchor:[12,12] });
      L.marker([pickupLat, pickupLon], { icon: pickupIcon }).addTo(map).bindPopup('<b>Pickup Location</b><br>' + rideRequest.pickup);

      const dropIcon = L.divIcon({ className:'custom-marker', html:`<div style="background-color:#10b981;width:24px;height:24px;border-radius:50%;border:3px solid white;"></div>`, iconSize:[24,24], iconAnchor:[12,12] });
      L.marker([dropLat, dropLon], { icon: dropIcon }).addTo(map).bindPopup('<b>Drop Location</b><br>' + rideRequest.drop);

      const driverIcon = L.divIcon({ className:'custom-marker', html:`<div style="background-color:#22c55e;width:32px;height:32px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:18px;">🚗</div>`, iconSize:[32,32], iconAnchor:[16,16] });
      driverMarkerRef.current = L.marker([initialDriverLat, initialDriverLon], { icon: driverIcon }).addTo(map).bindPopup('<b>Your Location</b>');

      routeLineRef.current = L.polyline([[initialDriverLat, initialDriverLon],[pickupLat, pickupLon]], { color:'#22c55e', weight:4, opacity:0.7, dashArray:'10,10' }).addTo(map);

      map.fitBounds([[initialDriverLat, initialDriverLon],[pickupLat,pickupLon],[dropLat,dropLon]], { padding:[50,50] });
      mapInstanceRef.current = map;
    }
  }, [leafletLoaded]);

  // --- Socket.IO init ---
  useEffect(() => {
    socket = io("http://127.0.0.1:5000", { auth: { token: authToken } });

    socket.on("connect", () => {
      console.log("Connected to server", socket.id);
      socket.emit("join_driver_room", { driver_id: driverId });
      socket.emit("join_ride", { ride_id: rideId });
    });

    socket.on("disconnect", () => console.log("Disconnected from server"));
    socketRef.current = socket;

    return () => socket.disconnect();
  }, [driverId, rideId, authToken]);

  // --- Ride Actions ---
  const handleStartRide = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/ride/${rideId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.ok) setRideStatus('in_transit');
      else alert(data.msg);
    } catch (err) { console.error(err); }
  };

  const handleCompleteRide = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/ride/${rideId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ payment_method:'cash' })
      });
      const data = await res.json();
      if (data.ok) { setRideStatus('completed'); onCompleteRide(); }
      else alert(data.msg);
    } catch (err) { console.error(err); }
  };

  const handleCancelRide = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/${driverId}/${rideId}/cancel_ride`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.ok) onCancelRide();
      else alert(data.msg);
    } catch (err) { console.error(err); }
  };

  const getStatusColor = () => {
    switch(rideStatus){
      case 'arriving': return 'bg-yellow-500';
      case 'at_pickup': return 'bg-blue-500';
      case 'in_transit': return 'bg-green-500';
      case 'completed': return 'bg-green-600';
      default: return 'bg-slate-500';
    }
  }

  const getStatusMessage = () => {
    switch(rideStatus){
      case 'arriving': return 'Driving to pickup location';
      case 'at_pickup': return 'Arrived at pickup - waiting for passenger';
      case 'in_transit': return 'Passenger onboard - heading to destination';
      case 'completed': return 'Ride completed!';
      default: return 'Processing...';
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 p-4 overflow-y-auto">
      <motion.div initial={{ opacity:0,y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }} className="w-full max-w-6xl mx-auto py-6">
        <div className="mb-6">
          <h1 className="text-white mb-2">Live Ride</h1>
          <div className="flex items-center space-x-2">
            <Badge className={`${getStatusColor()} text-white border-0`}>{rideStatus.replace('_',' ').toUpperCase()}</Badge>
            <span className="text-slate-300 text-sm">{getStatusMessage()}</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-1 space-y-6">
            {/* Passenger Info */}
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6">
              <h3 className="text-white mb-4">Passenger</h3>
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <span className="text-blue-400 text-xl">{rideRequest?.riderName?.charAt(0) || 'U'}</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-white">{rideRequest?.riderName || "Unknown Rider"}</h4>
                  <p className="text-slate-400 text-sm">Ride ID: {rideRequest.id}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                  <Phone className="w-4 h-4 mr-2" /> Call
                </Button>
                <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                  <MessageSquare className="w-4 h-4 mr-2" /> Message
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
                  <Progress value={progress} className="h-2"/>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-600">
                  <div>
                    <div className="flex items-center text-slate-400 text-sm mb-1"><Clock className="w-3 h-3 mr-1"/> ETA</div>
                    <p className="text-white">{eta} mins</p>
                  </div>
                  <div>
                    <div className="flex items-center text-slate-400 text-sm mb-1"><Navigation className="w-3 h-3 mr-1"/> Distance</div>
                    <p className="text-white">{distanceRemaining.toFixed(1)} km</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Actions */}
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6 space-y-3">
              {rideStatus==='at_pickup' && <Button onClick={handleStartRide} className="w-full bg-green-600 hover:bg-green-700 text-white"><PlayCircle className="w-4 h-4 mr-2"/> Start Ride</Button>}
              {rideStatus==='in_transit' && <Button onClick={handleCompleteRide} className="w-full bg-green-600 hover:bg-green-700 text-white"><CheckCircle2 className="w-4 h-4 mr-2"/> Complete Ride</Button>}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10" disabled={rideStatus==='completed'}><XCircle className="w-4 h-4 mr-2"/> Cancel Ride</Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-slate-800 border-slate-600">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">Cancel Ride?</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">Are you sure you want to cancel this ride?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-slate-700 text-white border-slate-600">No</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelRide} className="bg-red-600 hover:bg-red-700 text-white">Yes, Cancel</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>

            <Card className="bg-yellow-500/10 border-yellow-500/30 p-4">
              <div className="flex items-center space-x-2 text-yellow-400"><AlertCircle className="w-5 h-5"/> <span className="text-sm">Emergency: Call 1122</span></div>
            </Card>
          </div>

          {/* Map Column */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-4 h-[600px] lg:h-full">
              <h3 className="text-white mb-3">Live Location</h3>
              <div className="relative w-full h-[calc(100%-2rem)]" style={{minHeight:'500px'}}>
                {!leafletLoaded && <div className="absolute inset-0 flex items-center justify-center bg-slate-700/50 rounded-lg z-10"><Loader2 className="w-8 h-8 animate-spin text-green-400 mx-auto mb-2"/><p className="text-slate-300 text-sm">Loading map...</p></div>}
                <div ref={mapRef} className="w-full h-full rounded-lg overflow-hidden"/>
              </div>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
