import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Candle, Timeframe } from '../types';
import { ZoomIn, ZoomOut, RotateCcw, Eye, Sliders, Layers } from 'lucide-react';

interface FinancialChartProps {
  symbol: string;
  currency: string;
  timeframe: Timeframe;
  candles: Candle[];
  onTimeframeChange: (tf: Timeframe) => void;
  isLoading: boolean;
}

export const FinancialChart: React.FC<FinancialChartProps> = ({
  symbol,
  currency,
  timeframe,
  candles,
  onTimeframeChange,
  isLoading,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  const [showMa20, setShowMa20] = useState(true);
  const [showMa50, setShowMa50] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [offset, setOffset] = useState(0);

  const timeframes: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

  // Calculate Moving Averages
  const ma20 = useMemo(() => {
    return candles.map((_, idx, arr) => {
      if (idx < 19) return null;
      const slice = arr.slice(idx - 19, idx + 1);
      const sum = slice.reduce((acc, c) => acc + c.close, 0);
      return sum / 20;
    });
  }, [candles]);

  const ma50 = useMemo(() => {
    return candles.map((_, idx, arr) => {
      if (idx < 49) return null;
      const slice = arr.slice(idx - 49, idx + 1);
      const sum = slice.reduce((acc, c) => acc + c.close, 0);
      return sum / 50;
    });
  }, [candles]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize for device pixel ratio
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Padding & Area splits
    const priceChartHeight = height * 0.76;
    const volumeChartHeight = height * 0.18;
    const volumeTop = priceChartHeight + 10;
    const rightMargin = 75; // for price axis
    const bottomMargin = 25; // for time axis
    const chartWidth = width - rightMargin;

    // Visible candles based on zoom & offset
    const visibleCount = Math.max(15, Math.min(candles.length, Math.floor(candles.length / zoomLevel)));
    const startIndex = Math.max(0, candles.length - visibleCount - offset);
    const visibleCandles = candles.slice(startIndex, startIndex + visibleCount);
    const visibleMa20 = ma20.slice(startIndex, startIndex + visibleCount);
    const visibleMa50 = ma50.slice(startIndex, startIndex + visibleCount);

    if (visibleCandles.length === 0) return;

    // Calculate Min & Max for Price and Volume
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    visibleCandles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    const priceBuffer = (maxPrice - minPrice) * 0.08 || 1;
    minPrice -= priceBuffer;
    maxPrice += priceBuffer;
    const priceRange = maxPrice - minPrice;

    // Helper conversion functions
    const getY = (price: number) => {
      return priceChartHeight - ((price - minPrice) / priceRange) * priceChartHeight;
    };

    const getVolumeY = (vol: number) => {
      const vRatio = maxVolume > 0 ? vol / maxVolume : 0;
      return height - bottomMargin - vRatio * (volumeChartHeight - 5);
    };

    const candleWidth = Math.max(2, (chartWidth / visibleCandles.length) * 0.7);
    const candleSpacing = chartWidth / visibleCandles.length;

    // 1. Draw Grid Lines
    ctx.strokeStyle = '#141c2e';
    ctx.lineWidth = 1;

    // Horizontal Price Grid Lines
    const gridSteps = 6;
    for (let i = 0; i <= gridSteps; i++) {
      const price = minPrice + (priceRange / gridSteps) * i;
      const y = getY(price);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Price Axis Text
      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(2), chartWidth + 8, y + 3);
    }

    // 2. Draw Volume Bars
    visibleCandles.forEach((c, idx) => {
      const x = idx * candleSpacing + candleSpacing / 2;
      const volY = getVolumeY(c.volume);
      const volHeight = height - bottomMargin - volY;

      ctx.fillStyle = c.is_bullish ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(x - candleWidth / 2, volY, candleWidth, volHeight);
    });

    // 3. Draw Moving Averages
    if (showMa20) {
      ctx.beginPath();
      ctx.strokeStyle = '#06b6d4'; // Cyan MA20
      ctx.lineWidth = 1.5;
      let first = true;
      visibleMa20.forEach((val, idx) => {
        if (val !== null) {
          const x = idx * candleSpacing + candleSpacing / 2;
          const y = getY(val);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    if (showMa50) {
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b'; // Gold MA50
      ctx.lineWidth = 1.5;
      let first = true;
      visibleMa50.forEach((val, idx) => {
        if (val !== null) {
          const x = idx * candleSpacing + candleSpacing / 2;
          const y = getY(val);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    // 4. Draw Candlesticks (Wicks and Bodies)
    visibleCandles.forEach((c, idx) => {
      const x = idx * candleSpacing + candleSpacing / 2;
      const openY = getY(c.open);
      const closeY = getY(c.close);
      const highY = getY(c.high);
      const lowY = getY(c.low);

      const isBull = c.close >= c.open;
      const color = isBull ? '#10b981' : '#ef4444'; // Emerald / Red

      // Draw Wicks
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Draw Body
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));

      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // 5. Draw Crosshair if active
    if (crosshairPos && crosshairPos.x < chartWidth && crosshairPos.y < height - bottomMargin) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(crosshairPos.x, 0);
      ctx.lineTo(crosshairPos.x, height - bottomMargin);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, crosshairPos.y);
      ctx.lineTo(chartWidth, crosshairPos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current Crosshair Price Pill
      if (crosshairPos.y <= priceChartHeight) {
        const hoverPrice = maxPrice - (crosshairPos.y / priceChartHeight) * priceRange;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(chartWidth + 2, crosshairPos.y - 10, rightMargin - 4, 20);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.fillText(hoverPrice.toFixed(2), chartWidth + 8, crosshairPos.y + 4);
      }
    }
  }, [candles, zoomLevel, offset, crosshairPos, showMa20, showMa50, ma20, ma50]);

  // Mouse Move for Crosshair & HUD
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCrosshairPos({ x, y });

    const chartWidth = rect.width - 75;
    const visibleCount = Math.max(15, Math.min(candles.length, Math.floor(candles.length / zoomLevel)));
    const startIndex = Math.max(0, candles.length - visibleCount - offset);
    const visibleCandles = candles.slice(startIndex, startIndex + visibleCount);

    const candleSpacing = chartWidth / visibleCandles.length;
    const hoverIdx = Math.floor(x / candleSpacing);

    if (hoverIdx >= 0 && hoverIdx < visibleCandles.length) {
      setHoveredCandle(visibleCandles[hoverIdx]);
    } else {
      setHoveredCandle(null);
    }
  };

  const handleMouseLeave = () => {
    setCrosshairPos(null);
    setHoveredCandle(null);
  };

  const activeCandle = hoveredCandle || candles[candles.length - 1];
  const priceChange = activeCandle ? activeCandle.close - activeCandle.open : 0;
  const priceChangePct = activeCandle && activeCandle.open > 0 ? (priceChange / activeCandle.open) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0d16] border border-[#1c2438] rounded-xl overflow-hidden shadow-2xl">
      {/* Top Chart Toolbar & HUD */}
      <div className="h-12 border-b border-[#1c2438] bg-[#0f1424] px-4 flex items-center justify-between text-xs select-none">
        {/* Symbol Title & Active Candlestick Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white text-sm tracking-wide font-mono">{symbol}</span>
            <span className="text-[10px] text-slate-400 bg-[#172033] px-1.5 py-0.5 rounded font-mono font-medium">
              {currency}
            </span>
          </div>

          {activeCandle && (
            <div className="hidden sm:flex items-center gap-3 font-mono text-[11px]">
              <div>
                <span className="text-slate-500 mr-1">O</span>
                <span className="text-slate-200 font-semibold">{activeCandle.open.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">H</span>
                <span className="text-emerald-400 font-semibold">{activeCandle.high.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">L</span>
                <span className="text-rose-400 font-semibold">{activeCandle.low.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">C</span>
                <span className={priceChange >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {activeCandle.close.toFixed(2)}
                </span>
              </div>
              <div className={priceChange >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%)
              </div>
              <div>
                <span className="text-slate-500 mr-1">Vol</span>
                <span className="text-cyan-300 font-medium">{activeCandle.volume.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Timeframe Selector & Chart Controls */}
        <div className="flex items-center gap-2">
          {/* Indicators Toggle */}
          <div className="flex items-center gap-1 bg-[#172033] p-0.5 rounded-lg border border-[#232f48]">
            <button
              onClick={() => setShowMa20(!showMa20)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-colors ${
                showMa20 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              MA20
            </button>
            <button
              onClick={() => setShowMa50(!showMa50)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-colors ${
                showMa50 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              MA50
            </button>
          </div>

          {/* Timeframe Buttons */}
          <div className="flex items-center bg-[#172033] p-0.5 rounded-lg border border-[#232f48]">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all ${
                  timeframe === tf
                    ? 'bg-cyan-500 text-black shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoomLevel((prev) => Math.min(3, prev + 0.25))}
              className="p-1 rounded bg-[#172033] hover:bg-[#232f48] text-slate-300 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel((prev) => Math.max(0.5, prev - 0.25))}
              className="p-1 rounded bg-[#172033] hover:bg-[#232f48] text-slate-300 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setZoomLevel(1);
                setOffset(0);
              }}
              className="p-1 rounded bg-[#172033] hover:bg-[#232f48] text-slate-300 transition-colors"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div ref={containerRef} className="flex-1 relative w-full h-full min-h-[350px]">
        {isLoading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex items-center justify-center">
            <div className="flex items-center gap-3 bg-[#111827] border border-cyan-500/30 px-4 py-2.5 rounded-xl shadow-2xl">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-mono text-cyan-300 font-semibold">Validating Market Feed...</span>
            </div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full cursor-crosshair block"
        />
      </div>
    </div>
  );
};
