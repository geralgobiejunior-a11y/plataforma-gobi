// src/components/ui/AddressAutocomplete.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
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
  concelho: string;
  distrito: string;
  freguesia?: string;
  // coords quando vier do Nominatim
  latitude?: number;
  longitude?: number;
  // label para UI
  label?: string;
  source: 'geoapi' | 'nominatim';
}

interface AddressAutocompleteProps {
  value: AddressData;
  onChange: (data: AddressData) => void;
}

function normalizeCp(input: string) {
  const digits = input.replace(/\D/g, '').slice(0, 7);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4, 7)}`;
}

function isPostalCodeQuery(q: string) {
  // aceita 1000, 1000-, 1000-001, 1000001
  return /^\d{4}-?\d{0,3}$/.test(q.trim());
}

function buildRuaFromNominatim(addr: any) {
  // tenta montar “rua” com road/pedestrian/etc + house_number (se houver)
  const road =
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    addr.cycleway ||
    addr.path ||
    addr.residential ||
    addr.neighbourhood ||
    addr.suburb ||
    addr.village ||
    addr.town ||
    addr.city ||
    '';
  return String(road || '').trim();
}

function pickDistritoFromNominatim(addr: any) {
  // em PT, geralmente vem em "state"
  return (addr.state || addr.region || addr.county || addr.city || '').toString().trim();
}

function pickConcelhoFromNominatim(addr: any) {
  // concelho costuma vir em "county" ou "city"
  return (addr.county || addr.city || addr.town || addr.village || '').toString().trim();
}

function pickFreguesiaFromNominatim(addr: any) {
  // freguesia nem sempre vem explícito; tentamos suburb/quarter/neighbourhood/village
  return (addr.suburb || addr.quarter || addr.neighbourhood || addr.village || '').toString().trim();
}

export function AddressAutocomplete({ value, onChange }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // input “Buscar Endereço”
  const [searchQuery, setSearchQuery] = useState('');

  // debounce
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // click outside
  const wrapperRef = useRef<HTMLDivElement>(null);

  // evita disparar busca quando nós mesmos atualizamos o CP via seleção
  const suppressPostalSearchRef = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runSearch = async (queryRaw: string) => {
    const query = queryRaw.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // cancela request anterior
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const postal = isPostalCodeQuery(query);

      // 1) CP -> geoapi.pt
      if (postal) {
        const clean = query.replace('-', '');
        const response = await fetch(`https://json.geoapi.pt/cp/${clean}?json=1`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        const data = await response.json();
        if (!data || data.erro) {
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        const s: AddressSuggestion = {
          rua: (data.Designacao || data.rua || '').toString().trim(),
          codigoPostal: `${data.CP4}-${data.CP3}`,
          concelho: (data.Concelho || '').toString().trim(),
          distrito: (data.Distrito || '').toString().trim(),
          freguesia: (data.Freguesia || '').toString().trim(),
          label: `${data.CP4}-${data.CP3} • ${(data.Concelho || '').toString().trim()}, ${(data.Distrito || '').toString().trim()}`,
          source: 'geoapi',
        };

        setSuggestions([s]);
        setShowSuggestions(true);
        return;
      }

      // 2) Rua / texto -> Nominatim (autocomplete real)
      // Nota: Nominatim é “best effort” e pode variar o detalhe por morada.
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=pt&q=${encodeURIComponent(
        query
      )}`;

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'pt-PT,pt;q=0.9',
        },
      });

      if (!resp.ok) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      const rows = (await resp.json()) as any[];
      const mapped: AddressSuggestion[] = (rows || [])
        .map((r) => {
          const addr = r.address || {};
          const rua = buildRuaFromNominatim(addr) || (r.name || '').toString().trim();
          const concelho = pickConcelhoFromNominatim(addr);
          const distrito = pickDistritoFromNominatim(addr);
          const freguesia = pickFreguesiaFromNominatim(addr);
          const codigoPostal = (addr.postcode || '').toString().trim();

          return {
            rua,
            codigoPostal: codigoPostal || '',
            concelho,
            distrito,
            freguesia: freguesia || '',
            latitude: r.lat ? parseFloat(r.lat) : undefined,
            longitude: r.lon ? parseFloat(r.lon) : undefined,
            label: (r.display_name || '').toString(),
            source: 'nominatim',
          };
        })
        .filter((s) => s.rua || s.concelho || s.distrito);

      setSuggestions(mapped);
      setShowSuggestions(mapped.length > 0);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('Erro ao buscar endereço:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setLoading(false);
    }
  };

  const scheduleSearch = (q: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(q), 350);
  };

  // quando digita no “Buscar Endereço”
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    scheduleSearch(q);
  };

  const applyAddress = (base: AddressData) => {
    onChange(base);
  };

  const geocodeIfMissingCoords = async (base: AddressData) => {
    // tenta obter lat/lng quando não veio (ex.: geoapi)
    const address = `${base.rua}, ${base.codigoPostal} ${base.concelho}, ${base.distrito}, Portugal`.replace(
      /\s+/g,
      ' '
    );

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=pt&q=${encodeURIComponent(
          address
        )}`,
        {
          signal: controller.signal,
          headers: { 'Accept-Language': 'pt-PT,pt;q=0.9' },
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      if (data && data[0]) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          applyAddress({ ...base, latitude: lat, longitude: lon });
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('Erro ao buscar coordenadas:', e);
    }
  };

  const selectSuggestion = async (s: AddressSuggestion) => {
    // monta 1 único estado “verdade”
    const base: AddressData = {
      rua: s.rua || value.rua,
      numeroPorta: value.numeroPorta, // porta continua manual
      codigoPostal: s.codigoPostal || value.codigoPostal,
      freguesia: s.freguesia || value.freguesia || '',
      concelho: s.concelho || value.concelho,
      distrito: s.distrito || value.distrito,
      latitude: s.latitude,
      longitude: s.longitude,
    };

    // evita disparar busca automática do CP por causa deste update
    suppressPostalSearchRef.current = true;

    applyAddress(base);
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);

    // liberta supressão após o ciclo atual
    window.setTimeout(() => {
      suppressPostalSearchRef.current = false;
    }, 0);

    // se não veio coords, tenta geocoding
    if (!base.latitude || !base.longitude) {
      await geocodeIfMissingCoords(base);
    }
  };

  // ======== Integração pedida: digitar no “Código Postal” (campo de baixo) também busca ========
  const handlePostalFieldChange = (raw: string) => {
    const masked = normalizeCp(raw);

    onChange({ ...value, codigoPostal: masked });

    // dispara busca, desde que não seja um update interno vindo da seleção
    if (suppressPostalSearchRef.current) return;

    // joga a busca para o mesmo mecanismo do “Buscar Endereço”
    setSearchQuery(masked);
    scheduleSearch(masked);

    // abre dropdown se já há query suficiente
    if (masked.replace('-', '').length >= 4) setShowSuggestions(true);
  };

  const suggestionList = useMemo(() => suggestions.slice(0, 6), [suggestions]);

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
            onFocus={() => suggestionList.length > 0 && setShowSuggestions(true)}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader size={18} className="text-slate-400 animate-spin" />
            </div>
          )}
        </div>

        {showSuggestions && suggestionList.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
            {suggestionList.map((s, index) => (
              <button
                key={`${s.source}-${index}-${s.codigoPostal}-${s.concelho}`}
                type="button"
                onClick={() => selectSuggestion(s)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition border-b border-slate-100 last:border-0"
              >
                <div className="font-medium text-slate-900">{s.rua || s.label || 'Endereço'}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {s.codigoPostal ? `${s.codigoPostal} • ` : ''}
                  {s.concelho}
                  {s.distrito ? `, ${s.distrito}` : ''}
                  {s.freguesia ? ` • ${s.freguesia}` : ''}
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
          onChange={(e) => handlePostalFieldChange(e.target.value)}
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
          <strong>Dica:</strong> Digite o código postal (ex: 1000-001) no campo “Buscar Endereço” ou no campo “Código Postal”
          para preencher automaticamente.
        </div>
      </div>
    </div>
  );
}
