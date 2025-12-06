/**
 * Parser Index
 * 모든 파서 모듈을 통합 export
 */

export * from './spec-parser.js';
export * from './figma-parser.js';
export * from './erd-parser.js';
export * from './arch-parser.js';

import specParser from './spec-parser.js';
import figmaParser from './figma-parser.js';
import erdParser from './erd-parser.js';
import archParser from './arch-parser.js';

export const parsers = {
  spec: specParser,
  figma: figmaParser,
  erd: erdParser,
  arch: archParser
};

export default parsers;
