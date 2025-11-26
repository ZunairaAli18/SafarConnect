import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Car, User, UserCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface HomePageProps {
  onNavigate: (page: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const [animationComplete, setAnimationComplete] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationComplete(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 flex flex-col items-center justify-center overflow-hidden p-4">
      <div className="relative w-full max-w-6xl">
        {/* Title Section with Car Animation */}
        <div className="relative mb-12 h-32 flex items-center justify-center">
          {/* Animated Car */}
          <motion.div
            initial={{ x: '-100vw' }}
            animate={{ x: animationComplete ? '100vw' : '0' }}
            transition={{ 
              duration: 1.5,
              ease: 'easeInOut',
              times: [0, 0.5, 1]
            }}
            className="absolute z-20"
          >
            <Car className="w-16 h-16 text-yellow-400" strokeWidth={1.5} />
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-center z-10"
          >
            <h1 className="text-white mb-2">
              Safar Connect
            </h1>
            <p className="text-slate-300 text-xl">Your Journey, Your Way</p>
          </motion.div>
        </div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: animationComplete ? 1 : 0, y: animationComplete ? 0 : 20 }}
          transition={{ duration: 0.8 }}
          className="relative z-10"
        >
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Rider Section */}
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="bg-blue-500/20 p-4 rounded-full">
                  <User className="w-12 h-12 text-blue-400" />
                </div>
                <h2 className="text-white">For Riders</h2>
                <p className="text-slate-300">
                  Book your ride in minutes and travel with ease
                </p>
                <div className="flex flex-col w-full space-y-3">
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    size="lg"
                    onClick={() => onNavigate('rider-login')}
                  >
                    Rider Login
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full border-blue-500 text-blue-400 hover:bg-blue-500/10"
                    size="lg"
                    onClick={() => onNavigate('rider-signup')}
                  >
                    Rider Sign Up
                  </Button>
                </div>
              </div>
            </Card>

            {/* Driver Section */}
            <Card className="bg-slate-800/50 backdrop-blur border-slate-600 p-8">
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="bg-green-500/20 p-4 rounded-full">
                  <UserCircle className="w-12 h-12 text-green-400" />
                </div>
                <h2 className="text-white">For Drivers</h2>
                <p className="text-slate-300">
                  Drive and earn on your own schedule
                </p>
                <div className="flex flex-col w-full space-y-3">
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    size="lg"
                    onClick={() => onNavigate('driver-login')}
                  >
                    Driver Login
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full border-green-500 text-green-400 hover:bg-green-500/10"
                    size="lg"
                    onClick={() => onNavigate('driver-signup')}
                  >
                    Driver Sign Up
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
