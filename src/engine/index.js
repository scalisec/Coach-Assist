// Public entry point for the fair-play engine (no screen code; runs in the browser and Node).
export { DIVISIONS, getDivision, fieldPositions, isOutfield, INFIELD, ALL_OUTFIELD, SIT } from './divisions.js';
export { validateLineup } from './validator.js';
export { generateLineup } from './generator.js';
export { rotateBattingOrder } from './batting.js';
export { displayName } from './players.js';
