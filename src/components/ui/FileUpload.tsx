import { useRef, useState } from 'react';
import { Upload, X, FileIcon } from 'lucide-react';

interface FileUploadProps {
  label?: string;
  accept?: string;
  maxSize?: number;
  onFileSelect: (file: File | null) => void;
  error?: string;
  preview?: string | null;
  type?: 'image' | 'document';
}

export function FileUpload({
  label,
  accept,
  maxSize = 5 * 1024 * 1024,
  onFileSelect,
  error,
  preview,
  type = 'image',
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(preview || null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSize) {
      onFileSelect(null);
      return;
    }

    if (type === 'image') {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }

    onFileSelect(file);
  };

  const handleClear = () => {
    setPreviewUrl(null);
    onFileSelect(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
      )}

      <div className="relative">
        {!previewUrl ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`w-full px-4 py-6 border-2 border-dashed rounded-xl
              flex flex-col items-center justify-center gap-2
              hover:border-[#0B4F8A] hover:bg-gray-50 transition-colors
              ${error ? 'border-red-300' : 'border-gray-300'}`}
          >
            {type === 'image' ? <Upload size={24} className="text-gray-400" /> : <FileIcon size={24} className="text-gray-400" />}
            <span className="text-sm text-gray-600">
              Clique para fazer upload
            </span>
            <span className="text-xs text-gray-400">
              {accept || (type === 'image' ? 'PNG, JPG até 5MB' : 'PDF, imagens até 50MB')}
            </span>
          </button>
        ) : (
          <div className="relative">
            {type === 'image' ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-48 object-cover rounded-xl border border-gray-200"
              />
            ) : (
              <div className="w-full p-4 border border-gray-200 rounded-xl flex items-center gap-3">
                <FileIcon size={24} className="text-[#0B4F8A]" />
                <span className="text-sm text-gray-700 flex-1 truncate">
                  Ficheiro selecionado
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 p-2 bg-white rounded-lg shadow-lg
                hover:bg-gray-50 transition-colors"
            >
              <X size={16} className="text-gray-600" />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}
