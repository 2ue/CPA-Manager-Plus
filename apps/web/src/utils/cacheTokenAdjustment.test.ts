import { describe, expect, it } from 'vitest';
import type { CacheTokenAdjustmentConfig } from '@/types/visualConfig';
import { hasCacheTokenAdjustmentValidationErrors } from './cacheTokenAdjustment';

const emptyConfig = (): CacheTokenAdjustmentConfig => ({
  input: { enabled: false, maxTokens: '', jitterRatio: '' },
  read: {
    enabled: false,
    trigger: '',
    triggerMin: '',
    triggerMax: '',
    multiplier: '',
    maxTokens: '',
    clipMinTokens: '',
    clipMaxTokens: '',
  },
  write: {
    enabled: false,
    trigger: '',
    triggerMin: '',
    triggerMax: '',
    multiplier: '',
    maxTokens: '',
    clipMinTokens: '',
    clipMaxTokens: '',
  },
  output: {
    enabled: false,
    trigger: '',
    triggerMin: '',
    triggerMax: '',
    multiplier: '',
    maxTokens: '',
    clipMinTokens: '',
    clipMaxTokens: '',
  },
});

describe('cache token adjustment validation', () => {
  it('accepts an empty policy and valid threshold plus clip range', () => {
    const config = emptyConfig();
    config.read.maxTokens = '500000';
    config.read.clipMinTokens = '12345';
    config.read.clipMaxTokens = '65432';
    config.input.maxTokens = '100';
    config.input.jitterRatio = '1.1';
    expect(hasCacheTokenAdjustmentValidationErrors(config)).toBe(false);
  });

  it('rejects a threshold at one million or a clip range above it', () => {
    const config = emptyConfig();
    config.read.enabled = true;
    config.read.maxTokens = '1000000';
    expect(hasCacheTokenAdjustmentValidationErrors(config)).toBe(true);

    config.read.maxTokens = '999000';
    config.read.clipMinTokens = '1000';
    expect(hasCacheTokenAdjustmentValidationErrors(config)).toBe(true);
  });

  it('rejects reversed clip ranges and invalid input jitter', () => {
    const config = emptyConfig();
    config.write.enabled = true;
    config.write.clipMinTokens = '20';
    config.write.clipMaxTokens = '10';
    expect(hasCacheTokenAdjustmentValidationErrors(config)).toBe(true);

    config.write.clipMinTokens = '';
    config.write.clipMaxTokens = '';
    config.input.enabled = true;
    config.input.jitterRatio = '0.9';
    expect(hasCacheTokenAdjustmentValidationErrors(config)).toBe(true);
  });
});
