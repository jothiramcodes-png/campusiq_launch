import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, ShieldCheck, ArrowRightLeft } from 'lucide-react';

interface DashboardToggleProps {
  current?: 'student' | 'admin';
  className?: string;
  variant?: 'banner' | 'header' | 'compact';
}

export const DashboardToggle: React.FC<DashboardToggleProps> = ({
  current,
  className = '',
  variant = 'banner',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, switchRole } = useAuth();

  // Determine active view: prop > current pathname
  const activeView: 'student' | 'admin' =
    current || (location.pathname.startsWith('/admin') ? 'admin' : 'student');

  const handleSelect = (target: 'student' | 'admin') => {
    if (target === activeView) return;

    if (target === 'admin') {
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        if (switchRole) {
          switchRole('ADMIN');
        }
      }
      navigate('/admin');
    } else {
      if (switchRole && role === 'ADMIN') {
        // Optionally update role state so student experience is authentic
        switchRole('STUDENT');
      }
      navigate('/student');
    }
  };

  const isHeader = variant === 'header';

  return (
    <div
      className={`inline-flex items-center p-1 rounded-2xl transition-all select-none shadow-md ${
        isHeader
          ? 'bg-black/40 border border-white/15 backdrop-blur-md'
          : 'bg-black/35 border border-white/20 backdrop-blur-xl'
      } ${className}`}
      role="group"
      aria-label="Dashboard View Toggle"
    >
      {/* Student Dashboard Option */}
      <button
        type="button"
        onClick={() => handleSelect('student')}
        className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
          activeView === 'student'
            ? 'bg-[#C49A55] text-white shadow-lg scale-[1.02]'
            : 'text-white/70 hover:text-white hover:bg-white/10'
        }`}
        title="Switch to Student Learning Dashboard"
      >
        <GraduationCap className={`w-3.5 h-3.5 ${activeView === 'student' ? 'text-white' : 'text-[#C49A55]'}`} />
        <span className="tracking-tight whitespace-nowrap">Student Dashboard</span>
        {activeView === 'student' && (
          <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5 animate-pulse" />
        )}
      </button>

      {/* Quick Visual Divider / Switcher Icon */}
      <div className="px-0.5 text-white/30 hidden sm:block">
        <ArrowRightLeft className="w-2.5 h-2.5" />
      </div>

      {/* Admin Dashboard Option */}
      <button
        type="button"
        onClick={() => handleSelect('admin')}
        className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
          activeView === 'admin'
            ? 'bg-[#173B2F] text-white border border-[#C49A55]/60 shadow-lg scale-[1.02]'
            : 'text-white/70 hover:text-white hover:bg-white/10'
        }`}
        title="Switch to Admin Video Management Dashboard"
      >
        <ShieldCheck className={`w-3.5 h-3.5 ${activeView === 'admin' ? 'text-[#C49A55]' : 'text-emerald-400'}`} />
        <span className="tracking-tight whitespace-nowrap">Admin Dashboard</span>
        {activeView === 'admin' && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#C49A55] ml-0.5 animate-pulse" />
        )}
      </button>
    </div>
  );
};
