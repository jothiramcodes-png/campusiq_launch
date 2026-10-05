import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ChevronDown,
  UserCheck,
  ExternalLink,
  LogOut,
  GraduationCap
} from 'lucide-react';

export const AppHeader: React.FC = () => {
  const { currentUser, role, logout } = useAuth();

  const [personaOpen, setPersonaOpen] = useState(false);

  const getDashboardRoot = () => {
    switch (role) {
      case 'ADMIN':
      case 'SUPER_ADMIN': return '/admin';
      case 'STUDENT':
      default: return '/student';
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-[#173B2F]/95 backdrop-blur-xl border-b border-[#C49A55]/20 text-white transition-all shadow-lg">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Left: Mobile Brand Logo & Desktop Contextual Breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Mobile Brand Logo with Official Attached NSCET Emblem */}
          <Link to="/" className="flex lg:hidden items-center gap-2">
            <div className="h-9 px-2 py-0.5 rounded-lg bg-white shadow-sm border border-[#C49A55]/50 flex items-center shrink-0">
              <img
                src="/assets/nscet-college-logo.jpg"
                alt="NSCET Logo"
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black tracking-tight flex items-center gap-1">
                <span>CAMPUS</span>
                <span className="text-[#6FA9C9]">IQ</span>
              </span>
              <span className="text-[8px] uppercase tracking-widest text-[#C49A55] font-semibold -mt-0.5">
                {role} PORTAL
              </span>
            </div>
          </Link>

          {/* Desktop Contextual Breadcrumb & Quick AI Search Bar */}
          <div className="hidden lg:flex items-center gap-3.5">
            <Link
              to={getDashboardRoot()}
              className="flex items-center gap-2 text-xs hover:opacity-90 transition-opacity"
            >
              <GraduationCap className="w-4 h-4 text-[#C49A55]" />
              <span className="text-white/70 font-medium">NSCET Theni</span>
              <span className="text-[#C49A55] font-bold">/</span>
              <span className="font-bold text-white tracking-wide uppercase text-[11px] bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/10 shadow-inner">
                {role} Portal
              </span>
            </Link>

            {/* Official Status Pill */}
            <div className="hidden sm:flex items-center gap-2 bg-black/30 border border-white/15 rounded-xl px-3 py-1.5 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-white/80 font-medium">
                NSCET Theni • Official Institutional Portal
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions & Persona */}
        <div className="flex items-center gap-2 sm:gap-3">


          {/* Persona Switcher Quick Pill */}
          <div className="relative">
            <button
              onClick={() => setPersonaOpen(!personaOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-black/30 hover:bg-black/50 border border-white/15 text-xs text-white transition-all cursor-pointer shadow-inner"
            >
              <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 border border-[#C49A55]/70 shrink-0">
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <UserCheck className="w-4 h-4 m-1 text-[#C49A55]" />
                )}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-white leading-tight truncate max-w-[120px]">
                  {currentUser?.name}
                </span>
                <span className="text-[9px] text-[#A2B6AC] uppercase font-semibold">{role}</span>
              </div>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {personaOpen && (
              <div className="absolute right-0 mt-2 w-72 p-3 bg-[#101815] border border-white/20 rounded-2xl shadow-2xl z-50 animate-fade-in space-y-2">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate max-w-[170px]">
                      {currentUser?.name || 'User'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                      role === 'ADMIN'
                        ? 'bg-[#C49A55] text-black'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {role}
                    </span>
                  </div>
                  {currentUser?.email && (
                    <div className="text-[11px] text-gray-400 truncate font-mono">
                      {currentUser.email}
                    </div>
                  )}
                </div>

                <div className="space-y-1 pt-1 border-t border-white/10">
                  {role === 'STUDENT' && (
                    <Link
                      to="/student/profile"
                      onClick={() => setPersonaOpen(false)}
                      className="w-full px-3 py-2 text-xs text-gray-200 hover:bg-white/10 rounded-xl flex items-center gap-2 transition-colors"
                    >
                      <GraduationCap className="w-3.5 h-3.5 text-[#C49A55]" />
                      <span>Student Profile & Smart ID</span>
                    </Link>
                  )}

                  <Link
                    to="/landing"
                    onClick={() => setPersonaOpen(false)}
                    className="w-full px-3 py-2 text-xs text-gray-300 hover:bg-white/10 rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#C49A55]" />
                    <span>Campus Landing Page</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setPersonaOpen(false);
                    }}
                    className="w-full px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};

