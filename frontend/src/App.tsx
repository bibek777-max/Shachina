import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { WatchlistSidebar } from './components/WatchlistSidebar';
import { FinancialChart } from './components/FinancialChart';
import { DataHealthPanel } from './components/DataHealthPanel';
import { TradingPanel } from './components/TradingPanel';
import { ShachinaAssistantPanel } from './components/ShachinaAssistantPanel';
import { UserProfileModal } from './components/UserProfileModal';
import { TradeAlertBanner } from './components/TradeAlertBanner';
import { NavigationSidebar, NavSection } from './components/NavigationSidebar';
import { MainChatView } from './components/MainChatView';
import { MemoryModal } from './components/MemoryModal';
import { ProjectsModal } from './components/ProjectsModal';
import { tradeAlertEngine, TradeSignal } from './services/tradeAlertEngine';

import { AuthLogin } from './components/auth/AuthLogin';
import { AuthForgotPassword } from './components/auth/AuthForgotPassword';
import { OnboardingWizard } from './components/auth/OnboardingWizard';

import { api } from './services/api';
import {
  MarketType,
  Timeframe,
  SymbolInfo,
  OHLCVResponse,
  MarketStatus,
  User,
  ChartAnnotations,
  TradingPosition,
  TradeOrder,
  Project,
} from './types';

