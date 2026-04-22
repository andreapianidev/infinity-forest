import { create } from 'zustand';
import type { Weather } from './world';

export type PlantKind =
  | 'fern'
  | 'mushroom'
  | 'flower'
  | 'herb'
  | 'waterlily'
  | 'moonbloom'
  | 'dewcup'
  | 'berry';

export const PLANT_LABELS: Record<PlantKind, string> = {
  fern: 'Fern',
  mushroom: 'Mushroom',
  flower: 'Wildflower',
  herb: 'Herb',
  waterlily: 'Waterlily',
  moonbloom: 'Moonbloom',
  dewcup: 'Dewcup',
  berry: 'Wild Berry',
};

export const PLANT_HINT: Record<PlantKind, string> = {
  fern: 'Shade-loving. Always present.',
  mushroom: 'Grows at night or after rain.',
  flower: 'Blooms during the day.',
  herb: 'Fragrant at dawn and dusk.',
  waterlily: 'Floats on still water.',
  moonbloom: 'Opens only under stars.',
  dewcup: 'Forms briefly after rain.',
  berry: 'Ripens in daylight on shrubs.',
};

/** Is this plant kind collectable right now under the given world conditions? */
export function plantAvailable(
  kind: PlantKind,
  hour: number,
  weather: Weather,
  postRainSec: number,
  near: boolean,
): boolean {
  switch (kind) {
    case 'fern': return true;
    case 'flower': return hour >= 7 && hour < 18 && weather !== 'rain';
    case 'herb': return (hour >= 5 && hour < 8) || (hour >= 17 && hour < 20);
    case 'mushroom': return hour >= 20 || hour < 6 || postRainSec > 0;
    case 'moonbloom': return hour >= 21 || hour < 5;
    case 'waterlily': return near;
    case 'dewcup': return postRainSec > 0 && postRainSec < 150;
    case 'berry': return hour >= 8 && hour < 19 && weather !== 'rain';
  }
}

interface GameState {
  inventory: Record<PlantKind, number>;
  collected: Set<string>;
  nearbyPlantId: string | null;
  nearbyPlantKind: PlantKind | null;
  setNearby: (id: string | null, kind: PlantKind | null) => void;
  collect: (id: string, kind: PlantKind) => void;
}

export const useGame = create<GameState>((set, get) => ({
  inventory: { fern: 0, mushroom: 0, flower: 0, herb: 0, waterlily: 0, moonbloom: 0, dewcup: 0, berry: 0 },
  collected: new Set<string>(),
  nearbyPlantId: null,
  nearbyPlantKind: null,
  setNearby: (id, kind) => set({ nearbyPlantId: id, nearbyPlantKind: kind }),
  collect: (id, kind) => {
    const { collected, inventory } = get();
    if (collected.has(id)) return;
    const next = new Set(collected);
    next.add(id);
    set({
      collected: next,
      inventory: { ...inventory, [kind]: inventory[kind] + 1 },
      nearbyPlantId: null,
      nearbyPlantKind: null,
    });
  },
}));
