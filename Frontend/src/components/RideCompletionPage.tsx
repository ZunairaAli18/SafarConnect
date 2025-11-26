import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Star, CheckCircle, MapPin, Navigation, DollarSign, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner@2.0.3';
import { io, Socket } from 'socket.io-client';

interface RideCompletionPageProps {
  onComplete: () => void;
  rideDetails: {
    ride_id: any;
    pickup: string;
    drop: string;
    distance: number;
    duration: number;
    fare: number;
  };
  driver: {
    id: number;
    name: string;
    rating: number;
    vehicleType: string;
    vehicleModel: string;
    vehicleNumber: string;
  };
}

export function RideCompletionPage({ onComplete, rideDetails, driver }: RideCompletionPageProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rideCompleted, setRideCompleted] = useState(false);

  const rideId = rideDetails.ride_id;
  const token = localStorage.getItem('token') || '';

  // --- Socket.IO ---
  useEffect(() => {
    const socket: Socket = io('http://127.0.0.1:5000', { auth: { token } });

    socket.emit('join_ride', { ride_id: rideId });

    socket.on('complete_ride_socket', (data: any) => {
      if (data.ride_id === rideId) {
        setRideCompleted(true);
        toast.success('Ride completed by driver!');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [rideId, token]);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setSubmitting(true);

    try {
      // --- Only send feedback, no ride complete API call ---
      const feedbackRes = await fetch(`http://127.0.0.1:5000/ride/${rideId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: driver.id,
          rating,
          comment,
        }),
      });

      const feedbackData = await feedbackRes.json();
      if (!feedbackData.ok) toast.error(feedbackData.msg || 'Failed to submit feedback');
      else toast.success('Thank you for your feedback!');

      setSubmitting(false);
      onComplete();
    } catch (error) {
      console.error(error);
      toast.error('Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 p-4 flex items-center justify-center">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="w-full max-w-2xl">
        
        {/* Success Animation */}
        {rideCompleted && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }} className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>
          </motion.div>
        )}

        <h1 className="text-white text-center mb-2">Ride {rideCompleted ? 'Completed!' : 'In Progress'}</h1>
        {!rideCompleted && <p className="text-slate-300 text-center mb-8">Waiting for driver to complete the ride...</p>}

        {/* Trip Summary */}
        <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6 mb-6">
          <h2 className="text-white mb-4">Trip Summary</h2>
          <div className="space-y-4 mb-6">
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
          </div>

          <div className="grid grid-cols-3 gap-4 p-4 bg-slate-700/50 rounded-lg">
            <div className="text-center">
              <div className="flex items-center justify-center text-slate-400 text-sm mb-1"><Navigation className="w-3 h-3 mr-1"/> Distance</div>
              <p className="text-white">{rideDetails.distance} km</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center text-slate-400 text-sm mb-1"><Clock className="w-3 h-3 mr-1"/> Duration</div>
              <p className="text-white">{rideDetails.duration} mins</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center text-slate-400 text-sm mb-1"><DollarSign className="w-3 h-3 mr-1"/> Fare</div>
              <p className="text-white">Rs. {rideDetails.fare}</p>
            </div>
          </div>
        </Card>

        {/* Feedback Section */}
        {rideCompleted && (
          <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-6 mb-6">
            <h2 className="text-white mb-4">Rate Your Driver</h2>
            
            {/* Driver Info */}
            <div className="flex items-center space-x-4 mb-6 p-4 bg-slate-700/50 rounded-lg">
              <div className="w-14 h-14 bg-blue-500/20 rounded-full flex items-center justify-center">
                <span className="text-blue-400 text-lg">{driver.name.charAt(0)}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-white">{driver.name}</h3>
                <p className="text-slate-400 text-sm">{driver.vehicleModel}</p>
                <p className="text-slate-300 text-sm">{driver.vehicleNumber}</p>
              </div>
            </div>

            {/* Rating Stars */}
            <div className="mb-6">
              <p className="text-slate-300 text-sm mb-3 text-center">How was your ride experience?</p>
              <div className="flex justify-center space-x-3">
                {[1,2,3,4,5].map(star => (
                  <motion.button key={star} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    onClick={() => setRating(star)}
                    className="focus:outline-none"
                  >
                    <Star className={`w-10 h-10 transition-colors ${(hoveredRating || rating) >= star ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`} />
                  </motion.button>
                ))}
              </div>
              {rating > 0 && <motion.p initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} className="text-center text-slate-300 text-sm mt-2">
                {['Poor','Fair','Good','Very Good','Excellent'][rating-1]}
              </motion.p>}
            </div>

            {/* Comment */}
            <div className="mb-6">
              <label className="text-slate-300 text-sm mb-2 block">Share your experience (Optional)</label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us about your ride..."
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 min-h-[100px]"
                maxLength={500} />
              <p className="text-slate-400 text-xs mt-1 text-right">{comment.length}/500</p>
            </div>

            <Button onClick={handleSubmit} disabled={submitting || rating === 0} className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="lg">
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
