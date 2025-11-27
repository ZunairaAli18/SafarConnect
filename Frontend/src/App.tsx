import { useState, useEffect, createContext, useContext } from 'react';
import { HomePage } from './components/HomePage';
import { RiderLogin } from './components/RiderLogin';
import { RiderSignup } from './components/RiderSignup';
import { DriverLogin } from './components/DriverLogin';
import { DriverSignup } from './components/DriverSignup';
import { MyProfilePage } from './components/MyProfilePage';
import { DriversProfilePage } from './components/DriversProfilePage';
import { DriverDashboard } from './components/DriverDashboard';
import { DriverLiveRidePage } from './components/DriverLiveRidePage';
import { RideBookingPage } from './components/RideBookingPage';
import { RideConfirmationPage } from './components/RideConfirmationPage';
import { LiveRideTrackingPage } from './components/LiveRideTrackingPage';
import { RideCompletionPage } from './components/RideCompletionPage';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

// Auth Context
interface AuthContextType {
  token: string | null;
  userId: number | null;
  driverId: number | null;
  userType: 'user' | 'driver' | null;
  login: (token: string, userId: number | null, driverId: number | null, userType: 'user' | 'driver') => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// API utility with JWT
export const apiClient = {
  baseUrl:  'http://localhost:5000',
  
  async request(endpoint: string, options: RequestInit = {}, token?: string | null) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Merge with any additional headers from options
    const allHeaders = {
      ...headers,
      ...(options.headers as Record<string, string> || {}),
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: allHeaders,
    });

    // Handle token expiration
    if (response.status === 401) {
      const error = await response.json().catch(() => ({ msg: 'Unauthorized' }));
      
      // Token expired, invalid, or logged out
      if (error.msg && (
        error.msg.includes('Token has expired') ||
        error.msg.includes('Token is invalid') ||
        error.msg.includes('Token is missing')
      )) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userId');
        localStorage.removeItem('driverId');
        localStorage.removeItem('userType');
        window.location.href = '/';
        throw new Error(error.msg || 'Session expired. Please login again.');
      }
      
