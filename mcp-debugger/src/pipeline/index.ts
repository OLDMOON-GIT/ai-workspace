/**
 * Pipeline Index
 * 모든 파이프라인 모듈을 통합 export
 */

export * from './test-reporter.js';
export * from './error-collector.js';
export * from './deploy-pipeline.js';

import testReporter from './test-reporter.js';
import errorCollector from './error-collector.js';
import deployPipeline from './deploy-pipeline.js';

export const pipeline = {
  testReporter,
  errorCollector,
  deployPipeline
};

export default pipeline;
