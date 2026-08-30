import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { WatchlistSidebar } from './components/WatchlistSidebar';
import { FinancialChart } from './components/FinancialChart';
import { DataHealthPanel } from './components/DataHealthPanel';
import { NepseOverview } from './components/NepseOverview';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { UserProfileModal } from './components/UserProfileModal';

import { AuthWelcome } from './components/auth/AuthWelcome';
import { AuthRegister } from './components/auth/AuthRegister';
import { AuthLogin } from './components/auth/AuthLogin';
import { AuthForgotPassword } from './components/auth/AuthForgotPassword';
import { OnboardingWizard } from './components/auth/OnboardingWizard';

import { api } from './services/api';
import { MarketType, Timeframe, SymbolInfo, OHLCVResponse, MarketStatus, User } from './types';

type ScreenState = 'welcome' | 'register' | 'login' | 'forgot_password' | 'onboarding' | 'dashboard';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>('welcome');
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Trading Dashboard State
  const [activeMarket, setActiveMarket] = useState<MarketType>('NEPSE');
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NABIL');
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [ohlcvData, setOhlcvData] = useState<OHLCVResponse | null>(null);
  const [nepseStatus, setNepseStatus] = useState<MarketStatus | null>(null);
  const [nepseOverview, setNepseOverview] = useState<any>(null);
  const [isLoadingChart, setIsLoadingChart] = useState<boolean>(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);

  // 1. Initial Session Check on App Startup
  useEffect(() => {
    const checkAuth = async () => {
      const token = api.getToken();
      if (!token) {
        setScreen('welcome');
        setIsInitializing(false);
        return;
      }
      try {
        const profile = await api.getMyProfile();
        setUser(profile);
        if (profile.preferences && profile.preferences.onboarded) {
          setScreen('dashboard');
        } else {
          setScreen('onboarding');
        }
      } catch (err) {
        api.clearToken();
        setUser(null);
        setScreen('welcome');
      } finally {
        setIsInitializing(false);
      }
    };
    checkAuth();
  }, []);

  // 2. Load Market Overview and Symbols when on Dashboard
  useEffect(() => {
    if (screen !== 'dashboard') return;

    const loadMarketInfo = async () => {
      try {
        const [status, overview, syms] = await Promise.all([
          api.getNepseStatus().catch(() => null),
          api.getNepseSectors().catch(() => null),
          api.getSymbols(activeMarket).catch(() => []),
        ]);
        if (status) setNepseStatus(status);
        if (overview) setNepseOverview(overview);
        if (syms.length > 0) {
          setSymbols(syms);
          if (!syms.some((s) => s.symbol === selectedSymbol)) {
            setSelectedSymbol(syms[0].symbol);
          }
        }
      } catch (err) {
        console.error('Market loading error:', err);
      }
    };
    loadMarketInfo();
  }, [screen, activeMarket]);

  // 3. Load OHLCV Candles when Symbol or Timeframe changes on Dashboard
  useEffect(() => {
    if (screen !== 'dashboard' || !selectedSymbol) return;

    const loadCandles = async () => {
      setIsLoadingChart(true);
      try {
        const data = await api.getOHLCV(activeMarket, selectedSymbol, timeframe, 80);
        setOhlcvData(data);
      } catch (err: any) {
        console.error('Failed to load chart data:', err);
      } finally {
        setIsLoadingChart(false);
      }
    };
    loadCandles();
  }, [screen, activeMarket, selectedSymbol, timeframe]);

  // Handle Logout
  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setIsProfileOpen(false);
    setScreen('welcome');
  };

  // Loading Splash
  if (isInitializing) {
    return (
      <div className="h-screen w-screen bg-[#080b12] flex items-center justify-center font-mono text-cyan-400 text-xs gap-3 select-none">
        <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        <span>SHACHINA INITIALIZING...</span>
      </div>
    );
  }

  // SCREEN ROUTER
  if (screen === 'welcome') {
    return (
      <AuthWelcome
        onGoToRegister={() => setScreen('register')}
        onGoToLogin={() => setScreen('login')}
      />
    );
  }

  if (screen === 'register') {
    return (
      <AuthRegister
        onSuccess={(newUser) => {
          setUser(newUser);
          setScreen('onboarding');
        }}
        onGoToLogin={() => setScreen('login')}
        onGoToWelcome={() => setScreen('welcome')}
      />
    );
  }

  if (screen === 'login') {
    return (
      <AuthLogin
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          if (loggedUser.onboarded) {
            setScreen('dashboard');
          } else {
            setScreen('onboarding');
          }
        }}
        onGoToRegister={() => setScreen('register')}
        onGoToForgotPassword={() => setScreen('forgot_password')}
        onGoToWelcome={() => setScreen('welcome')}
      />
    );
  }

  if (screen === 'forgot_password') {
    return <AuthForgotPassword onGoToLogin={() => setScreen('login')} />;
  }

  if (screen === 'onboarding' && user) {
    return (
      <OnboardingWizard
        user={user}
        onComplete={() => setScreen('dashboard')}
      />
    );
  }

  // 4. MAIN SHACHINA TRADING DASHBOARD
  return (
    <div className="h-screen w-screen flex flex-col bg-[#090d16] text-slate-100 overflow-hidden select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Header */}
      <Header
        nepseStatus={nepseStatus}
        user={user}
        onOpenVoice={() => setIsVoiceOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
      />

      {/* Main Terminal Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Watchlist Sidebar */}
        <WatchlistSidebar
          activeMarket={activeMarket}
          onSelectMarket={(m) => setActiveMarket(m)}
          symbols={symbols}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={(sym) => setSelectedSymbol(sym)}
        />

        {/* Center Canvas (Chart + Data Health Panel) */}
        <main className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
          <FinancialChart
            symbol={selectedSymbol}
            currency={ohlcvData?.currency || (activeMarket === 'NEPSE' ? 'NPR' : 'USD')}
            timeframe={timeframe}
            candles={ohlcvData?.candles || []}
            onTimeframeChange={(tf) => setTimeframe(tf)}
            isLoading={isLoadingChart}
          />

          <DataHealthPanel report={ohlcvData?.data_quality || null} />
        </main>

        {/* Right NEPSE / Global Summary */}
        <NepseOverview nepseData={nepseOverview} />
      </div>

      {/* Floating Voice Assistant Trigger */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={() => setIsVoiceOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold px-4 py-2.5 rounded-full shadow-2xl shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all group"
        >
          <span className="text-base group-hover:animate-bounce">🎙️</span>
          <span className="font-mono text-xs tracking-wider">HEY SHACHINA</span>
        </button>
      </div>

      {/* Voice Assistant Modal */}
      <VoiceAssistantModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        selectedSymbol={selectedSymbol}
      />

      {/* User Profile & Settings Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        onLogout={handleLogout}
      />
    </div>
  );
};
