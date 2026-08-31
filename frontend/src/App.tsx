import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { WatchlistSidebar } from './components/WatchlistSidebar';
import { FinancialChart } from './components/FinancialChart';
import { DataHealthPanel } from './components/DataHealthPanel';
import { NepseOverview } from './components/NepseOverview';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { UserProfileModal } from './components/UserProfileModal';
import { TradeAlertBanner } from './components/TradeAlertBanner';
import { tradeAlertEngine, TradeSignal } from './services/tradeAlertEngine';

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

  const [mobileTab, setMobileTab] = useState<'chart' | 'watchlist' | 'overview'>('chart');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Trade Alert State
  const [activeAlerts, setActiveAlerts] = useState<TradeSignal[]>([]);
  const [alertsMuted, setAlertsMuted] = useState<boolean>(false);

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
  const loadMarketInfo = async () => {
    try {
      setLoadError(null);
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
    } catch (err: any) {
      console.error('Market loading error:', err);
      setLoadError('Connection lost. Please try again.');
    }
  };

  useEffect(() => {
    if (screen !== 'dashboard') return;
    loadMarketInfo();
  }, [screen, activeMarket]);

  // 3a. Start trade alert engine when on dashboard with symbols
  useEffect(() => {
    if (screen !== 'dashboard' || symbols.length === 0) return;

    const handleAlert = (signal: TradeSignal) => {
      setActiveAlerts(prev => {
        const filtered = prev.filter(a => a.symbol !== signal.symbol);
        return [signal, ...filtered].slice(0, 5);
      });
    };

    tradeAlertEngine.onAlert(handleAlert);
    tradeAlertEngine.isEnabled = !alertsMuted;
    tradeAlertEngine.start(activeMarket, symbols.map(s => s.symbol));

    return () => {
      tradeAlertEngine.offAlert(handleAlert);
      tradeAlertEngine.stop();
    };
  }, [screen, activeMarket, symbols]);

  // Sync mute state with engine
  useEffect(() => {
    tradeAlertEngine.isEnabled = !alertsMuted;
  }, [alertsMuted]);

  // 3. Load OHLCV Candles when Symbol or Timeframe changes on Dashboard
  const loadCandles = async () => {
    if (!selectedSymbol) return;
    setIsLoadingChart(true);
    setLoadError(null);
    try {
      const data = await api.getOHLCV(activeMarket, selectedSymbol, timeframe, 80);
      setOhlcvData(data);
    } catch (err: any) {
      console.error('Failed to load chart data:', err);
      setLoadError('Connection lost. Please try again.');
    } finally {
      setIsLoadingChart(false);
    }
  };

  useEffect(() => {
    if (screen !== 'dashboard' || !selectedSymbol) return;
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

      {/* Network Alert / Retry Banner */}
      {loadError && (
        <div className="bg-rose-950/90 border-b border-rose-700 px-4 py-2 flex items-center justify-between text-xs text-rose-200 font-mono z-20 shrink-0">
          <span>⚠️ {loadError}</span>
          <button
            onClick={() => { loadMarketInfo(); loadCandles(); }}
            className="bg-rose-800 hover:bg-rose-700 text-white px-2.5 py-1 rounded text-[11px] font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Mobile Tab Navigation (< lg screens) */}
      <div className="lg:hidden flex border-b border-[#1c2438] bg-[#0c101c] shrink-0">
        <button
          onClick={() => setMobileTab('chart')}
          className={`flex-1 py-2 text-xs font-mono font-bold text-center transition-all ${
            mobileTab === 'chart'
              ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          📈 Chart & Quant
        </button>
        <button
          onClick={() => setMobileTab('watchlist')}
          className={`flex-1 py-2 text-xs font-mono font-bold text-center transition-all ${
            mobileTab === 'watchlist'
              ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          📋 Watchlist
        </button>
        <button
          onClick={() => setMobileTab('overview')}
          className={`flex-1 py-2 text-xs font-mono font-bold text-center transition-all ${
            mobileTab === 'overview'
              ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          🇳🇵 Overview
        </button>
      </div>

      {/* Main Terminal Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Watchlist Sidebar */}
        <div className={`h-full ${mobileTab === 'watchlist' ? 'w-full flex' : 'hidden lg:flex'}`}>
          <WatchlistSidebar
            activeMarket={activeMarket}
            onSelectMarket={(m) => setActiveMarket(m)}
            symbols={symbols}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={(sym) => {
              setSelectedSymbol(sym);
              setMobileTab('chart');
            }}
          />
        </div>

        {/* Center Canvas (Chart + Data Health Panel) */}
        <main className={`flex-1 flex-col p-3 gap-3 overflow-hidden ${mobileTab === 'chart' ? 'flex' : 'hidden lg:flex'}`}>
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
        <div className={`h-full ${mobileTab === 'overview' ? 'w-full flex' : 'hidden lg:flex'}`}>
          <NepseOverview nepseData={nepseOverview} />
        </div>
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

      {/* Trade Alert Banner — auto-speaks BUY/SELL signals */}
      <TradeAlertBanner
        alerts={activeAlerts}
        isMuted={alertsMuted}
        onMuteToggle={() => setAlertsMuted(m => !m)}
        onDismiss={(sym) => setActiveAlerts(prev => prev.filter(a => a.symbol !== sym))}
      />

      {/* Voice Assistant Modal */}
      <VoiceAssistantModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        selectedSymbol={selectedSymbol}
        selectedMarket={activeMarket}
        user={user}
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
