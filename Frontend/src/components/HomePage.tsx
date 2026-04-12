import { useState } from 'react';
import { motion } from 'motion/react';

interface HomePageProps {
  onNavigate: (page: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        ::selection {
          background: rgba(20, 184, 166, 0.35);
          color: #f1f5f9;
        }
        @keyframes highlighter-sweep {
          0%   { background-size: 0% 90%; }
          100% { background-size: 100% 90%; }
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: '#050e0d',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
        color: '#e2e8f0',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '3rem 2rem',
        position: 'relative',
      }}>
        {/* Noise grain overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.68' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
          pointerEvents: 'none',
          zIndex: 0,
        }} />
        {/* Background glow */}
        <div style={{
          position: 'absolute',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '900px',
          height: '600px',
          background: 'radial-gradient(ellipse, rgba(20, 184, 166, 0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* ── Hero center ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: '900px',
            width: '100%',
            textAlign: 'center',
            marginBottom: '3.5rem',
          }}
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 1rem',
              borderRadius: '100px',
              background: 'rgba(20, 184, 166, 0.08)',
              border: '1px solid rgba(20, 184, 166, 0.15)',
              marginBottom: '1.8rem',
              fontSize: '0.8rem',
              color: '#5eead4',
              fontWeight: 500,
            }}
          >
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: '#14b8a6',
              boxShadow: '0 0 8px rgba(20,184,166,0.5)',
            }} />
            Ride-hailing built for Pakistan
          </motion.div>

          {/* Headline */}
          <h1 style={{
            margin: '0 0 1.2rem',
            fontSize: 'clamp(2.4rem, 5vw, 4rem)',
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: '-0.04em',
            color: '#f1f5f9',
          }}>
            Pakistan commutes finally made{' '}
            <span style={{
              backgroundImage: 'linear-gradient(#14b8a6, #14b8a6)',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'left center',
              backgroundSize: '0% 92%',
              animation: 'highlighter-sweep 2s cubic-bezier(0.25, 0.1, 0.25, 1) 0.8s forwards',
              padding: '0.04em 0.22em',
              borderRadius: '0.12em',
              color: '#042f2e',
              whiteSpace: 'nowrap',
              display: 'inline-block',
            }}>fair and simple</span>
          </h1>

          {/* Subheading */}
          <p style={{
            margin: '0 auto',
            fontSize: 'clamp(0.95rem, 1.8vw, 1.1rem)',
            lineHeight: 1.75,
            color: '#94a3b8',
            maxWidth: '700px',
          }}>
            SafarConnect pairs riders with verified local drivers for reliable,
            real-time tracked rides — with fair fares, weather-smart routing,
            and no surge pricing games.
          </p>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            style={{
              display: 'flex',
              gap: '2.5rem',
              marginTop: '2.2rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {[
              { value: '50+', label: 'Cities' },
              { value: '24/7', label: 'Support' },
              { value: '0%',  label: 'Surge' },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#14b8a6',
                  lineHeight: 1,
                  marginBottom: '0.25rem',
                }}>{stat.value}</div>
                <div style={{
                  fontSize: '0.7rem',
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}>{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* ── Premium row CTAs ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.35 }}
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: '900px',
            border: '1px solid rgba(20,184,166,0.1)',
            borderRadius: '1rem',
            overflow: 'hidden',
          }}
        >
          {/* Rider row */}
          <div
            onMouseEnter={() => setHoveredRow('rider')}
            onMouseLeave={() => setHoveredRow(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2rem',
              padding: '1.8rem 2rem',
              background: hoveredRow === 'rider' ? 'rgba(20,184,166,0.04)' : 'transparent',
              borderLeft: `3px solid ${hoveredRow === 'rider' ? '#14b8a6' : 'transparent'}`,
              transition: 'background 0.25s, border-color 0.25s',
            }}
          >
            <div style={{
              flexShrink: 0,
              fontSize: '0.6rem',
              letterSpacing: '0.2em',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: hoveredRow === 'rider' ? '#14b8a6' : '#334155',
              width: '4.5rem',
              transition: 'color 0.25s',
            }}>Rider</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.2rem' }}>
                I need a ride
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
                Book in seconds. Live tracking. Fair fares upfront.
              </div>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', gap: '0.5rem' }}>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('rider-login')}
                style={{
                  padding: '0.5rem 1.1rem',
                  background: '#14b8a6',
                  color: '#050e0d',
                  border: 'none',
                  borderRadius: '0.4rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >Log in</motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('rider-signup')}
                style={{
                  padding: '0.5rem 1.1rem',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid rgba(148,163,184,0.15)',
                  borderRadius: '0.4rem',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >Sign up →</motion.button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(20,184,166,0.07)', margin: '0 2rem' }} />

          {/* Driver row */}
          <div
            onMouseEnter={() => setHoveredRow('driver')}
            onMouseLeave={() => setHoveredRow(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2rem',
              padding: '1.8rem 2rem',
              background: hoveredRow === 'driver' ? 'rgba(20,184,166,0.04)' : 'transparent',
              borderLeft: `3px solid ${hoveredRow === 'driver' ? '#14b8a6' : 'transparent'}`,
              transition: 'background 0.25s, border-color 0.25s',
            }}
          >
            <div style={{
              flexShrink: 0,
              fontSize: '0.6rem',
              letterSpacing: '0.2em',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: hoveredRow === 'driver' ? '#14b8a6' : '#334155',
              width: '4.5rem',
              transition: 'color 0.25s',
            }}>Driver</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '0.2rem' }}>
                I want to drive
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
                Set your own hours. AI dispatch. Keep more of what you earn.
              </div>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', gap: '0.5rem' }}>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('driver-login')}
                style={{
                  padding: '0.5rem 1.1rem',
                  background: '#14b8a6',
                  color: '#050e0d',
                  border: 'none',
                  borderRadius: '0.4rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >Log in</motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('driver-signup')}
                style={{
                  padding: '0.5rem 1.1rem',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid rgba(148,163,184,0.15)',
                  borderRadius: '0.4rem',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >Sign up →</motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}

