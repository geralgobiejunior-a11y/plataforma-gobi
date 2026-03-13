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

type SuggestSource = 'geoapi' | 'nominatim';

interface AddressSuggestion {
  rua: string;
  numeroPorta?: string;
  codigoPostal: string;
  freguesia: string;
  concelho: string;
  distrito: string;
  latitude?: number;
  longitude?: number;
  label: string;
  source: SuggestSource;
}

interface AddressAutocompleteProps {
  value: AddressData;
  onChange: (data: AddressData) => void;
}

function normalizeCP(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 7);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function isFullCP(cp: string) {
  return /^\d{4}-\d{3}$/.test(cp);
}

function isCPQuery(q: string) {
  return /^\d{4}-?\d{0,3}$/.test(q.trim());
}

function clean(value?: string | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractDoorNumber(text: string) {
  const s = clean(text);
  if (!s) return '';

  const match =
    s.match(/\b(\d{1,5}[A-Za-z]?)\b/) ||
    s.match(/\b(n[ºo°]?\s*\d{1,5}[A-Za-z]?)\b/i);

  return match ? clean(match[1].replace(/^n[ºo°]?\s*/i, '')) : '';
}

function splitRoadAndNumber(rawRoad: string) {
  const road = clean(rawRoad);
  if (!road) return { rua: '', numeroPorta: '' };

  const match = road.match(/^(.*?)(?:\s+(\d{1,5}[A-Za-z]?))$/);
  if (!match) {
    return { rua: road, numeroPorta: '' };
  }

  return {
    rua: clean(match[1]),
    numeroPorta: clean(match[2]),
  };
}

async function geocodeExactAddress(query: string, signal: AbortSignal) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=pt&q=${encodeURIComponent(
    query
  )}`;

  const resp = await fetch(url, {
    signal,
    headers: { 'Accept-Language': 'pt-PT,pt;q=0.9' },
  });

  if (!resp.ok) return null;

  const rows = (await resp.json()) as any[];
  if (!rows?.length) return null;

  const r = rows[0];
  return {
    latitude: r.lat ? parseFloat(r.lat) : undefined,
    longitude: r.lon ? parseFloat(r.lon) : undefined,
    raw: r,
  };
}

export function AddressAutocomplete({ value, onChange }: AddressAutocompleteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const stopPending = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = null;
  };

  const setFromSuggestion = (s: AddressSuggestion) => {
    onChange({
      ...value,
      rua: s.rua || value.rua,
      numeroPorta: clean(s.numeroPorta) || value.numeroPorta,
      codigoPostal: s.codigoPostal || value.codigoPostal,
      freguesia: s.freguesia || value.freguesia,
      concelho: s.concelho || value.concelho,
      distrito: s.distrito || value.distrito,
      latitude: s.latitude ?? value.latitude,
      longitude: s.longitude ?? value.longitude,
    });
  };

  const lookupPostal = async (cp: string, signal: AbortSignal) => {
    const cleanCp = cp.replace('-', '');

    try {
      const resp = await fetch(`https://json.geoapi.pt/cp/${cleanCp}?json=1`, { signal });

      if (resp.ok) {
        const data = await resp.json();

        if (data && !data.erro) {
          const fullCP = `${data.CP4}-${data.CP3}`;
          const designacao = clean(String(data.Designacao || data.rua || ''));
          const freguesia = clean(String(data.Freguesia || ''));
          const concelho = clean(String(data.Concelho || ''));
          const distrito = clean(String(data.Distrito || ''));

          const { rua, numeroPorta } = splitRoadAndNumber(designacao);

          const geocodeQuery = [
            [rua, numeroPorta].filter(Boolean).join(' ').trim(),
            fullCP,
            concelho,
            distrito,
            'Portugal',
          ]
            .filter(Boolean)
            .join(', ');

          let latitude: number | undefined;
          let longitude: number | undefined;

          if (geocodeQuery) {
            try {
              const geo = await geocodeExactAddress(geocodeQuery, signal);
              latitude = geo?.latitude;
              longitude = geo?.longitude;
            } catch (e: any) {
              if (e?.name === 'AbortError') throw e;
            }
          }

          const s: AddressSuggestion = {
            rua,
            numeroPorta,
            codigoPostal: fullCP,
            freguesia,
            concelho,
            distrito,
            latitude,
            longitude,
            label:
              geocodeQuery ||
              `${fullCP} • ${concelho}${distrito ? `, ${distrito}` : ''}`,
            source: 'geoapi',
          };

          return [s];
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=pt&q=${encodeURIComponent(
      `${cp} Portugal`
    )}`;

    const resp2 = await fetch(url, {
      signal,
      headers: { 'Accept-Language': 'pt-PT,pt;q=0.9' },
    });

    if (!resp2.ok) return [];

    const rows = (await resp2.json()) as any[];

    const mapped: AddressSuggestion[] = (rows || [])
      .map((r) => {
        const addr = r.address || {};
        const codigoPostal = clean(String(addr.postcode || ''));
        const concelho = clean(
          String(addr.county || addr.city || addr.town || addr.village || '')
        );
        const distrito = clean(String(addr.state || addr.region || ''));
        const freguesia = clean(
          String(addr.suburb || addr.quarter || addr.neighbourhood || addr.village || '')
        );

        const rawRoad = clean(
          String(
            addr.road ||
              addr.pedestrian ||
              addr.residential ||
              addr.neighbourhood ||
              r.name ||
              ''
          )
        );

        const split = splitRoadAndNumber(rawRoad);
        const numeroPorta =
          split.numeroPorta || extractDoorNumber(String(r.display_name || ''));

        return {
          rua: split.rua || rawRoad,
          numeroPorta,
          codigoPostal,
          concelho,
          distrito,
          freguesia,
          latitude: r.lat ? parseFloat(r.lat) : undefined,
          longitude: r.lon ? parseFloat(r.lon) : undefined,
          label: clean(String(r.display_name || '')),
          source: 'nominatim' as const,
        };
      })
      .filter((s) => s.codigoPostal || s.concelho || s.distrito || s.rua);

    return mapped;
  };

  const searchText = async (q: string, signal: AbortSignal) => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=pt&q=${encodeURIComponent(
      q
    )}`;

    const resp = await fetch(url, {
      signal,
      headers: { 'Accept-Language': 'pt-PT,pt;q=0.9' },
    });

    if (!resp.ok) return [];

    const rows = (await resp.json()) as any[];

    const mapped: AddressSuggestion[] = (rows || [])
      .map((r) => {
        const addr = r.address || {};
        const codigoPostal = clean(String(addr.postcode || ''));
        const concelho = clean(
          String(addr.county || addr.city || addr.town || addr.village || '')
        );
        const distrito = clean(String(addr.state || addr.region || ''));
        const freguesia = clean(
          String(addr.suburb || addr.quarter || addr.neighbourhood || addr.village || '')
        );

        const rawRoad = clean(
          String(
            addr.road ||
              addr.pedestrian ||
              addr.residential ||
              addr.neighbourhood ||
              addr.hamlet ||
              r.name ||
              ''
          )
        );

        const split = splitRoadAndNumber(rawRoad);
        const numeroPorta =
          split.numeroPorta ||
          extractDoorNumber(String(addr.house_number || '')) ||
          extractDoorNumber(String(r.display_name || ''));

        return {
          rua: split.rua || rawRoad,
          numeroPorta,
          codigoPostal,
          concelho,
          distrito,
          freguesia,
          latitude: r.lat ? parseFloat(r.lat) : undefined,
          longitude: r.lon ? parseFloat(r.lon) : undefined,
          label: clean(String(r.display_name || '')),
          source: 'nominatim' as const,
        };
      })
      .filter((s) => s.label);

    return mapped;
  };

  const runSearch = (q: string) => {
    const query = q.trim();
    setSearchQuery(q);

    stopPending();

    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setLoading(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);

      try {
        let results: AddressSuggestion[] = [];

        if (isCPQuery(query)) {
          const cp = normalizeCP(query);

          if (cp.replace('-', '').length < 7) {
            setSuggestions([]);
            setShowSuggestions(false);
            setLoading(false);
            return;
          }

          results = await lookupPostal(cp, controller.signal);
        } else {
          results = await searchText(query, controller.signal);
        }

        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error('Erro ao buscar endereço:', e);
        }
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const selectSuggestion = (s: AddressSuggestion) => {
    setFromSuggestion(s);
    setSearchQuery(s.label || '');
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleCodigoPostalChange = (raw: string) => {
    const cp = normalizeCP(raw);

    onChange({
      ...value,
      codigoPostal: cp,
    });

    if (isFullCP(cp)) {
      stopPending();

      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        setLoading(true);

        try {
          const results = await lookupPostal(cp, controller.signal);

          if (results.length > 0) {
            setFromSuggestion(results[0]);
            setSuggestions(results);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        } catch (e: any) {
          if (e?.name !== 'AbortError') console.error(e);
          setSuggestions([]);
          setShowSuggestions(false);
        } finally {
          setLoading(false);
        }
      })();
    }
  };

  const suggestionList = useMemo(() => suggestions, [suggestions]);

  return (
    <div className="space-y-4">
      <div ref={wrapperRef} className="relative">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          <MapPin size={14} className="inline mr-1" />
          Buscar Endereço (opcional)
        </label>

        <div className="relative">
          <Input
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Digite o código postal ou nome da rua…"
            onFocus={() => suggestionList.length > 0 && setShowSuggestions(true)}
          />

          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader size={18} className="text-slate-400 animate-spin" />
            </div>
          )}
        </div>

        {showSuggestions && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-3 text-sm text-slate-500">A pesquisar…</div>
            ) : suggestionList.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-500">Nenhum endereço encontrado.</div>
            ) : (
              suggestionList.map((s, index) => (
                <button
                  key={`${s.source}-${index}-${s.codigoPostal}-${s.concelho}-${s.latitude ?? 'no-lat'}`}
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition border-b border-slate-100 last:border-0"
                >
                  <div className="font-medium text-slate-900">
                    {[s.rua, s.numeroPorta].filter(Boolean).join(' ').trim() ||
                      s.codigoPostal ||
                      'Endereço'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {s.codigoPostal ? `${s.codigoPostal} • ` : ''}
                    {s.concelho}
                    {s.distrito ? `, ${s.distrito}` : ''}
                    {s.freguesia ? ` • ${s.freguesia}` : ''}
                  </div>
                </button>
              ))
            )}
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
          onChange={(e) => handleCodigoPostalChange(e.target.value)}
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

      {value.latitude != null && value.longitude != null && (
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
          <strong>Dica:</strong> Pode digitar o CP no campo “Buscar Endereço” ou diretamente em “Código Postal”.
          Para localização exata, o ideal é pesquisar também a rua e o número.
        </div>
      </div>
    </div>
  );
}