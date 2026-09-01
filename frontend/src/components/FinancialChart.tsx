import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Candle, Timeframe, ChartAnnotations } from '../types';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Sparkles,
  PenTool,
  Trash2,
  TrendingUp,
  Activity,
} from 'lucide-react';

interface FinancialChartProps {
  symbol: string;
  currency: string;
  timeframe: Timeframe;
  candles: Candle[];
  annotations?: ChartAnnotations | null;
  onTimeframeChange: (tf: Timeframe) => void;
  isLoading: boolean;
}

export const FinancialChart: React.FC<FinancialChartProps> = ({
  symbol,
  currency,
  timeframe,
  candles,
  annotations,
  onTimeframeChange,
  isLoading,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [offset, setOffset] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Indicator Toggles
  const [showMa20, setShowMa20] = useState(true);
  const [showMa50, setShowMa50] = useState(true);
  const [showEma9, setShowEma9] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Manual Drawing Tools
  const [drawingTool, setDrawingTool] = useState<'none' | 'hline'>('none');
  const [manualLines, setManualLines] = useState<Array<{ yPrice: number; label: string }>>([]);

  const timeframes: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

  // Moving Averages
  const ma20 = useMemo(() => {
    return candles.map((_, idx, arr) => {
      if (idx < 19) return null;
      const slice = arr.slice(idx - 19, idx + 1);
      return slice.reduce((acc, c) => acc + c.close, 0) / 20;
    });
  }, [candles]);

  const ma50 = useMemo(() => {
    return candles.map((_, idx, arr) => {
      if (idx < 49) return null;
      const slice = arr.slice(idx - 49, idx + 1);
      return slice.reduce((acc, c) => acc + c.close, 0) / 50;
    });
  }, [candles]);

  const ema9 = useMemo(() => {
    if (candles.length < 9) return candles.map(() => null);
    const k = 2 / 10;
    const res: Array<number | null> = Array(8).fill(null);
    let prev = candles.slice(0, 9).reduce((acc, c) => acc + c.close, 0) / 9;
    res.push(prev);
    for (let i = 9; i < candles.length; i++) {
      prev = candles[i].close * k + prev * (1 - k);
      res.push(prev);
    }
    return res;
  }, [candles]);

  // Main Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, width, height);

    // Layout splits
    const volumeHeight = showVolume ? Math.max(50, height * 0.16) : 0;
    const priceChartHeight = height - volumeHeight - 30;
    const rightMargin = 120; // Expanded to fit clear price badges like "ENTRY: NPR 436.58"
    const chartWidth = width - rightMargin;

    // Visible candle window
    const visibleCount = Math.max(15, Math.min(candles.length, Math.floor(candles.length / zoomLevel)));
    const startIndex = Math.max(0, candles.length - visibleCount - offset);
    const visibleCandles = candles.slice(startIndex, startIndex + visibleCount);
    const visibleMa20 = ma20.slice(startIndex, startIndex + visibleCount);
    const visibleMa50 = ma50.slice(startIndex, startIndex + visibleCount);
    const visibleEma9 = ema9.slice(startIndex, startIndex + visibleCount);

    if (visibleCandles.length === 0) return;

    // Price Bounds
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    visibleCandles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    // Expand bounds if annotations exist
    if (showAnnotations && annotations) {
      if (annotations.entry_line) {
        minPrice = Math.min(minPrice, annotations.entry_line.price);
        maxPrice = Math.max(maxPrice, annotations.entry_line.price);
      }
      if (annotations.stop_loss_line) {
        minPrice = Math.min(minPrice, annotations.stop_loss_line.price);
        maxPrice = Math.max(maxPrice, annotations.stop_loss_line.price);
      }
      annotations.target_lines?.forEach((t) => {
        minPrice = Math.min(minPrice, t.price);
        maxPrice = Math.max(maxPrice, t.price);
      });
      annotations.zones?.forEach((z) => {
        minPrice = Math.min(minPrice, z.bottom);
        maxPrice = Math.max(maxPrice, z.top);
      });
    }

    const priceBuffer = (maxPrice - minPrice) * 0.08 || 1;
    minPrice -= priceBuffer;
    maxPrice += priceBuffer;
    const priceRange = maxPrice - minPrice;

    const getY = (price: number) => {
      return priceChartHeight - ((price - minPrice) / priceRange) * priceChartHeight;
    };

    const candleSpacing = chartWidth / visibleCandles.length;
    const candleWidth = Math.max(3, candleSpacing * 0.72);

    // ── 1. Grid & Price Axis ──────────────────────────────────────────────────
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;

    const gridSteps = 6;
    for (let i = 0; i <= gridSteps; i++) {
      const price = minPrice + (priceRange / gridSteps) * i;
      const y = getY(price);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`NPR ${price.toFixed(2)}`, chartWidth + 8, y + 4);
    }

    // ── 2. Shachina Programmatic Zones (FVG, Order Block, Supply, Demand) ─────
    if (showAnnotations && annotations?.zones) {
      annotations.zones.forEach((z) => {
        const yTop = getY(z.top);
        const yBottom = getY(z.bottom);
        const zHeight = Math.abs(yBottom - yTop);

        if (z.type === 'ORDER_BLOCK') {
          ctx.fillStyle = z.label.toLowerCase().includes('bullish')
            ? 'rgba(16, 185, 129, 0.14)'
            : 'rgba(239, 68, 68, 0.14)';
        } else if (z.type === 'FVG') {
          ctx.fillStyle = z.label.toLowerCase().includes('bullish')
            ? 'rgba(6, 182, 212, 0.14)'
            : 'rgba(244, 63, 94, 0.14)';
        } else if (z.type === 'SUPPLY') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
        } else if (z.type === 'DEMAND') {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
        } else {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
        }

        ctx.fillRect(0, Math.min(yTop, yBottom), chartWidth, Math.max(zHeight, 4));

        ctx.fillStyle = z.type === 'SUPPLY' || z.label.toLowerCase().includes('bearish') ? '#f87171' : '#34d399';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(`■ ${z.label}`, 12, Math.min(yTop, yBottom) + 12);
      });
    }

    // ── 3. Fibonacci Grid ─────────────────────────────────────────────────────
    if (showAnnotations && annotations?.fibonacci_levels) {
      annotations.fibonacci_levels.forEach((fib) => {
        const y = getY(fib.price);
        if (y >= 0 && y <= priceChartHeight) {
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
          ctx.moveTo(0, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#f59e0b';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillText(`Fib ${fib.label} (${fib.price.toFixed(1)})`, 8, y - 3);
        }
      });
    }

    // ── 4. Candlesticks (Ultra-clear bodies & wicks) ───────────────────────────
    visibleCandles.forEach((c, idx) => {
      const x = idx * candleSpacing + candleSpacing / 2;
      const openY = getY(c.open);
      const closeY = getY(c.close);
      const highY = getY(c.high);
      const lowY = getY(c.low);

      const isBull = c.close >= c.open;
      const color = isBull ? '#10b981' : '#ef4444';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
      ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
    });

    // ── 5. Candlestick Pattern Badges (Clean, non-overlapping) ────────────────
    if (showAnnotations && annotations?.patterns) {
      annotations.patterns.slice(-4).forEach((pb) => {
        const relIdx = pb.candle_index - startIndex;
        if (relIdx >= 0 && relIdx < visibleCandles.length) {
          const x = relIdx * candleSpacing + candleSpacing / 2;
          const c = visibleCandles[relIdx];
          const isBull = pb.direction === 'BULLISH';
          const badgeY = isBull ? getY(c.low) + 18 : getY(c.high) - 14;

          ctx.fillStyle = isBull ? 'rgba(6, 78, 59, 0.9)' : 'rgba(127, 29, 29, 0.9)';
          ctx.strokeStyle = isBull ? '#10b981' : '#ef4444';
          ctx.lineWidth = 1;

          const label = pb.pattern;
          const textWidth = ctx.measureText(label).width + 10;
          ctx.beginPath();
          ctx.roundRect(x - textWidth / 2, badgeY - 8, textWidth, 16, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(label, x, badgeY + 3);
          ctx.textAlign = 'left';
        }
      });
    }

    // ── 6. Moving Averages ────────────────────────────────────────────────────
    const drawLineSeries = (data: Array<number | null>, color: string, width = 1.5) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      let first = true;
      data.forEach((val, idx) => {
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
    };

    if (showMa20) drawLineSeries(visibleMa20, '#06b6d4', 1.5);
    if (showMa50) drawLineSeries(visibleMa50, '#f59e0b', 1.5);
    if (showEma9) drawLineSeries(visibleEma9, '#a855f7', 1.5);

    // ── 7. Programmatic Horizontal Execution Levels with Exact Prices ─────────
    if (showAnnotations && annotations) {
      // Support lines
      annotations.support_lines?.forEach((sl) => {
        const y = getY(sl.price);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = sl.color || '#10b981';
        ctx.lineWidth = 1.2;
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(`SUP: NPR ${sl.price.toFixed(2)}`, chartWidth + 6, y + 3);
      });

      // Resistance lines
      annotations.resistance_lines?.forEach((rl) => {
        const y = getY(rl.price);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = rl.color || '#ef4444';
        ctx.lineWidth = 1.2;
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(`RES: NPR ${rl.price.toFixed(2)}`, chartWidth + 6, y + 3);
      });

      // ENTRY LINE: Glowing Cyan level with exact price
      if (annotations.entry_line) {
        const y = getY(annotations.entry_line.price);
        ctx.beginPath();
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2.2;
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();

        ctx.fillStyle = '#00f2fe';
        ctx.fillRect(chartWidth + 2, y - 9, 115, 18);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(`ENTRY: NPR ${annotations.entry_line.price.toFixed(2)}`, chartWidth + 6, y + 3);
      }

      // STOP LOSS LINE: Crimson level with exact price
      if (annotations.stop_loss_line) {
        const y = getY(annotations.stop_loss_line.price);
        ctx.beginPath();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.2;
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();

        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(chartWidth + 2, y - 9, 115, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(`SL: NPR ${annotations.stop_loss_line.price.toFixed(2)}`, chartWidth + 6, y + 3);
      }

      // TARGET LINES: TP1, TP2, TP3 with exact prices
      annotations.target_lines?.forEach((t, i) => {
        const y = getY(t.price);
        ctx.beginPath();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.8;
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();

        ctx.fillStyle = i === 0 ? '#10b981' : i === 1 ? '#34d399' : '#6ee7b7';
        ctx.fillRect(chartWidth + 2, y - 9, 115, 18);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(`TP${i + 1}: NPR ${t.price.toFixed(2)}`, chartWidth + 6, y + 3);
      });
    }

    // ── 8. Manual Drawing Lines ───────────────────────────────────────────────
    manualLines.forEach((ml) => {
      const y = getY(ml.yPrice);
      ctx.beginPath();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText(ml.label, 10, y - 4);
    });

    // ── 9. Volume Subchart ────────────────────────────────────────────────────
    if (showVolume) {
      const volTop = priceChartHeight + 8;
      visibleCandles.forEach((c, idx) => {
        const x = idx * candleSpacing + candleSpacing / 2;
        const vRatio = maxVolume > 0 ? c.volume / maxVolume : 0;
        const vHeight = vRatio * (volumeHeight - 12);
        const vY = volTop + (volumeHeight - 12) - vHeight;

        ctx.fillStyle = c.is_bullish ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
        ctx.fillRect(x - candleWidth / 2, vY, candleWidth, vHeight);
      });

      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(`VOL: ${maxVolume.toLocaleString()}`, 8, volTop + 14);
    }

    // ── 10. Crosshair ─────────────────────────────────────────────────────────
    if (crosshairPos && crosshairPos.x < chartWidth && crosshairPos.y < priceChartHeight) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(crosshairPos.x, 0);
      ctx.lineTo(crosshairPos.x, priceChartHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, crosshairPos.y);
      ctx.lineTo(chartWidth, crosshairPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [
    candles,
    zoomLevel,
    offset,
    showMa20,
    showMa50,
    showEma9,
    showVolume,
    showAnnotations,
    annotations,
    manualLines,
    crosshairPos,
  ]);

  // Mouse Handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCrosshairPos({ x, y });

    const rightMargin = 120;
    const chartWidth = rect.width - rightMargin;
    const visibleCount = Math.max(15, Math.min(candles.length, Math.floor(candles.length / zoomLevel)));
    const startIndex = Math.max(0, candles.length - visibleCount - offset);
    const candleSpacing = chartWidth / visibleCount;
    const hoveredIdx = Math.floor(x / candleSpacing);

    if (hoveredIdx >= 0 && hoveredIdx < visibleCount) {
      setHoveredCandle(candles[startIndex + hoveredIdx] || null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawingTool === 'hline' && crosshairPos && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const priceChartHeight = rect.height * 0.75;
      const minPrice = Math.min(...candles.map((c) => c.low));
      const maxPrice = Math.max(...candles.map((c) => c.high));
      const clickedPrice = maxPrice - (crosshairPos.y / priceChartHeight) * (maxPrice - minPrice);
      setManualLines((prev) => [
        ...prev,
        { yPrice: clickedPrice, label: `Line @ NPR ${clickedPrice.toFixed(2)}` },
      ]);
      setDrawingTool('none');
    }
  };

  const latestCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const priceChange = latestCandle && prevCandle ? latestCandle.close - prevCandle.close : 0;
  const pctChange = prevCandle ? (priceChange / prevCandle.close) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-[#070b14] border border-[#1a2337] rounded-xl overflow-hidden shadow-2xl relative ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'w-full h-full'
      }`}
    >
      {/* ── Top Bar: Symbol Stats, Market Regime & Timeframes ──────────────── */}
      <div className="p-2.5 bg-[#050810] border-b border-[#161f33] flex flex-wrap items-center justify-between gap-2 text-xs font-mono select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-sm text-cyan-300 tracking-wide">{symbol}</span>
            <span className="text-[10px] text-slate-400">({currency})</span>
          </div>

          {latestCandle && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-white">LTP: NPR {latestCandle.close.toFixed(2)}</span>
              <span
                className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                  priceChange >= 0 ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                }`}
              >
                {priceChange >= 0 ? '+' : ''}
                {priceChange.toFixed(2)} ({pctChange.toFixed(2)}%)
              </span>
            </div>
          )}

          {/* Shachina Drawing Badge */}
          {annotations && (
            <span className="flex items-center gap-1 text-[10px] bg-cyan-950/90 text-cyan-300 border border-cyan-600/70 px-2 py-0.5 rounded-full font-bold">
              <Sparkles className="w-3 h-3 text-cyan-400 animate-spin" />
              Shachina Drawn
            </span>
          )}
        </div>

        {/* Timeframe Switcher */}
        <div className="flex items-center bg-[#090d18] rounded-lg p-0.5 border border-[#1e293b]">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                timeframe === tf
                  ? 'bg-cyan-500 text-black font-extrabold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Indicator & Tools Toolbar */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 border transition-all ${
              showAnnotations
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                : 'border-slate-800 text-slate-500'
            }`}
            title="Toggle Shachina AI Analysis overlay"
          >
            <Sparkles className="w-3 h-3" />
            AI Overlay
          </button>

          <button
            onClick={() => setShowMa20(!showMa20)}
            className={`px-1.5 py-1 rounded text-[10px] font-bold border transition-all ${
              showMa20 ? 'bg-cyan-950 border-cyan-500 text-cyan-400' : 'border-slate-800 text-slate-500'
            }`}
          >
            MA20
          </button>
          <button
            onClick={() => setShowMa50(!showMa50)}
            className={`px-1.5 py-1 rounded text-[10px] font-bold border transition-all ${
              showMa50 ? 'bg-amber-950 border-amber-500 text-amber-400' : 'border-slate-800 text-slate-500'
            }`}
          >
            MA50
          </button>
          <button
            onClick={() => setShowEma9(!showEma9)}
            className={`px-1.5 py-1 rounded text-[10px] font-bold border transition-all ${
              showEma9 ? 'bg-purple-950 border-purple-500 text-purple-400' : 'border-slate-800 text-slate-500'
            }`}
          >
            EMA9
          </button>

          {/* Manual Drawing Tool Button */}
          <button
            onClick={() => setDrawingTool(drawingTool === 'hline' ? 'none' : 'hline')}
            className={`p-1 rounded text-[10px] border transition-all ${
              drawingTool === 'hline'
                ? 'bg-amber-500 text-black border-amber-400'
                : 'border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Draw Horizontal Support/Resistance Line"
          >
            <PenTool className="w-3.5 h-3.5" />
          </button>

          {manualLines.length > 0 && (
            <button
              onClick={() => setManualLines([])}
              className="p-1 rounded text-[10px] border border-slate-800 text-slate-400 hover:text-rose-400"
              title="Clear manual lines"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded border border-slate-800 text-slate-400 hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Active Candle Bar stats on hover ──────────────────────────────── */}
      {hoveredCandle && (
        <div className="px-3 py-1 bg-[#04060c] text-[11px] font-mono text-slate-400 flex items-center gap-4 border-b border-[#141c2e]">
          <span>O: <strong className="text-white">{hoveredCandle.open.toFixed(2)}</strong></span>
          <span>H: <strong className="text-white">{hoveredCandle.high.toFixed(2)}</strong></span>
          <span>L: <strong className="text-white">{hoveredCandle.low.toFixed(2)}</strong></span>
          <span>C: <strong className={hoveredCandle.is_bullish ? 'text-emerald-400' : 'text-rose-400'}>{hoveredCandle.close.toFixed(2)}</strong></span>
          <span>Vol: <strong className="text-white">{hoveredCandle.volume.toLocaleString()}</strong></span>
        </div>
      )}

      {/* ── Main Canvas Viewport ───────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10 font-mono text-xs text-cyan-400">
            <span className="animate-spin mr-2">⚡</span> Fetching real market candles...
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setCrosshairPos(null);
            setHoveredCandle(null);
          }}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-crosshair block"
        />
      </div>

      {/* ── Zoom Controls Footer ───────────────────────────────────────────── */}
      <div className="p-1.5 bg-[#050810] border-t border-[#161f33] flex items-center justify-between text-[10px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span>Candles: {candles.length}</span>
          <span>•</span>
          <span>Timezone: Asia/Kathmandu (NPT)</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomLevel((z) => Math.min(z + 0.3, 3))}
            className="p-1 rounded hover:bg-slate-800 text-slate-300"
            title="Zoom in"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(z - 0.3, 0.5))}
            className="p-1 rounded hover:bg-slate-800 text-slate-300"
            title="Zoom out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              setZoomLevel(1);
              setOffset(0);
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-300"
            title="Reset view"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
