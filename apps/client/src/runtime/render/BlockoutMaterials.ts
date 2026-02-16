export type BlockoutPalette = {
  background: number;
  floorBase: number;
  floorStallOverlay: number;
  floorClearOverlay: number;
  wall: number;
  shopfront: number;
  signage: number;
  cover: number;
  spawnCover: number;
  serviceDoor: number;
  canopy: number;
  heroPillar: number;
  heroLintel: number;
  landmarkWell: number;
  filler: number;
};

const DEFAULT_BLOCKOUT_PALETTE: BlockoutPalette = {
  background: 0xeaf3ff,
  floorBase: 0xd8dde3,
  floorStallOverlay: 0xc8dbc4,
  floorClearOverlay: 0xa5deed,
  wall: 0xe4cf9f,
  shopfront: 0xc49a64,
  signage: 0x3da9b8,
  cover: 0x86a89e,
  spawnCover: 0x93b18a,
  serviceDoor: 0xd1bba0,
  canopy: 0xe0ad6a,
  heroPillar: 0x3f95b4,
  heroLintel: 0x58acc5,
  landmarkWell: 0x2f7f9f,
  filler: 0xd6ba8a,
};

const HIGH_VIS_BLOCKOUT_PALETTE: BlockoutPalette = {
  background: 0xf1f7ff,
  floorBase: 0xe3e9ef,
  floorStallOverlay: 0xd5e8d2,
  floorClearOverlay: 0x9de9ff,
  wall: 0xecdcb5,
  shopfront: 0xd3ab78,
  signage: 0x36b9cd,
  cover: 0x94b9ae,
  spawnCover: 0xa4c49a,
  serviceDoor: 0xdeccb4,
  canopy: 0xe9be84,
  heroPillar: 0x309dc2,
  heroLintel: 0x5bb9d0,
  landmarkWell: 0x2a8db1,
  filler: 0xe2c799,
};

export function resolveBlockoutPalette(highVis: boolean): BlockoutPalette {
  return highVis ? HIGH_VIS_BLOCKOUT_PALETTE : DEFAULT_BLOCKOUT_PALETTE;
}
