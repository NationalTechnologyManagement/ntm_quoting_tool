import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, Check, X } from 'lucide-react';

interface SignaturePadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Returns the signature as a base64 PNG data URL cropped tightly to the
  // ink bounding box (with a small breathing margin). The contract template
  // renders this directly via <img src>.
  onConfirm: (dataUrl: string) => void;
  // Pre-filled typed name shown as a hint under the canvas — purely
  // informational; it isn't drawn onto the signature.
  typedName?: string;
}

// Hold-drag-release signature pad. Standard mousedown-drag-mouseup UX (also
// works with touch + pen via Pointer Events). On confirm, we crop the
// exported PNG to the inked bounding box so the saved signature centers
// nicely in previews and on the contract PDF instead of floating inside a
// huge white field.
export function SignaturePad({
  open,
  onOpenChange,
  onConfirm,
  typedName,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // CSS-pixel bounding box of all inked strokes. Used to crop the exported
  // PNG so it doesn't include the empty whitespace around the signature.
  const boundsRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Resize the canvas backing store to match its CSS size × devicePixelRatio
  // so strokes stay crisp on HiDPI displays. Re-run when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#000000';
    };
    // Defer one tick so the dialog has rendered and the canvas has a layout
    // size to measure.
    const t = setTimeout(resize, 0);
    return () => clearTimeout(t);
  }, [open]);

  // Reset every time the dialog opens so an abandoned attempt doesn't bleed
  // into the next session.
  useEffect(() => {
    if (open) {
      drawingRef.current = false;
      lastPointRef.current = null;
      boundsRef.current = null;
      setHasInk(false);
    }
  }, [open]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const extendBounds = (x: number, y: number) => {
    const b = boundsRef.current;
    if (!b) {
      boundsRef.current = { minX: x, minY: y, maxX: x, maxY: y };
      return;
    }
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getPoint(e);
    const canvas = canvasRef.current;
    if (!pt || !canvas) return;
    // Capture so we keep getting events even if the pointer leaves the
    // canvas mid-stroke — important for a fast signature flick.
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pt;
    extendBounds(pt.x, pt.y);
    // Drop a tiny dot so a tap (no drag) still leaves a visible mark.
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
    }
    if (!hasInk) setHasInk(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pt = getPoint(e);
    const last = lastPointRef.current;
    const ctx = canvasRef.current?.getContext('2d');
    if (!pt || !last || !ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
    extendBounds(pt.x, pt.y);
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawingRef.current = false;
    lastPointRef.current = null;
    boundsRef.current = null;
    setHasInk(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    const b = boundsRef.current;
    if (!canvas || !hasInk || !b) return;
    const dpr = window.devicePixelRatio || 1;
    const padding = 12; // CSS px of breathing room around the strokes
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;
    const minX = Math.max(0, b.minX - padding);
    const minY = Math.max(0, b.minY - padding);
    const maxX = Math.min(cssWidth, b.maxX + padding);
    const maxY = Math.min(cssHeight, b.maxY + padding);
    const cropW = Math.max(1, maxX - minX);
    const cropH = Math.max(1, maxY - minY);
    // Build a fresh canvas sized to the cropped region (in device pixels)
    // and copy just the inked area. Result is a tight PNG that drops into
    // any container without floating off-center.
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cropW * dpr));
    out.height = Math.max(1, Math.round(cropH * dpr));
    const outCtx = out.getContext('2d');
    if (!outCtx) return;
    outCtx.drawImage(
      canvas,
      Math.round(minX * dpr),
      Math.round(minY * dpr),
      Math.round(cropW * dpr),
      Math.round(cropH * dpr),
      0,
      0,
      out.width,
      out.height,
    );
    const dataUrl = out.toDataURL('image/png');
    onConfirm(dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Draw your signature</DialogTitle>
          <DialogDescription>
            Press and hold the mouse button, drag to sign, then release to
            finish. You can sign in multiple strokes — just press, drag, and
            release again.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border-2 border-dashed border-muted-foreground/30 bg-white p-2">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={endStroke}
            className="block w-full h-64 cursor-crosshair bg-white rounded-sm"
            style={{ touchAction: 'none' }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {hasInk
              ? 'Looking good — sign again to add another stroke, or confirm below.'
              : 'Click and hold inside the white box, then drag to sign.'}
          </span>
          {typedName ? <span className="italic">For: {typedName}</span> : null}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={!hasInk}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Redo
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={!hasInk}>
              <Check className="w-4 h-4 mr-2" />
              Confirm Signature
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
