import React from 'react';
import { TplLogo } from './TplLogo';
import { UserRole, HeaderTheme, LogoPlacement } from '../types';
import { TPL_THEME } from '../constants/theme';
import { LogIn, LogOut, Shield, User, Sliders, Users } from 'lucide-react';

interface HeaderProps {
  currentRole: UserRole | null;
  headerTheme: HeaderTheme;
  logoPlacement?: LogoPlacement;
  customLogoSrc?: string;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenAdminPanel?: () => void;
  onOpenManpower?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  headerTheme,
  logoPlacement = 'left',
  customLogoSrc,
  onOpenLogin,
  onLogout,
  onOpenAdminPanel,
  onOpenManpower,
}) => {
  const isNorasGreen = headerTheme === 'noras-green';

  return (
    <header
      className={`w-full transition-colors duration-200 border-b ${
        isNorasGreen
          ? 'text-white border-[#032620]'
          : 'bg-white text-slate-800 border-slate-200 shadow-xs'
      }`}
      style={{
        backgroundColor: isNorasGreen ? TPL_THEME.primary : '#ffffff',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* TPL Logo with placement */}
        <div className={`flex items-center ${logoPlacement === 'center' ? 'flex-1 justify-center sm:justify-start' : ''}`}>
          <TplLogo
            variant={isNorasGreen ? 'white' : 'dark'}
            size="md"
            customSrc={customLogoSrc}
          />
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-3">
          {currentRole ? (
            <div className="flex items-center gap-2.5">
              {/* Role Indicator Badge */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                  isNorasGreen
                    ? 'bg-white/15 text-white border border-white/25'
                    : 'bg-emerald-50 text-[#04342c] border border-emerald-200'
                }`}
              >
                {currentRole === 'admin' ? (
                  <Shield className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <User className="w-3.5 h-3.5 text-emerald-300" />
                )}
                <span className="capitalize">{currentRole}</span>
              </div>

              {/* Manpower Quick Button (Admin Only) */}
              {currentRole === 'admin' && onOpenManpower && (
                <button
                  onClick={onOpenManpower}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    isNorasGreen
                      ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-[#04342c] border border-emerald-200'
                  }`}
                  title="Daily Work Activities & Manpower Management"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Manpower</span>
                </button>
              )}

              {/* Admin Menu Special Access Button (Admin Only) */}
              {currentRole === 'admin' && onOpenAdminPanel && (
                <button
                  onClick={onOpenAdminPanel}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    isNorasGreen
                      ? 'bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                  }`}
                  title="Admin Special Access Panel"
                >
                  <Sliders className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Admin Menu</span>
                </button>
              )}

              {/* Logout Button */}
              <button
                onClick={onLogout}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isNorasGreen
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200 hover:text-white border border-red-500/30'
                    : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                }`}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            /* Public Dashboard Login Button - Strict Label "Login" */
            <button
              onClick={onOpenLogin}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all shadow-xs ${
                isNorasGreen
                  ? 'bg-white text-[#04342c] hover:bg-emerald-50 active:scale-98'
                  : 'bg-[#04342c] text-white hover:bg-[#032620] active:scale-98'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
