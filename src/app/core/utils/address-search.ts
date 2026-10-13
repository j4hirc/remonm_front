export interface AddressPoint {
  lat: number;
  lon: number;
  house: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  category: string;
  type: string;
}

function normalize(value: string): string {
  const aliases: Record<string, string> = {
    avenue: 'ave',
    street: 'st',
    boulevard: 'blvd',
    road: 'rd',
    drive: 'dr',
    lane: 'ln',
    court: 'ct',
    place: 'pl',
    north: 'n',
    south: 's',
    east: 'e',
    west: 'w',
    northeast: 'ne',
    northwest: 'nw',
    southeast: 'se',
    southwest: 'sw'
  };

  return value
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .trim()
    .split(/\s+/)
    .map(word => aliases[word] ?? word)
    .join(' ');
}

export function matchesAddress(
  query: string,
  point: AddressPoint
): boolean {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lon) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lon) > 180
  ) {
    return false;
  }

  // Una parada o estación no sirve como ubicación de la propiedad.
  if (
    ['highway', 'railway', 'public_transport'].includes(point.category) ||
    ['bus_stop', 'platform', 'station'].includes(point.type)
  ) {
    return false;
  }

  const number = query
    .trim()
    .match(/^(\d+[a-z]?(?:[-/]\d+)?(?:\s+\d\/\d)?)(?=\s)/i)?.[1];

  if (!number || normalize(number) !== normalize(point.house)) {
    return false;
  }

  const street = normalize(point.street);
  const text = ` ${normalize(query)} `;

  if (!street || !text.includes(` ${street} `)) {
    return false;
  }

  const zip = query.match(/\b\d{5}(?:-\d{4})?\s*$/)?.[0]?.trim();

  if (zip) {
    // Para direcciones de Estados Unidos terminadas en ZIP.
    return (
      point.country.toLowerCase() === 'us' &&
      point.postcode.slice(0, 5) === zip.slice(0, 5)
    );
  }

  // Sin ZIP, la localidad debe aparecer en la dirección.
  return (
    !!point.city &&
    text.includes(` ${normalize(point.city)} `)
  );
}

let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

async function nominatim(q: string): Promise<AddressPoint[]> {
  const task = queue.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastRequest));

    if (wait) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }

    lastRequest = Date.now();

    try {
      const response = await fetch(
        'https://nominatim.openstreetmap.org/search?format=jsonv2' +
          '&addressdetails=1&limit=5&q=' +
          encodeURIComponent(q),
        { signal: AbortSignal.timeout(8000) }
      );

      if (!response.ok) return [];

      const data: any[] = await response.json();

      if (!Array.isArray(data)) return [];

      return data.map(item => ({
        lat: Number(item.lat),
        lon: Number(item.lon),
        house: item.address?.house_number ?? '',
        street: item.address?.road ?? item.address?.pedestrian ?? '',
        postcode: item.address?.postcode ?? '',
        city:
          item.address?.city ??
          item.address?.town ??
          item.address?.village ??
          '',
        country: item.address?.country_code ?? '',
        category: item.category ?? item.class ?? '',
        type: item.type ?? ''
      }));
    } catch {
      return [];
    }
  });

  queue = task.catch(() => undefined);
  return task;
}

async function photon(q: string): Promise<AddressPoint[]> {
  try {
    const response = await fetch(
      'https://photon.komoot.io/api/?limit=5&q=' +
        encodeURIComponent(q),
      { signal: AbortSignal.timeout(8000) }
    );

    if (!response.ok) return [];

    const data = await response.json();

    return (data.features ?? []).map((item: any) => {
      const p = item.properties ?? {};
      const [lon, lat] = item.geometry?.coordinates ?? [];

      return {
        lat,
        lon,
        house: p.housenumber ?? '',
        street: p.street ?? '',
        postcode: p.postcode ?? '',
        city: p.city ?? '',
        country: p.countrycode ?? '',
        category: p.osm_key ?? '',
        type: p.osm_value ?? ''
      };
    });
  } catch {
    return [];
  }
}

export async function findAddress(
  original: string,
  isCurrent: () => boolean = () => true
): Promise<AddressPoint | null> {
  const queries = [original.trim()];

  const zip = original.match(/\b\d{5}(?:-\d{4})?\s*$/)?.[0]?.trim();

  const street = original.match(
    /^(\d+\S*\s+.+?\b(?:Ave(?:nue)?|St(?:reet)?|Rd|Road|Dr(?:ive)?|Blvd|Boulevard|Ln|Lane|Ct|Court|Pl(?:ace)?)\b\.?\s*(?:(?:NE|NW|SE|SW|N|S|E|W)\b)?) /i
  )?.[1]?.trim();

  // Segunda forma de búsqueda usando calle y ZIP.
  if (street && zip) {
    queries.push(`${street}, ${zip}, USA`);
  }

  for (const q of [...new Set(queries)]) {
    if (!isCurrent()) return null;

    const [a, b] = await Promise.all([
      nominatim(q),
      photon(q)
    ]);

    if (!isCurrent()) return null;

    const hit = [...a, ...b].find(point =>
      matchesAddress(original, point)
    );

    if (hit) return hit;
  }

  return null;
}