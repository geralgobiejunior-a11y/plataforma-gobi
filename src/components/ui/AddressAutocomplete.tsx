import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader } from 'lucide-react';
import { Input } from './Input';

interface AddressData {
  rua: string;
  numeroPorta: string;
  codigoPostal: string;
  freguesia: string;
  concelho: string;
  distrito: string;
  latitude?: number;
  longitude?: number;
}

interface AddressSuggestion {
  rua: string;
  codigoPostal: string;
  localidade: string;
  concelho: string;
  distrito: string;
  freguesia?: string;
}

interface AddressAutocompleteProps {
  value: AddressData;
  onChange: (data: AddressData) => void;
}

export function AddressAutocomplete({ value, onChange }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const isPostalCode = /^\d{4}-?\d{0,3}$/.test(query);

      if (isPostalCode) {
        const cleanQuery = query.replace('-', '');
        const response = await fetch(
          `https://json.geoapi.pt/cp/${cleanQuery}?json=1`
        );

        if (response.ok) {
          const data = await response.json();
          if (data && !data.erro) {
            const suggestion: AddressSuggestion = {
              rua: data.Designacao || data.rua || '',
              codigoPostal: `${data.CP4}-${data.CP3}`,
              localidade: data.Localidade || '',
              concelho: data.Concelho || '',
              distrito: data.Distrito || '',
              freguesia: data.Freguesia || '',
            };
            setSuggestions([suggestion]);
            setShowSuggestions(true);
          }
        }
      } else {
        const mockSuggestions: AddressSuggestion[] = [
          {
            rua: `${query}`,
            codigoPostal: '1000-001',
            localidade: 'Lisboa',
            concelho: 'Lisboa',
            distrito: 'Lisboa',
            freguesia: 'Santa Maria Maior',
          },
        ];
        setSuggestions(mockSuggestions);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Erro ao buscar endereço:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    searchAddress(query);
  };

  const selectSuggestion = async (suggestion: AddressSuggestion) => {
    onChange({
      rua: suggestion.rua,
      numeroPorta: value.numeroPorta,
      codigoPostal: suggestion.codigoPostal,
      freguesia: suggestion.freguesia || '',
      concelho: suggestion.concelho,
      distrito: suggestion.distrito,
    });

    setSearchQuery('');
    setShowSuggestions(false);

    try {
      const address = `${suggestion.rua}, ${suggestion.concelho}, ${suggestion.distrito}, Portugal`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          address
        )}&limit=1`
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data[0]) {
          onChange({
            ...value,
            rua: suggestion.rua,
            codigoPostal: suggestion.codigoPostal,
            freguesia: suggestion.freguesia || '',
            concelho: suggestion.concelho,
            distrito: suggestion.distrito,
            latitude: parseFloat(data[0].lat),
            longitude: parseFloat(data[0].lon),
          });
        }
      }
    } catch (error) {
      console.error('Erro ao buscar coordenadas:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div ref={wrapperRef} className="relative">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          <MapPin size={14} className="inline mr-1" />
          Buscar Endereço
        </label>
        <div className="relative">
          <Input
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Digite o código postal ou nome da rua..."
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader size={18} className="text-slate-400 animate-spin" />
            </div>
          )}
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => selectSuggestion(suggestion)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition border-b border-slate-100 last:border-0"
              >
                <div className="font-medium text-slate-900">{suggestion.rua}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {suggestion.codigoPostal} • {suggestion.concelho}, {suggestion.distrito}
                  {suggestion.freguesia && ` • ${suggestion.freguesia}`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Rua / Avenida *"
          value={value.rua}
          onChange={(e) => onChange({ ...value, rua: e.target.value })}
          placeholder="Ex: Rua da Prata"
          required
        />

        <Input
          label="Nº da Porta *"
          value={value.numeroPorta}
          onChange={(e) => onChange({ ...value, numeroPorta: e.target.value })}
          placeholder="Ex: 123"
          required
        />

        <Input
          label="Código Postal *"
          value={value.codigoPostal}
          onChange={(e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 4) {
              val = val.slice(0, 4) + '-' + val.slice(4, 7);
            }
            onChange({ ...value, codigoPostal: val });
          }}
          placeholder="0000-000"
          maxLength={8}
          required
        />

        <Input
          label="Freguesia *"
          value={value.freguesia}
          onChange={(e) => onChange({ ...value, freguesia: e.target.value })}
          placeholder="Ex: Santa Maria Maior"
          required
        />

        <Input
          label="Concelho *"
          value={value.concelho}
          onChange={(e) => onChange({ ...value, concelho: e.target.value })}
          placeholder="Ex: Lisboa"
          required
        />

        <Input
          label="Distrito *"
          value={value.distrito}
          onChange={(e) => onChange({ ...value, distrito: e.target.value })}
          placeholder="Ex: Lisboa"
          required
        />
      </div>

      {value.latitude && value.longitude && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-emerald-900">
            <MapPin size={16} className="text-emerald-600" />
            <span className="font-medium">Coordenadas GPS detectadas</span>
          </div>
          <div className="text-xs text-emerald-700 mt-1">
            Lat: {value.latitude.toFixed(6)}, Lng: {value.longitude.toFixed(6)}
          </div>
        </div>
      )}

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="text-xs text-blue-900">
          <strong>Dica:</strong> Digite o código postal (ex: 1000-001) ou o nome da rua para
          preenchimento automático dos campos.
        </div>
      </div>
    </div>
  );
}
