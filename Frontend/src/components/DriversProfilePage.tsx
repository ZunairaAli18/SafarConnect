import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { UserCircle, MapPin, Loader2, LogOut, Car, Edit, Save, X, AlertCircle, Percent } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { apiClient } from '../App';

interface DriversProfilePageProps {
  driverId: number;
  authToken: string;
  onLogout: () => void;
  onGoToDashboard?: () => void;
}

interface DriverInfo {
  driver_id: number;
  name: string;
  email: string;
  license_no: string;
  discount: number;
}

interface Vehicle {
  vehicle_id?: number;
  vehicle_no: string;
  type: string;
  driver_id: number;
}

export function DriversProfilePage({ driverId, authToken, onLogout, onGoToDashboard }: DriversProfilePageProps) {
  const [loading, setLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [vehicleEditMode, setVehicleEditMode] = useState(false);
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [discountEditMode, setDiscountEditMode] = useState(false);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState<Vehicle>({
    vehicle_no: '',
    type: '',
    driver_id: driverId
  });
  
  const [location, setLocation] = useState({
    latitude: 0,
    longitude: 0,
    address: 'Fetching location...'
  });

  useEffect(() => {
    fetchDriverProfile();
    fetchVehicleDetails();
  }, [driverId]);

  const fetchDriverProfile = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get(`/driver/${driverId}/profile`, authToken);
      
      if (data.ok) {
        setDriverInfo(data.driver);
        setDiscountValue(data.driver.discount || 0);
        fetchLocation();
      } else {
        toast.error(data.msg || 'Failed to load driver profile');
      }
    } catch (err: any) {
      console.error('Error fetching driver profile:', err);
      toast.error(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicleDetails = async () => {
    try {
      const data = await apiClient.get(`/driver/${driverId}/vehicle`, authToken);
      
      if (data.ok && data.vehicle) {
        setVehicle(data.vehicle);
        setVehicleForm(data.vehicle);
      } else {
        // No vehicle registered yet
        setVehicle(null);
      }
    } catch (err: any) {
      console.error('Error fetching vehicle:', err);
      // Vehicle might not exist yet, that's okay
      setVehicle(null);
    }
  };

  const handleVehicleEdit = () => {
    setVehicleEditMode(true);
    if (vehicle) {
      setVehicleForm(vehicle);
    }
  };

  const handleVehicleCancel = () => {
    setVehicleEditMode(false);
    if (vehicle) {
      setVehicleForm(vehicle);
    } else {
      setVehicleForm({
        vehicle_no: '',
        type: '',
        driver_id: driverId
      });
    }
  };
  const handleDiscountEdit = () => {
  setDiscountEditMode(true);
  setDiscountValue(driverInfo?.discount || 0);
};

const handleDiscountCancel = () => {
  setDiscountEditMode(false);
  setDiscountValue(driverInfo?.discount || 0);
};

const handleDiscountSubmit = async () => {
  if (discountValue < 0 || discountValue > 100) {
    toast.error('Discount must be between 0 and 100');
    return;
  }

  setDiscountLoading(true);

  try {
    const data = await apiClient.put(
      `/driver/${driverId}/discount`,
      { discount: discountValue },
      authToken
    );

    if (data.ok) {
      setDriverInfo(prev => prev ? { ...prev, discount: discountValue } : null);
      setDiscountEditMode(false);
      toast.success('Discount updated successfully');
    } else {
      toast.error(data.msg || 'Failed to update discount');
    }
  } catch (err: any) {
    console.error('Error updating discount:', err);
    toast.error(err.message || 'Failed to update discount');
  } finally {
    setDiscountLoading(false);
  }
};
  const handleVehicleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setVehicleForm({
      ...vehicleForm,
      [e.target.name]: e.target.value
    });
  };

  const handleVehicleSubmit = async () => {
    // Validation
    if (!vehicleForm.vehicle_no.trim() || !vehicleForm.type.trim()) {
      toast.error('Please fill in all vehicle details');
      return;
    }

    setVehicleLoading(true);

    try {
      let data;
      
      if (vehicle && vehicle.vehicle_id) {
        // Update existing vehicle
        data = await apiClient.put(
          `/driver/${driverId}/vehicle`,
          vehicleForm,
          authToken
        );
      } else {
        // Create new vehicle
        data = await apiClient.post(
          `/driver/${driverId}/vehicle`,
          vehicleForm,
          authToken
        );
      }

      if (data.ok) {
        setVehicle(data.vehicle);
        setVehicleForm(data.vehicle);
        setVehicleEditMode(false);
        toast.success(vehicle ? 'Vehicle updated successfully' : 'Vehicle added successfully');
      } else {
        toast.error(data.msg || 'Failed to save vehicle');
      }
    } catch (err: any) {
      console.error('Error saving vehicle:', err);
      toast.error(err.message || 'Failed to save vehicle');
    } finally {
      setVehicleLoading(false);
    }
  };

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

      if (!response.ok) throw new Error('Geocoding failed');

      const data = await response.json();
      const address = data.address;
      const parts = [];
      
      if (address.road) parts.push(address.road);
      if (address.suburb) parts.push(address.suburb);
      if (address.city || address.town || address.village) {
        parts.push(address.city || address.town || address.village);
      }
      if (address.state) parts.push(address.state);
      if (address.country) parts.push(address.country);
      
      return parts.length > 0 ? parts.join(', ') : data.display_name;
    } catch (error) {
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  };

  const fetchLocation = () => {
    setLocationLoading(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const address = await getAddressFromCoordinates(lat, lon);

          setLocation({ latitude: lat, longitude: lon, address });

          // Update location in backend
          try {
            await apiClient.post(
              `/driver/${driverId}/current_loc`,
              { latitude: lat, longitude: lon },
              authToken
            );
          } catch (err) {
            console.error('Error updating location:', err);
          }

          setLocationLoading(false);
        },
        () => {
          setLocation({
            latitude: 24.8607,
            longitude: 67.0011,
            address: 'Karachi, Pakistan (Default)'
          });
          setLocationLoading(false);
        }
      );
    } else {
      setLocation({
        latitude: 24.8607,
        longitude: 67.0011,
        address: 'Karachi, Pakistan (Default)'
      });
      setLocationLoading(false);
    }
  };

  const handleUpdateLocation = async () => {
    setLocationLoading(true);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const address = await getAddressFromCoordinates(lat, lon);

          try {
            await apiClient.post(
              `/driver/${driverId}/current_loc`,
              { latitude: lat, longitude: lon },
              authToken
            );

            setLocation({ latitude: lat, longitude: lon, address });
            toast.success('Location updated successfully');
          } catch (err: any) {
            toast.error(err.message || 'Failed to update location');
          } finally {
            setLocationLoading(false);
          }
        },
        () => {
          toast.error('Could not get your current location');
          setLocationLoading(false);
        }
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center space-y-4"
        >
          <Loader2 className="w-12 h-12 text-green-400 animate-spin" />
          <p className="text-slate-300">Loading your profile...</p>
        </motion.div>
      </div>
    );
  }

  if (!driverInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 flex items-center justify-center p-4">
        <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
          <div className="flex flex-col items-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <h2 className="text-white text-xl">Failed to load profile</h2>
            <Button onClick={fetchDriverProfile}>Try Again</Button>
          </div>
        </Card>
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
          <h1 className="text-3xl font-bold text-white">Driver Profile</h1>
          <Button
            variant="ghost"
            onClick={onLogout}
            className="text-slate-300 hover:text-white hover:bg-slate-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <div className="space-y-6">
          {/* Driver Info Card */}
          <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
            <div className="flex items-center space-x-4 mb-6">
              <div className="bg-green-500/20 p-3 rounded-full">
                <UserCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Driver Information</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-slate-400 text-sm">Name</Label>
                <p className="text-white text-lg mt-1">{driverInfo.name}</p>
              </div>
              <div>
                <Label className="text-slate-400 text-sm">Email</Label>
                <p className="text-white text-lg mt-1">{driverInfo.email}</p>
              </div>
              <div>
                <Label className="text-slate-400 text-sm">License Number</Label>
                <p className="text-white text-lg mt-1">{driverInfo.license_no}</p>
              </div>
              <div>
                <Label className="text-slate-400 text-sm">Driver ID</Label>
                <p className="text-white text-lg mt-1">#{driverInfo.driver_id}</p>
              </div>
            </div>
          </Card>
          {/* Discount Card */}
<Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
  <div className="flex items-center justify-between mb-6">
    <div className="flex items-center space-x-4">
      <div className="bg-green-500/20 p-3 rounded-full">
        <Percent className="w-8 h-8 text-green-400" />
      </div>
      <h2 className="text-xl font-semibold text-white">Discount Offer</h2>
    </div>
    
    {!discountEditMode && (
      <Button
        onClick={handleDiscountEdit}
        variant="outline"
        size="sm"
        className="border-green-600 text-green-400 hover:bg-green-600 hover:text-white"
      >
        <Edit className="w-4 h-4 mr-2" />
        Edit
      </Button>
    )}
  </div>

  {!discountEditMode ? (
    <div>
      <Label className="text-slate-400 text-sm">Current Discount</Label>
      <div className="flex items-baseline mt-1">
        <p className="text-white text-4xl font-bold">{driverInfo.discount}</p>
        <span className="text-green-400 text-2xl ml-1">%</span>
      </div>
      <p className="text-slate-400 text-sm mt-2">
        {driverInfo.discount > 0 
          ? `You're offering ${driverInfo.discount}% discount to attract more riders` 
          : 'Set a discount to attract more riders'}
      </p>
    </div>
  ) : (
    <div className="space-y-5">
      <div>
        <Label htmlFor="discount" className="text-slate-200">Discount Percentage</Label>
        <div className="relative mt-2">
          <Input
            id="discount"
            type="number"
            min="0"
            max="100"
            step="1"
            value={discountValue}
            onChange={(e) => setDiscountValue(Number(e.target.value))}
            className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 pr-10"
            placeholder="0"
          />
          <Percent className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
        </div>
        <p className="text-slate-400 text-xs mt-1">Enter a value between 0 and 100</p>
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          onClick={handleDiscountSubmit}
          disabled={discountLoading}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
        >
          {discountLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Discount
            </>
          )}
        </Button>
        <Button
          onClick={handleDiscountCancel}
          disabled={discountLoading}
          variant="outline"
          className="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  )}
</Card>
          {/* Vehicle Card */}
          <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <div className="bg-green-500/20 p-3 rounded-full">
                  <Car className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Vehicle Information</h2>
              </div>
              
              {!vehicleEditMode && (
                <Button
                  onClick={handleVehicleEdit}
                  variant="outline"
                  size="sm"
                  className="border-green-600 text-green-400 hover:bg-green-600 hover:text-white"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  {vehicle ? 'Edit' : 'Add Vehicle'}
                </Button>
              )}
            </div>

            {!vehicleEditMode ? (
              // View Mode
              vehicle ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-400 text-sm">Vehicle Number</Label>
                    <p className="text-white text-lg mt-1">{vehicle.vehicle_no}</p>
                  </div>
                  <div>
                    <Label className="text-slate-400 text-sm">Vehicle Type</Label>
                    <p className="text-white text-lg mt-1">{vehicle.type}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Car className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-4">No vehicle registered yet</p>
                  <p className="text-slate-500 text-sm">Click "Add Vehicle" to register your vehicle</p>
                </div>
              )
            ) : (
              // Edit Mode
              <div className="space-y-5">
                <div>
                  <Label htmlFor="vehicle_no" className="text-slate-200">Vehicle Number</Label>
                  <Input
                    id="vehicle_no"
                    name="vehicle_no"
                    type="text"
                    placeholder="e.g., ABC-123"
                    value={vehicleForm.vehicle_no}
                    onChange={handleVehicleChange}
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="type" className="text-slate-200">Vehicle Type</Label>
                  <select
                    id="type"
                    name="type"
                    value={vehicleForm.type}
                    onChange={handleVehicleChange}
                    className="w-full mt-2 bg-slate-700/50 border border-slate-600 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select vehicle type</option>
                    <option value="Sedan">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="Hatchback">Hatchback</option>
                    <option value="Minivan">Minivan</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="Auto Rickshaw">Auto Rickshaw</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleVehicleSubmit}
                    disabled={vehicleLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {vehicleLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Vehicle
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleVehicleCancel}
                    disabled={vehicleLoading}
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Location Card */}
          <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
            <div className="flex items-center space-x-4 mb-6">
              <div className="bg-green-500/20 p-3 rounded-full">
                <MapPin className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Location</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-slate-400 text-sm">Current Location</Label>
                {locationLoading ? (
                  <div className="flex items-center space-x-2 mt-2">
                    <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
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
                className="w-full bg-green-600 hover:bg-green-700 text-white mt-4"
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

          {/* Go to Dashboard */}
          {onGoToDashboard && (
            <Card className="bg-green-500/10 border-green-500/30 p-6">
              <h2 className="text-white text-xl font-semibold mb-3">Ready to Drive?</h2>
              <p className="text-slate-300 text-sm mb-4">
                Go to your dashboard to view and accept ride requests.
              </p>
              <Button
                onClick={onGoToDashboard}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Go to Dashboard
              </Button>
            </Card>
          )}
        </div>
      </motion.div>
    </div>
  );
}