type ScreenState = 'login' | 'forgot_password' | 'onboarding' | 'dashboard';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>('login');
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Navigation State (Sidebar)
  const [activeNav, setActiveNav] = useState<NavSection>('chats');
  const [isMemoryOpen, setIsMemoryOpen] = useState<boolean>(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState<boolean>(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  // Trading Dashboard State
  const [activeMarket, setActiveMarket] = useState<MarketType>('NEPSE');
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NABIL');
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [ohlcvData, setOhlcvData] = useState<OHLCVResponse | null>(null);
  const [nepseStatus, setNepseStatus] = useState<MarketStatus | null>(null);
  const [isLoadingChart, setIsLoadingChart] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isAssistantModalOpen, setIsAssistantModalOpen] = useState<boolean>(false);

  // Shachina Chart Annotations & Controlled Trading State
  const [chartAnnotations, setChartAnnotations] = useState<ChartAnnotations | null>(null);
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [orders, setOrders] = useState<TradeOrder[]>([]);
  const [emergencyStop, setEmergencyStop] = useState<boolean>(false);

  // Mobile Tabs
  const [mobileTab, setMobileTab] = useState<'chart' | 'watchlist' | 'assistant' | 'trading'>('chart');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Trade Alert State
  const [activeAlerts, setActiveAlerts] = useState<TradeSignal[]>([]);
  const [alertsMuted, setAlertsMuted] = useState<boolean>(false);

  // 1. Initial Session Check on App Startup
  useEffect(() => {
    const checkAuth = async () => {
      const token = api.getToken();
      if (!token) {
        setScreen('login');
        setIsInitializing(false);
        return;
      }
      try {
        const profile = await api.getMyProfile();
        setUser(profile);
        setEmergencyStop(profile.trading_settings?.emergency_stop_enabled || false);
        setScreen('dashboard');
      } catch (err) {
        api.clearToken();
        setUser(null);
        setScreen('login');
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
      const [status, syms] = await Promise.all([
        api.getNepseStatus().catch(() => null),
        api.getSymbols(activeMarket).catch(() => []),
      ]);
      if (status) setNepseStatus(status);
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

  // 3. Load Positions and Orders
  const loadPositionsAndOrders = useCallback(async () => {
    try {
      const [posList, ordList] = await Promise.all([
        api.getTradingPositions().catch(() => []),
        api.getTradingOrders().catch(() => []),
      ]);
      setPositions(posList);
      setOrders(ordList);
    } catch (err) {
      console.error('Failed to load positions/orders:', err);
    }
  }, []);

  useEffect(() => {
    if (screen !== 'dashboard') return;
    loadMarketInfo();
    loadPositionsAndOrders();
  }, [screen, activeMarket, loadPositionsAndOrders]);

  // 4. Start trade alert engine
  useEffect(() => {
    if (screen !== 'dashboard' || symbols.length === 0) return;

    const handleAlert = (signal: TradeSignal) => {
      setActiveAlerts((prev) => {
        const filtered = prev.filter((a) => a.symbol !== signal.symbol);
        return [signal, ...filtered].slice(0, 5);
      });
    };

    tradeAlertEngine.onAlert(handleAlert);
    tradeAlertEngine.isEnabled = !alertsMuted;
    tradeAlertEngine.start(
      activeMarket,
      symbols.map((s) => s.symbol)
    );

    return () => {
      tradeAlertEngine.offAlert(handleAlert);
      tradeAlertEngine.stop();
    };
  }, [screen, activeMarket, symbols, alertsMuted]);

  // 5. Load OHLCV Candles when Symbol or Timeframe changes
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
    setScreen('login');
  };

  // Toggle Emergency Stop
  const handleToggleEmergencyStop = async (enabled: boolean) => {
    try {
      await api.toggleEmergencyStop(enabled);
      setEmergencyStop(enabled);
    } catch (err) {
      console.error('Failed to toggle emergency stop:', err);
    }
  };

  const handleNavSelect = (sec: NavSection) => {
    if (sec === 'memory') {
      setIsMemoryOpen(true);
      return;
    }
    if (sec === 'projects') {
      setIsProjectsOpen(true);
      return;
    }
    if (sec === 'settings') {
      setIsProfileOpen(true);
      return;
    }
    setActiveNav(sec);
  };

  // ── Initial Loading Splash ─────────────────────────────────────────────────
  if (isInitializing) {
    return (
      <div className="h-screen w-screen bg-[#080d1a] flex flex-col items-center justify-center text-slate-100 font-mono gap-3 select-none">
        <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm font-extrabold text-cyan-300 tracking-wider">INITIALIZING SHACHINA...</span>
      </div>
    );
  }

  // ── Auth Screens ───────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <AuthLogin
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          setScreen('dashboard');
        }}
        onGoToForgotPassword={() => setScreen('forgot_password')}
      />
    );
  }

  if (screen === 'forgot_password') {
    return <AuthForgotPassword onGoToLogin={() => setScreen('login')} />;
  }

  if (screen === 'onboarding' && user) {
    return <OnboardingWizard user={user} onComplete={() => setScreen('dashboard')} />;
  }

  // ── MAIN APPLICATION ───────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex bg-[#070b16] text-slate-100 overflow-hidden select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* ── Left Sidebar Navigation (Chats, Projects, Search, Files, Images, Deep Research, 🧠 Trading AI, Memory, Settings) ── */}
      <div className="hidden md:flex h-full shrink-0">
        <NavigationSidebar
          activeSection={activeNav}
          onSelectSection={handleNavSelect}
          onNewChat={() => {
            setActiveNav('chats');
          }}
          user={user}
          onOpenSettings={() => setIsProfileOpen(true)}
        />
      </div>

      {/* ── Main Workspace Body ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* VIEW 1: ChatGPT-style General AI Assistant */}
        {activeNav !== 'trading_ai' ? (
          <MainChatView
            user={user}
            selectedSymbol={selectedSymbol}
            selectedMarket={activeMarket}
            timeframe={timeframe}
            initialMode={activeNav}
            activeProjectId={activeProject?.id}
            onOpenTradingAI={() => setActiveNav('trading_ai')}
            onAnnotationsReceived={(ann) => setChartAnnotations(ann)}
          />
        ) : (
          /* VIEW 2: 🧠 Trading AI — Full 4-Quadrant Institutional Trading Terminal */
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Top Header */}
            <Header
              nepseStatus={nepseStatus}
              user={user}
              positions={positions}
              onOpenVoice={() => setIsAssistantModalOpen(true)}
              onOpenProfile={() => setIsProfileOpen(true)}
            />

            {/* Network Alert / Retry Banner */}
            {loadError && (
              <div className="bg-rose-950/90 border-b border-rose-700 px-4 py-1.5 flex items-center justify-between text-xs text-rose-200 font-mono z-20 shrink-0">
                <span>⚠️ {loadError}</span>
                <button
                  onClick={() => {
                    loadMarketInfo();
                    loadCandles();
                  }}
                  className="bg-rose-800 hover:bg-rose-700 text-white px-2.5 py-0.5 rounded text-[10px] font-bold"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Mobile Tab Switcher */}
            <div className="lg:hidden flex border-b border-[#1c2438] bg-[#0c101c] shrink-0 text-xs font-mono">
              <button
                onClick={() => setMobileTab('chart')}
                className={`flex-1 py-2 font-bold text-center ${
                  mobileTab === 'chart' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20' : 'text-slate-400'
                }`}
              >
                📈 Chart
              </button>
              <button
                onClick={() => setMobileTab('watchlist')}
                className={`flex-1 py-2 font-bold text-center ${
                  mobileTab === 'watchlist' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20' : 'text-slate-400'
                }`}
              >
                📋 Watchlist
              </button>
              <button
                onClick={() => setMobileTab('assistant')}
                className={`flex-1 py-2 font-bold text-center ${
                  mobileTab === 'assistant' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20' : 'text-slate-400'
                }`}
              >
                ✨ Shachina AI
              </button>
              <button
                onClick={() => setMobileTab('trading')}
                className={`flex-1 py-2 font-bold text-center ${
                  mobileTab === 'trading' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/20' : 'text-slate-400'
                }`}
              >
                💼 Positions ({positions.length})
              </button>
            </div>

            {/* 4-Quadrant Workspace */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left: Watchlist Sidebar */}
              <div className={`h-full ${mobileTab === 'watchlist' ? 'w-full flex' : 'hidden lg:flex lg:w-64 shrink-0'}`}>
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

              {/* Center: Canvas Candlestick Chart + Data Health */}
              <main className={`flex-1 flex-col p-2 gap-2 overflow-hidden ${mobileTab === 'chart' ? 'flex' : 'hidden lg:flex'}`}>
                <div className="flex-1 relative overflow-hidden">
                  <FinancialChart
                    symbol={selectedSymbol}
                    currency={ohlcvData?.currency || (activeMarket === 'NEPSE' ? 'NPR' : 'USD')}
                    timeframe={timeframe}
                    candles={ohlcvData?.candles || []}
                    annotations={chartAnnotations}
                    onTimeframeChange={(tf) => setTimeframe(tf)}
                    isLoading={isLoadingChart}
                  />
                </div>
                <div className="h-10 shrink-0">
                  <DataHealthPanel report={ohlcvData?.data_quality || null} />
                </div>
              </main>

              {/* Right: Shachina AI Assistant Panel */}
              <div className={`h-full ${mobileTab === 'assistant' ? 'w-full flex' : 'hidden lg:flex lg:w-96 shrink-0'}`}>
                <ShachinaAssistantPanel
                  selectedSymbol={selectedSymbol}
                  selectedMarket={activeMarket}
                  user={user}
                  isEmbedded={true}
                  onAnnotationsReceived={(ann) => setChartAnnotations(ann)}
                  onOrderPlaced={() => loadPositionsAndOrders()}
                />
              </div>

              {/* Mobile-only Positions */}
              {mobileTab === 'trading' && (
                <div className="w-full h-full lg:hidden flex flex-col">
                  <TradingPanel
                    positions={positions}
                    orders={orders}
                    emergencyStop={emergencyStop}
                    onRefresh={() => loadPositionsAndOrders()}
                    onEmergencyStopToggle={handleToggleEmergencyStop}
                  />
                </div>
              )}
            </div>

            {/* Bottom Quadrant: Positions, Orders & Risk Panel (Desktop) */}
            <div className="hidden lg:block h-48 border-t border-[#1c2438] shrink-0">
              <TradingPanel
                positions={positions}
                orders={orders}
                emergencyStop={emergencyStop}
                onRefresh={() => loadPositionsAndOrders()}
                onEmergencyStopToggle={handleToggleEmergencyStop}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Modals & Banners ──────────────────────────────────────────────── */}
      <TradeAlertBanner
        alerts={activeAlerts}
        isMuted={alertsMuted}
        onMuteToggle={() => setAlertsMuted((m) => !m)}
        onDismiss={(sym) => setActiveAlerts((prev) => prev.filter((a) => a.symbol !== sym))}
      />

      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      <MemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
      />

      <ProjectsModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        activeProjectId={activeProject?.id}
        onSelectProject={(p) => setActiveProject(p)}
      />
    </div>
  );
};
