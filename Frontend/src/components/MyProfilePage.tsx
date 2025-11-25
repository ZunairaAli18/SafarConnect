import { useState, useEffect, ReactNode } from 'react';
import { motion } from 'motion/react';
import { User, MapPin, Loader2, LogOut, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { apiClient } from '../App';

interface MyProfilePageProps {
  userId: number;
  authToken: string;
  apiBaseUrl: string;
  onLogout: () => void;
  onBookRide: () => void;
}

interface UserProfile {
  user_id: ReactNode;
  id: number;
  name: string;
  email: string;
  phone: string;
  // Add any other fields your backend returns
}

export function MyProfilePage({ userId, authToken, onLogout, onBookRide }: MyProfilePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<UserProfile | null>(null);
  const [location, setLocation] = useState({
    latitude: 0,
    longitude: 0,
    address: 'Fetching location...'
  });

  useEffect(() => {
    fetchUserProfile();
  }, [userId]);

  // Helper function to convert coordinates to address using Nominatim (OpenStreetMap)
  const getAddressFromCoordinates = async (lat: number, lon: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'SafarConnect-RideSharing-App'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Geocoding failed');
      }

      const data = await response.json();
      
      // Build readable address from response
      const address = data.address;
      const parts = [];
      
      if (address.road) parts.push(address.road);
      if (address.suburb) parts.push(address.suburb);
      if (address.city || address.town || address.village) {
        parts.push(address.city || address.town || address.village);
      }
      if (address.state) parts.push(address.state);
      if (address.country) parts.push(address.country);
      
      const formattedAddress = parts.length > 0 ? parts.join(', ') : data.display_name;
      
      return formattedAddress || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } catch (error) {
      console.error('Geocoding error:', error);
      // Fallback to coordinates if geocoding fails
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  };

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiClient.get(`/user/${userId}/profile`, authToken);

      if (!data.ok) {
        throw new Error(data.msg || 'Failed to fetch user profile');
      }

      setUserInfo(data.user);
      
      // Fetch location after user info is loaded
      fetchLocation();
      
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load profile';
      setError(errorMessage);
      toast.error(errorMessage);
      console.error('Error fetching user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocation = () => {
    setLocationLoading(true);
    
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported by browser');
      setLocation({
        latitude: 24.8607,
        longitude: 67.0011,
        address: 'Karachi, Pakistan (Default - Geolocation not supported)'
      });
      setLocationLoading(false);
      toast.warning('Geolocation is not supported by your browser. Using default location.');
      return;
    }

    // Request location with timeout and high accuracy
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        // Get readable address from coordinates
        const address = await getAddressFromCoordinates(lat, lon);

        setLocation({
          latitude: lat,
          longitude: lon,
          address: address
        });

        // Update location in backend
        try {
          const data = await apiClient.post(
            `/user/${userId}/current_loc`,
            { latitude: lat, longitude: lon },
            authToken
          );

          if (data.ok) {
            toast.success('Location updated successfully');
          } else {
            toast.warning('Location fetched but not saved to backend');
          }
        } catch (err: any) {
          console.error('Error updating location:', err);
          toast.error(err.message || 'Failed to update location in backend');
        }

        setLocationLoading(false);
      },
      (err) => {
        console.error('Geolocation error:', err);
        
        let errorMessage = 'Could not get your location';
        
        switch(err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please allow location access in your browser settings.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable. Please check your device settings.';
            break;
          case err.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
          default:
            errorMessage = 'An unknown error occurred while fetching location.';
        }
        
        // Fallback to Karachi location
        setLocation({
          latitude: 24.8607,
          longitude: 67.0011,
          address: 'Karachi, Pakistan (Default)'
        });
        setLocationLoading(false);
        toast.error(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000, // 10 seconds
        maximumAge: 0 // Don't use cached location
      }
    );
  };

  const handleUpdateLocation = async () => {
    setLocationLoading(true);

    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        try {
          // Get readable address
          const address = await getAddressFromCoordinates(lat, lon);

          const data = await apiClient.post(
            `/user/${userId}/current_loc`,
            { latitude: lat, longitude: lon },
            authToken
          );

          if (data.ok) {
            setLocation({
              latitude: lat,
              longitude: lon,
              address: address
            });
            toast.success('Location updated successfully');
          } else {
            throw new Error(data.msg || 'Failed to update location');
          }
        } catch (err: any) {
          console.error('Error updating location:', err);
          toast.error(err.message || 'Failed to update location');
        } finally {
          setLocationLoading(false);
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        
        let errorMessage = 'Could not get your location';
        
        switch(err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access in browser settings.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Location unavailable. Check if location services are enabled on your device.';
            break;
          case err.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
        }
        
        toast.error(errorMessage);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center space-y-4"
        >
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
          <p className="text-slate-300">Loading your profile...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !userInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
            <div className="flex flex-col items-center space-y-4">
              <div className="bg-red-500/20 p-4 rounded-full">
                <AlertCircle className="w-12 h-12 text-red-400" />
              </div>
              <h2 className="text-white text-xl font-semibold">Error Loading Profile</h2>
              <p className="text-slate-300 text-center">{error || 'Failed to load user profile'}</p>
              <div className="flex gap-3 w-full">
                <Button
                  onClick={fetchUserProfile}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Try Again
                </Button>
                <Button
                  onClick={onLogout}
                  variant="outline"
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Logout
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">My Profile</h1>
          <div className="flex gap-3">
            <Button
              onClick={onBookRide}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Book a Ride
            </Button>
            <Button
              variant="ghost"
              onClick={onLogout}
              className="text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* User Info Card */}
          <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
            <div className="flex items-center space-x-4 mb-6">
              <div className="bg-blue-500/20 p-3 rounded-full">
                <User className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">User Information</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-slate-400 text-sm">Name</Label>
                <p className="text-white text-lg mt-1">{userInfo.name}</p>
              </div>
              <div>
                <Label className="text-slate-400 text-sm">Email</Label>
                <p className="text-white text-lg mt-1">{userInfo.email}</p>
              </div>
              <div>
                <Label className="text-slate-400 text-sm">Phone</Label>
                <p className="text-white text-lg mt-1">{userInfo.phone}</p>
              </div>
              <div>
                <Label className="text-slate-400 text-sm">User ID</Label>
                <p className="text-white text-lg mt-1">#{userInfo.user_id}</p>
              </div>
            </div>
          </Card>

          {/* Location Card */}
          <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
            <div className="flex items-center space-x-4 mb-6">
              <div className="bg-blue-500/20 p-3 rounded-full">
                <MapPin className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Location</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-slate-400 text-sm">Current Location</Label>
                {locationLoading ? (
                  <div className="flex items-center space-x-2 mt-2">
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    <p className="text-slate-300">Updating location...</p>
                  </div>
                ) : (
                  <p className="text-white text-lg mt-1">{location.address}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-400 text-sm">Latitude</Label>
                  <p className="text-white mt-1">{location.latitude.toFixed(4)}</p>
                </div>
                <div>
                  <Label className="text-slate-400 text-sm">Longitude</Label>
                  <p className="text-white mt-1">{location.longitude.toFixed(4)}</p>
                </div>
              </div>

              <Button
                onClick={handleUpdateLocation}
                disabled={locationLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
              >
                {locationLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 mr-2" />
                    Update Location
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}