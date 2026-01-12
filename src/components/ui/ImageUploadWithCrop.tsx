import { useState, useRef, useEffect } from 'react';
import { Upload, X, Move, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { Button } from './Button';

interface ImageUploadWithCropProps {
  label?: string;
  onFileSelect: (file: File) => void;
  preview?: string | null;
  maxSize?: number;
}

export function ImageUploadWithCrop({
  label,
  onFileSelect,
  preview,
  maxSize = 5 * 1024 * 1024,
}: ImageUploadWithCropProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(preview || null);
  const [isDragging, setIsDragging] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (preview) {
      setImagePreview(preview);
    }
  }, [preview]);

  const handleFileChange = (file: File | null) => {
    if (!file) return;

    if (file.size > maxSize) {
      alert(`Arquivo muito grande. Tamanho máximo: ${maxSize / 1024 / 1024}MB`);
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileChange(file);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imagePreview) return;
    setIsDraggingImage(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingImage) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDraggingImage(false);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.1, 0.5));
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleRemove = () => {
    setImagePreview(null);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}

      <div
        className={`relative border-2 border-dashed rounded-xl overflow-hidden transition ${
          isDragging ? 'border-[#0B4F8A] bg-blue-50' : 'border-slate-300'
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
      >
        {imagePreview ? (
          <div
            className="relative w-full h-64 bg-slate-100 overflow-hidden cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              ref={imageRef}
              src={imagePreview}
              alt="Preview"
              className="absolute top-1/2 left-1/2 max-w-none select-none"
              style={{
                transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${scale})`,
                cursor: isDraggingImage ? 'grabbing' : 'grab',
              }}
              draggable={false}
            />

            <div className="absolute top-3 left-3 flex gap-2">
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-2 bg-white rounded-lg shadow-md hover:bg-slate-50 transition"
                title="Zoom In"
              >
                <ZoomIn size={18} />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-2 bg-white rounded-lg shadow-md hover:bg-slate-50 transition"
                title="Zoom Out"
              >
                <ZoomOut size={18} />
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="p-2 bg-white rounded-lg shadow-md hover:bg-slate-50 transition"
                title="Resetar"
              >
                <RotateCw size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-3 right-3 p-2 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600 transition"
              title="Remover"
            >
              <X size={18} />
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-2 bg-black/60 text-white text-xs rounded-lg backdrop-blur-sm">
              <Move size={14} className="inline mr-1" />
              Arraste para ajustar • Zoom: {Math.round(scale * 100)}%
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-12 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={48} className="text-slate-400 mb-3" />
            <p className="text-sm text-slate-600 font-medium">
              Clique ou arraste uma imagem
            </p>
            <p className="text-xs text-slate-500 mt-1">
              PNG, JPG ou WEBP até {maxSize / 1024 / 1024}MB
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          className="hidden"
        />
      </div>

      {imagePreview && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
        >
          <Upload size={16} className="mr-2" />
          Trocar imagem
        </Button>
      )}
    </div>
  );
}
