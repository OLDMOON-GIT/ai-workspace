/**
 * Spec Parser Tests
 */

import { parseMarkdownSpec, SpecDocument } from '../../src/parsers/spec-parser';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Spec Parser', () => {
  const testDir = path.join(os.tmpdir(), 'spec-parser-test');
  const testSpecPath = path.join(testDir, 'test-spec.md');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('parseMarkdownSpec', () => {
    it('should parse markdown spec with title', () => {
      const content = `# Test Specification

## Introduction

This is a test spec.
`;
      fs.writeFileSync(testSpecPath, content, 'utf-8');
      const doc = parseMarkdownSpec(testSpecPath);

      expect(doc.title).toBe('Test Specification');
      expect(doc.sections.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract checklist items as specs', () => {
      const content = `# Feature Spec

## Requirements

- [ ] Implement login functionality
- [x] Add user registration
- [ ] Create password reset (긴급)
`;
      fs.writeFileSync(testSpecPath, content, 'utf-8');
      const doc = parseMarkdownSpec(testSpecPath);

      const reqs = doc.sections.find(s => s.heading === 'Requirements');
      expect(reqs).toBeDefined();
      expect(reqs?.specs.length).toBe(3);
    });

    it('should detect priority from keywords', () => {
      const content = `# Priority Test

## Tasks

- [ ] Critical bug fix (critical)
- [ ] Important feature (중요)
- [ ] Nice to have improvement (개선)
`;
      fs.writeFileSync(testSpecPath, content, 'utf-8');
      const doc = parseMarkdownSpec(testSpecPath);

      const tasks = doc.sections.find(s => s.heading === 'Tasks');
      expect(tasks?.specs[0].priority).toBe('P0'); // critical
      expect(tasks?.specs[1].priority).toBe('P1'); // 중요
      expect(tasks?.specs[2].priority).toBe('P3'); // 개선
    });

    it('should extract TODO comments', () => {
      const content = `# Todo Test

## Implementation

Some text here.
TODO: Add error handling
FIXME: Fix memory leak
SPEC: Define API contract
`;
      fs.writeFileSync(testSpecPath, content, 'utf-8');
      const doc = parseMarkdownSpec(testSpecPath);

      const impl = doc.sections.find(s => s.heading === 'Implementation');
      expect(impl?.specs.length).toBe(3);
      expect(impl?.specs[0].title).toBe('Add error handling');
      expect(impl?.specs[1].title).toBe('Fix memory leak');
      expect(impl?.specs[2].title).toBe('Define API contract');
    });

    it('should parse numbered list items', () => {
      const content = `# Numbered List Test

## Steps

1. Initialize project
2. Configure settings
3. Deploy to production
`;
      fs.writeFileSync(testSpecPath, content, 'utf-8');
      const doc = parseMarkdownSpec(testSpecPath);

      const steps = doc.sections.find(s => s.heading === 'Steps');
      expect(steps?.specs.length).toBe(3);
    });

    it('should handle multiple sections', () => {
      const content = `# Multi Section Test

## Section One

- [ ] Task 1

## Section Two

- [ ] Task 2

### Subsection

- [ ] Task 3
`;
      fs.writeFileSync(testSpecPath, content, 'utf-8');
      const doc = parseMarkdownSpec(testSpecPath);

      expect(doc.sections.length).toBe(3);
    });

    it('should parse metadata from frontmatter style', () => {
      const content = `# Metadata Test

author: Claude
version: 1.0
status: draft

## Content

Some content here.
`;
      fs.writeFileSync(testSpecPath, content, 'utf-8');
      const doc = parseMarkdownSpec(testSpecPath);

      expect(doc.metadata.author).toBe('Claude');
      expect(doc.metadata.version).toBe('1.0');
      expect(doc.metadata.status).toBe('draft');
    });
  });
});
