import fetch from 'node-fetch';

const API_KEY = process.env.RAWG_API_KEY;
const BASE = 'https://api.rawg.io/api';

export async function searchRAWGGames(query, page = 1) {
  if (!API_KEY) return [];
  try {
    const res = await fetch(`${BASE}/games?key=${API_KEY}&search=${encodeURIComponent(query)}&page_size=5&page=${page}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((g) => ({
      id: g.id,
      title: g.name,
      description: '',
      genres: (g.genres || []).map((x) => x.name),
      platforms: (g.platforms || []).map((p) => p.platform.name),
      released: g.released,
      rating: g.rating,
      coverUrl: g.background_image,
    }));
  } catch {
    return [];
  }
}

export async function getRAWGGameDetails(id) {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${BASE}/games/${id}?key=${API_KEY}`);
    if (!res.ok) return null;
    const g = await res.json();
    return {
      title: g.name,
      description: g.description_raw || '',
      genres: (g.genres || []).map((x) => x.name),
      platforms: (g.platforms || []).map((p) => p.platform.name),
      released: g.released,
      rating: g.rating,
      coverUrl: g.background_image,
      website: g.website,
      metacritic: g.metacritic,
    };
  } catch {
    return null;
  }
}