      throw new Error(error.msg || 'Unauthorized');
    }

    if (response.status === 403) {
      const error = await response.json().catch(() => ({ msg: 'Forbidden' }));
      throw new Error(error.msg || 'Access forbidden');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ msg: 'Request failed' }));
      throw new Error(error.msg || 'Request failed');
    }

    return response.json();
  },

  get(endpoint: string, token?: string | null) {
    return this.request(endpoint, { method: 'GET' }, token);
  },

  post(endpoint: string, data: any, token?: string | null) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }, token);
  },

  put(endpoint: string, data: any, token?: string | null) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, token);
  },

  delete(endpoint: string, token?: string | null) {
    return this.request(endpoint, { method: 'DELETE' }, token);
  },
};

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);
  const [rideDetails, setRideDetails] = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [acceptedRideRequest, setAcceptedRideRequest] = useState<any>(null);
  
  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [userType, setUserType] = useState<'user' | 'driver' | null>(null);

  // Initialize auth from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUserId = localStorage.getItem('userId');
    const storedDriverId = localStorage.getItem('driverId');
    const storedUserType = localStorage.getItem('userType');

    if (storedToken && storedUserType) {
      setToken(storedToken);
      setUserId(storedUserId ? parseInt(storedUserId) : null);
      setDriverId(storedDriverId ? parseInt(storedDriverId) : null);
      setUserType(storedUserType as 'user' | 'driver');
      
      // Redirect to appropriate page based on user type
      if (currentPath === '/') {
        if (storedUserType === 'user') {
          navigate('/rider-profile');
        } else if (storedUserType === 'driver') {
          navigate('/driver-dashboard');
        }
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const handleNavigate = (page: string) => {
    navigate(`/${page}`);
  };

  const login = (authToken: string, uid: number | null, did: number | null, type: 'user' | 'driver') => {
    console.log(uid);
    setToken(authToken);
    setUserId(uid);
    setDriverId(did);
    setUserType(type);
    localStorage.setItem('authToken', authToken);
    if (uid) localStorage.setItem('userId', uid.toString());
    if (did) localStorage.setItem('driverId', did.toString());
    localStorage.setItem('userType', type);
  };

  const logout = async () => {
    const currentToken = token;
    const currentUserType = userType;

    try {
      // Call appropriate logout endpoint based on user type
      if (currentToken && currentUserType) {
        const endpoint = currentUserType === 'user' ? '/user/logout' : '/driver/logout';
        
        await apiClient.post(endpoint, {}, currentToken);
        toast.success('Logged out successfully');
      }
    } catch (error: any) {
      console.error('Logout error:', error);
      // Still proceed with local logout even if API call fails
      toast.error(error.message || 'Logout failed, but clearing local session');
    } finally {
      // Clear local state and storage regardless of API call result
      setToken(null);
      setUserId(null);
      setDriverId(null);
      setUserType(null);
      localStorage.removeItem('authToken');
      localStorage.removeItem('userId');
      localStorage.removeItem('driverId');
      localStorage.removeItem('userType');
      setRideDetails(null);
      setSelectedDriver(null);
      setAcceptedRideRequest(null);
      navigate('/');
    }
  };

  const handleBackToHome = () => {
    logout();
  };

  const handleRiderSuccess = (authToken: string, uid: number) => {
    login(authToken, uid, null, 'user');
    navigate('/rider-profile');
  };

  const handleDriverSuccess = (authToken: string, did: number) => {
    login(authToken, null, did, 'driver');
    navigate('/driver-dashboard');
  };

  const handleBookRide = () => {
    navigate('/ride-booking');
  };

  const handleBackToRiderProfile = () => {
    navigate('/rider-profile');
    setRideDetails(null);
    setSelectedDriver(null);
  };

  const handleBackToDriverDashboard = () => {
    navigate('/driver-dashboard');
    setAcceptedRideRequest(null);
  };

  const handleProceedToConfirmation = (details: any) => {
    setRideDetails(details);
    navigate('/ride-confirmation');
  };

  const handleStartRide = (driver: any) => {
    setSelectedDriver(driver);
    navigate('/live-tracking');
  };

  const handleRideComplete = () => {
    navigate('/ride-completion');
  };

  const handleFeedbackComplete = () => {
    navigate('/rider-profile');
    setRideDetails(null);
    setSelectedDriver(null);
  };

  const handleAcceptRide = (request: any) => {
    setAcceptedRideRequest(request);
    navigate('/driver-live-ride');
  };

  const handleDriverRideComplete = () => {
    navigate('/driver-dashboard');
    setAcceptedRideRequest(null);
  };

  const handleDriverCancelRide = () => {
    navigate('/driver-dashboard');
    setAcceptedRideRequest(null);
  };

  const authContextValue: AuthContextType = {
    token,
    userId,
    driverId,
    userType,
    login,
    logout,
    isAuthenticated: !!token,
  };

  // Render component based on current path
  const renderPage = () => {
    switch (currentPath) {
      case '/':
        return <HomePage onNavigate={handleNavigate} />;
      
      case '/rider-login':
        return <RiderLogin onBack={handleBackToHome} onSuccess={handleRiderSuccess} />;
      
      case '/rider-signup':
        return <RiderSignup onBack={handleBackToHome} onSuccess={handleRiderSuccess} />;
      
      case '/driver-login':
        return <DriverLogin onBack={handleBackToHome} onSuccess={handleDriverSuccess} />;
      
      case '/driver-signup':
        return <DriverSignup onBack={handleBackToHome} onSuccess={handleDriverSuccess} />;
      
      case '/rider-profile':
        if (!token || userType !== 'user') {
          navigate('/');
          return null;
        }
        return (
          <MyProfilePage 
            onLogout={logout} 
            onBookRide={handleBookRide} 
            userId={userId!} 
            authToken={token} 
            apiBaseUrl={apiClient.baseUrl}
          />
        );
      
      case '/driver-profile':
        if (!token || userType !== 'driver') {
          navigate('/');
          return null;
        }
        return (
          <DriversProfilePage
            driverId={driverId!}
            authToken={token} 
            onLogout={logout}
            onGoToDashboard={() => navigate('/driver-dashboard')}
          />
        );
      
      case '/driver-dashboard':
        if (!token || userType !== 'driver') {
          navigate('/');
          return null;
        }
        return (
          <DriverDashboard 
            onLogout={logout}
            onBackToProfile={() => navigate('/driver-profile')}
            onAcceptRide={handleAcceptRide}
            
          />
        );
      
      case '/driver-live-ride':
        if (!token || userType !== 'driver' || !acceptedRideRequest) {
          navigate('/driver-dashboard');
          return null;
        }
        return (
          <DriverLiveRidePage
            rideRequest={acceptedRideRequest}
            onCompleteRide={handleDriverRideComplete}
            onCancelRide={handleDriverCancelRide}
          />
        );
      
      case '/ride-booking':
        if (!token || userType !== 'user') {
          navigate('/');
          return null;
        }
        return (
          <RideBookingPage 
            onBack={handleBackToRiderProfile}
            onProceedToConfirmation={handleProceedToConfirmation} userToken={token} userId={userId ||0}          />
        );
      
      case '/ride-confirmation':
        if (!token || userType !== 'user' || !rideDetails) {
          navigate('/ride-booking');
          return null;
        }
        return (
          <RideConfirmationPage
            onBack={handleBookRide}
      onRideAccepted={(driver, rideId) => {
        // Store the driver and ride ID when accepted
        setSelectedDriver(driver);
        setRideDetails({ ...rideDetails, ride_id: rideId });
        navigate('/live-tracking');
      }}
      userToken={token}
      rideDetails={rideDetails}
          />
        );
      
      case '/live-tracking':
        if (!token || userType !== 'user' || !rideDetails || !selectedDriver) {
          navigate('/rider-profile');
          return null;
        }
        return (
          <LiveRideTrackingPage
            rideDetails={rideDetails}
            driver={selectedDriver}
            onRideComplete={handleRideComplete}
          />
        );
      
      case '/ride-completion':
        if (!token || userType !== 'user' || !rideDetails || !selectedDriver) {
          navigate('/rider-profile');
          return null;
        }
        return (
          <RideCompletionPage
            rideDetails={rideDetails}
            driver={selectedDriver}
            onComplete={handleFeedbackComplete}
          />
        );
      
      default:
        navigate('/');
        return null;
    }
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {renderPage()}
      <Toaster />
    </AuthContext.Provider>
  );
}