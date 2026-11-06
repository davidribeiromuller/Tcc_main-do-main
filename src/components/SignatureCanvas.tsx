import React, { useRef, useEffect, useState, useCallback } from "react";
import { RotateCcw, PenTool, CheckCircle2 } from "lucide-react";

interface SignatureCanvasProps {
  onSignatureChange: (dataUrl: string | null, hasStrokes: boolean) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  onSignatureChange,
  width = 540,
  height = 180,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Synchronize canvas coordinate resolution with devicePixelRatio for ultra-sharp strokes
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(280, rect.width || width);
    const displayHeight = height;

    // Check if dimensions changed significantly
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      // Save current image before resizing if any strokes exist
      let savedData: ImageData | null = null;
      const ctx = canvas.getContext("2d");
      if (ctx && hasStrokes) {
        try {
          savedData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch {}
      }

      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#122a1e"; // Deep authentic institutional green-slate ink

        if (savedData) {
          try {
            ctx.putImageData(savedData, 0, 0);
          } catch {}
        }
      }
    }
  }, [width, height, hasStrokes]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // Get pointer coordinates relative to canvas
  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Capture pointer to track gestures even if finger/stylus leaves canvas boundary
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

    const coords = getCoordinates(e);
    lastPointRef.current = coords;
    setIsDrawing(true);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
      // Create an immediate small dot for taps
      ctx.arc(coords.x, coords.y, 1.25, 0, Math.PI * 2);
      ctx.fillStyle = "#122a1e";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const lastPoint = lastPointRef.current;
    if (!canvas || !ctx || !lastPoint) return;

    const currentPoint = getCoordinates(e);

    // Quadratic curve for fluid and natural signature strokes
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    const midPointX = (lastPoint.x + currentPoint.x) / 2;
    const midPointY = (lastPoint.y + currentPoint.y) / 2;
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midPointX, midPointY);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();

    lastPointRef.current = currentPoint;

    if (!hasStrokes) {
      setHasStrokes(true);
      setStrokeCount((c) => c + 1);
    }
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}

      // Emit signature dataURL
      const dataUrl = canvas.toDataURL("image/png");
      setHasStrokes(true);
      setStrokeCount((c) => c + 1);
      onSignatureChange(dataUrl, true);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasStrokes(false);
    setStrokeCount(0);
    lastPointRef.current = null;
    onSignatureChange(null, false);
  };

  return (
    <div className="w-full flex flex-col gap-2" ref={containerRef}>
      <div className="flex items-center justify-between text-xs font-medium text-emerald-900/80 dark:text-emerald-300">
        <div className="flex items-center gap-1.5">
          <PenTool size={14} className="text-emerald-600 dark:text-emerald-400" />
          <span>Assinatura Digital do Responsável Legal (Toque, Caneta ou Mouse)</span>
        </div>
        {hasStrokes && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 size={12} />
            Assinatura traçada
          </span>
        )}
      </div>

      <div
        className={`relative w-full rounded-2xl bg-white dark:bg-slate-900 border-2 transition-all overflow-hidden ${
          disabled
            ? "opacity-60 bg-slate-50 cursor-not-allowed border-slate-200"
            : hasStrokes
            ? "border-emerald-500 shadow-sm shadow-emerald-500/10"
            : "border-slate-300 dark:border-slate-700 hover:border-emerald-400"
        }`}
        style={{ height: `${height}px` }}
      >
        {/* Canvas element with touch-action: none to strictly prevent scroll during finger drawing */}
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          className="w-full h-full cursor-crosshair select-none block"
          style={{ touchAction: "none" }}
          aria-label="Campo de assinatura manuscrita do responsável legal"
        />

        {/* Visual guideline line */}
        <div className="absolute left-6 right-6 bottom-8 border-b border-dashed border-slate-300 dark:border-slate-700 pointer-events-none flex items-center justify-between">
          <span className="text-[10px] text-slate-400 select-none pb-0.5">✕ Assine acima desta linha</span>
          <span className="text-[10px] text-slate-400 select-none pb-0.5">Responsável Legal</span>
        </div>

        {/* Placeholder helper text if empty */}
        {!hasStrokes && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-normal select-none">
              Desenhe a sua assinatura aqui com o dedo, caneta ou cursor
            </p>
          </div>
        )}

        {/* Clear Button */}
        {hasStrokes && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 right-2 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/90 dark:bg-slate-800/90 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer z-10"
            title="Limpar assinatura e refazer"
          >
            <RotateCcw size={12} />
            <span>Limpar</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
        <span>Válido conforme LGPD (Art. 14) e termo de autorização escolar</span>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasStrokes || disabled}
          className="text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-30 disabled:no-underline cursor-pointer"
        >
          Refazer traço
        </button>
      </div>
    </div>
  );
};

export default SignatureCanvas;
