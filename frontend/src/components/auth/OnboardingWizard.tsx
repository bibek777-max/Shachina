import React, { useState } from 'react';
import { api } from '../../services/api';
import { User, MarketType } from '../../types';
import {
  TrendingUp,
  Languages,
  Mic,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Zap,
} from 'lucide-react';

interface OnboardingWizardProps {
  user: User;
  onComplete: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ user, onComplete }) => {
  const [step, setStep] = useState(1);
  const [primaryMarket, setPrimaryMarket] = useState<MarketType>('NEPSE');
  const [supportedMarkets, setSupportedMarkets] = useState<string[]>(['NEPSE', 'CRYPTO', 'US_STOCKS']);
  const [language, setLanguage] = useState<string>('ne');
  const [wakeWord, setWakeWord] = useState<string>('HEY SHACHINA');
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [autoSpeakAlerts, setAutoSpeakAlerts] = useState<boolean>(true);
  const [accountSize, setAccountSize] = useState<number>(1000000.0);
  const [riskPercentage, setRiskPercentage] = useState<number>(1.0);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(3.0);
  const [loading, setLoading] = useState(false);

  const toggleMarket = (m: string) => {
    if (m === 'NEPSE') return; // NEPSE is always active as primary
    if (supportedMarkets.includes(m)) {
      setSupportedMarkets(supportedMarkets.filter((x) => x !== m));
    } else {
      setSupportedMarkets([...supportedMarkets, m]);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await Promise.all([
        api.updatePreferences({
          primary_market: primaryMarket,
          supported_markets: supportedMarkets,
          language: language,
          onboarded: true,
        }),
        api.updateTradingSettings({
          account_size: accountSize,
          risk_percentage: riskPercentage,
          max_daily_loss: maxDailyLoss,
        }),
        api.updateVoiceSettings({
          wake_word: wakeWord,
          voice_enabled: voiceEnabled,
          speech_language: language,
          auto_speak_alerts: autoSpeakAlerts,
        }),
      ]);
      onComplete();
    } catch (err) {
      console.error('Failed to save onboarding preferences:', err);
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080b12] text-slate-100 flex items-center justify-center p-4 relative select-none">
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-2xl bg-[#0e1424] border border-[#1d273f] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative z-10">
        {/* Top Progress Bar */}
        <div className="p-6 border-b border-[#1c263d] bg-[#0c101c] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center text-black font-black text-sm">
              ⚡
            </div>
            <div>
              <h2 className="font-extrabold text-white text-sm font-mono tracking-tight">
                WELCOME, {user.full_name.toUpperCase()}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Step {step} of 4 • Customize Your Intelligence Environment
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s
                    ? 'bg-cyan-400 text-black shadow-md shadow-cyan-500/30'
                    : step > s
                    ? 'bg-emerald-950 border border-emerald-500/50 text-emerald-400'
                    : 'bg-[#151c2e] text-slate-500'
                }`}
              >
                {step > s ? '✓' : s}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 sm:p-8 flex-1">
          {/* STEP 1: Markets */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase">
                  <TrendingUp className="w-4 h-4" /> Step 1: Market Universe Selection
                </div>
                <h3 className="text-lg font-bold text-white">Select Your Primary & Global Markets</h3>
                <p className="text-xs text-slate-400 font-mono">
                  NEPSE is the primary default market. You can also monitor global assets.
                </p>
              </div>

              {/* Primary Market Card */}
              <div className="p-4 rounded-xl bg-cyan-950/40 border-2 border-cyan-400 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-lg">
                    🇳🇵
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white font-mono">NEPSE (Primary)</span>
                      <span className="text-[9px] bg-cyan-400 text-black font-mono font-bold px-1.5 py-0.5 rounded">
                        DEFAULT
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Nepal Stock Exchange • Currency: NPR • Timezone: Asia/Kathmandu
                    </p>
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-cyan-400" />
              </div>

              {/* Secondary Markets */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { key: 'CRYPTO', label: '🪙 Crypto', desc: 'BTC, ETH, SOL (24/7 USD)' },
                  { key: 'US_STOCKS', label: '🇺🇸 US Stocks', desc: 'AAPL, NVDA, TSLA, SPY' },
                  { key: 'FOREX', label: '💱 Forex', desc: 'EUR/USD, GBP/USD, USD/JPY' },
                  { key: 'COMMODITIES', label: '🥇 Commodities', desc: 'Gold (XAU), Silver, Oil' },
                ].map((m) => {
                  const isChecked = supportedMarkets.includes(m.key);
                  return (
                    <div
                      key={m.key}
                      onClick={() => toggleMarket(m.key)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all font-mono ${
                        isChecked
                          ? 'bg-[#152138] border-cyan-500/50 text-white'
                          : 'bg-[#111726] border-[#1f2b45] text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span>{m.label}</span>
                        {isChecked && <span className="text-cyan-400 text-[10px]">✓ ACTIVE</span>}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 font-sans">{m.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: Language */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase">
                  <Languages className="w-4 h-4" /> Step 2: Language Preference
                </div>
                <h3 className="text-lg font-bold text-white">Select Interaction Language</h3>
                <p className="text-xs text-slate-400 font-mono">
                  Shachina seamlessly handles voice & text responses in your preferred language.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {[
                  {
                    id: 'ne',
                    name: 'नेपाली (Nepali)',
                    sub: 'Default for NEPSE Scrips',
                    phrase: '"आज NEPSE scan गर।"',
                  },
                  {
                    id: 'en',
                    name: 'English',
                    sub: 'Global Standard',
                    phrase: '"Analyze Bitcoin market structure."',
                  },
                  {
                    id: 'hi',
                    name: 'हिन्दी (Hindi)',
                    sub: 'South Asian Regional',
                    phrase: '"NABIL का चार्ट दिखाओ।"',
                  },
                ].map((l) => {
                  const isSel = language === l.id;
                  return (
                    <div
                      key={l.id}
                      onClick={() => setLanguage(l.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSel
                          ? 'bg-cyan-950/40 border-cyan-400 text-white shadow-md'
                          : 'bg-[#111726] border-[#1f2b45] text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-sm text-white block">{l.name}</span>
                        <span className="text-[11px] text-slate-400 block font-mono">{l.sub}</span>
                      </div>
                      <div className="mt-3 text-[10px] text-cyan-300 bg-[#0d1322] p-2 rounded-lg font-mono">
                        {l.phrase}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Voice Assistant */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase">
                  <Mic className="w-4 h-4" /> Step 3: Voice & Wake Word
                </div>
                <h3 className="text-lg font-bold text-white">Configure AI Voice Assistant</h3>
                <p className="text-xs text-slate-400 font-mono">
                  Natural, calm speech synthesis and wake word activation.
                </p>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="bg-[#121828] border border-[#1e293b] p-4 rounded-xl space-y-2">
                  <label className="text-slate-300 font-bold block">WAKE WORD</label>
                  <input
                    type="text"
                    value={wakeWord}
                    onChange={(e) => setWakeWord(e.target.value)}
                    className="w-full bg-[#172033] border border-[#25324d] rounded-lg px-3 py-2 text-cyan-300 font-bold tracking-widest text-sm focus:outline-none focus:border-cyan-400"
                  />
                  <p className="text-[10px] text-slate-400">
                    Say <span className="text-white font-bold">"{wakeWord}"</span> to activate Shachina immediately.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      voiceEnabled
                        ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300'
                        : 'bg-[#111726] border-[#1f2b45] text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>Voice Responses</span>
                      <span>{voiceEnabled ? 'ON' : 'OFF'}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 font-sans">
                      Shachina answers verbally with audio speech synthesis.
                    </p>
                  </div>

                  <div
                    onClick={() => setAutoSpeakAlerts(!autoSpeakAlerts)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      autoSpeakAlerts
                        ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300'
                        : 'bg-[#111726] border-[#1f2b45] text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>Auto-Speak Alerts</span>
                      <span>{autoSpeakAlerts ? 'ON' : 'OFF'}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 font-sans">
                      Automatically speaks high-priority setups.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Risk Model */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
                  <ShieldAlert className="w-4 h-4" /> Step 4: Institutional Risk Model
                </div>
                <h3 className="text-lg font-bold text-white">Define Capital & Risk Rules</h3>
                <p className="text-xs text-slate-400 font-mono">
                  Calculates position sizes and stops. Never trades outside configured parameters.
                </p>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="bg-[#121828] border border-[#1e293b] p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-slate-300 font-bold">TOTAL ACCOUNT CAPITAL</label>
                    <span className="text-cyan-400 font-bold">NPR {accountSize.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="100000"
                    max="10000000"
                    step="100000"
                    value={accountSize}
                    onChange={(e) => setAccountSize(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>NPR 100K</span>
                    <span>NPR 1 Crore (10M)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#121828] border border-[#1e293b] p-3.5 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[10px]">MAX RISK PER SETUP</span>
                    <div className="text-base font-bold text-amber-400">{riskPercentage}%</div>
                    <span className="text-[10px] text-slate-400">
                      NPR {((accountSize * riskPercentage) / 100).toLocaleString()} per trade
                    </span>
                  </div>

                  <div className="bg-[#121828] border border-[#1e293b] p-3.5 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[10px]">DAILY LOSS LIMIT</span>
                    <div className="text-base font-bold text-rose-400">{maxDailyLoss}%</div>
                    <span className="text-[10px] text-slate-400">
                      NPR {((accountSize * maxDailyLoss) / 100).toLocaleString()} max daily stop
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-[#1c263d] bg-[#0c101c] flex items-center justify-between font-mono text-xs">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 rounded-xl border border-[#232f48] text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
          ) : (
            <div></div>
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold shadow-lg shadow-cyan-500/25 transition-all flex items-center gap-1.5"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-black tracking-wider shadow-xl shadow-cyan-500/30 transition-all flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              <span>{loading ? 'INITIALIZING...' : 'LAUNCH SHACHINA DASHBOARD'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
