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
  // Returns the signature as a base64 PNG data URL with a transparent
  // background. The contract template renders this directly via <img src>.
  onConfirm: (dataUrl: string) => void;
  // Pre-filled typed name shown as a hint under the canvas — purely
  // informational; it isn't drawn onto the signature.
  typedName?: string;
}

// Click-toggle signature pad. The user clicks once to start capturing
// mouse movement, then clicks again to stop — no drag/hold required. This
// matches the requested UX: "no need to hold and drag just click and move
// the box. Once the mouse is clicked again the signature ends."
// Multiple strokes are supported (each click starts a new one).
export function SignaturePad({
  open,
  onOpenChange,
  onConfirm,
  typedName,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // Resize the canvas backing store to match its CSS size × devicePixelRatio
  // so strokes stay crisp on HiDPI displays. Called once on mount and when
  // the dialog opens/closes.
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
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#000000';
    };
    // Defer one tick so the dialog has rendered and the canvas has a layout
    // size to measure.
    const t = setTimeout(resize, 0);
    return () => clearTimeout(t);
  }, [open]);

  // Reset state every time the dialog is opened so a previous abandoned
  // attempt doesn't bleed into the next session.
  useEffect(() => {
    if (open) {
      drawingRef.current = false;
      lastPointRef.current = null;
      setHasInk(false);
      setIsDrawing(false);
    }
  }, [open]);

  const getPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getPoint(e);
    if (!pt) return;
    if (drawingRef.current) {
      // Second click ends the current stroke.
      drawingRef.current = false;
      lastPointRef.current = null;
      setIsDrawing(false);
    } else {
      // First click begins a new stroke. Drop a small dot at the click so a
      // single click still leaves a visible mark.
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
      }
      drawingRef.current = true;
      lastPointRef.current = pt;
      setIsDrawing(true);
      setHasInk(true);
    }
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    if (!hasInk) setHasInk(true);
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
    setHasInk(false);
    setIsDrawing(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const dataUrl = canvas.toDataURL('image/png');
    onConfirm(dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Draw your signature</DialogTitle>
          <DialogDescription>
            Click once inside the box to start, move your mouse to draw, then
            click again to finish. You can sign in multiple strokes — each
            click starts a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border-2 border-dashed border-muted-foreground/30 bg-white p-2">
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            onMouseMove={handleMove}
            className="block w-full h-64 cursor-crosshair bg-white rounded-sm"
            style={{ touchAction: 'none' }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isDrawing
              ? '✏️ Drawing — click again to end this stroke'
              : hasInk
                ? 'Click inside the box to add another stroke, or confirm below.'
                : 'Click inside the white box to begin.'}
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
