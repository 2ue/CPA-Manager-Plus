import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  applyClaudeTransportProfileToYaml,
  validateClaudeTransportProfile,
  type ClaudeTransportProfile,
} from './claudeTransportProfile';

type ParsedTransportYaml = {
  'claude-header-defaults'?: Record<string, unknown>;
  'custom-field'?: unknown;
  'disable-cooling'?: unknown;
  'nonstream-keepalive-interval'?: unknown;
  streaming?: Record<string, unknown>;
};

const profile = (overrides: Partial<ClaudeTransportProfile> = {}): ClaudeTransportProfile => ({
  userAgent: 'claude-cli/2.1.220 (external, cli)',
  packageVersion: '0.94.0',
  runtimeVersion: 'v26.3.0',
  os: 'Linux',
  arch: 'x64',
  timeout: '600',
  timezone: 'Asia/Shanghai',
  stabilizeDeviceProfile: true,
  disableCooling: false,
  nonstreamKeepaliveInterval: '15',
  streamingKeepaliveSeconds: '15',
  ...overrides,
});

describe('validateClaudeTransportProfile', () => {
  it('requires device identity values and validates timezone and integers', () => {
    expect(
      validateClaudeTransportProfile(
        profile({
          os: '',
          arch: '',
          timezone: 'Not/AZone',
          timeout: '-1',
          nonstreamKeepaliveInterval: '1.5',
          streamingKeepaliveSeconds: 'abc',
        })
      )
    ).toEqual({
      os: 'required',
      arch: 'required',
      timezone: 'timezone',
      timeout: 'non_negative_integer',
      nonstreamKeepaliveInterval: 'non_negative_integer',
      streamingKeepaliveSeconds: 'non_negative_integer',
    });
  });

  it('rejects unsupported device identity enum values', () => {
    expect(
      validateClaudeTransportProfile(
        profile({
          os: 'Darwin',
          arch: 'amd64',
        })
      )
    ).toEqual({
      os: 'os',
      arch: 'arch',
    });
  });
});

describe('applyClaudeTransportProfileToYaml', () => {
  it('fills missing values without overwriting existing values', () => {
    const result = applyClaudeTransportProfileToYaml(
      [
        'claude-header-defaults:',
        '  os: Windows',
        'custom-field: keep-me',
        'streaming:',
        '  existing: true',
        '',
      ].join('\n'),
      profile(),
      'fill-missing'
    );
    const parsed = parse(result.content) as ParsedTransportYaml;

    expect(parsed['claude-header-defaults']?.os).toBe('Windows');
    expect(parsed['claude-header-defaults']?.arch).toBe('x64');
    expect(parsed['claude-header-defaults']?.['user-agent']).toBe(
      'claude-cli/2.1.220 (external, cli)'
    );
    expect(parsed['custom-field']).toBe('keep-me');
    expect(parsed.streaming?.existing).toBe(true);
    expect(parsed.streaming?.['keepalive-seconds']).toBe(15);
    expect(result.changes.map((change) => change.path)).toContain(
      'streaming.keepalive-seconds'
    );
  });

  it('overwrites configured values and reports before/after values', () => {
    const result = applyClaudeTransportProfileToYaml(
      [
        'claude-header-defaults:',
        '  os: Windows',
        '  arch: x64',
        '  timezone: America/New_York',
        'disable-cooling: true',
        'nonstream-keepalive-interval: 5',
        'streaming:',
        '  keepalive-seconds: 3',
        '',
      ].join('\n'),
      profile(),
      'overwrite'
    );
    const parsed = parse(result.content) as ParsedTransportYaml;

    expect(parsed['claude-header-defaults']?.os).toBe('Linux');
    expect(parsed['claude-header-defaults']?.timezone).toBe('Asia/Shanghai');
    expect(parsed['disable-cooling']).toBe(false);
    expect(parsed['nonstream-keepalive-interval']).toBe(15);
    expect(parsed.streaming?.['keepalive-seconds']).toBe(15);
    expect(result.changes).toEqual(
      expect.arrayContaining([
        { path: 'claude-header-defaults.os', before: '"Windows"', after: '"Linux"' },
        { path: 'disable-cooling', before: 'true', after: 'false' },
      ])
    );
  });

  it('is idempotent after applying the same profile', () => {
    const first = applyClaudeTransportProfileToYaml('custom: true\n', profile(), 'fill-missing');
    const second = applyClaudeTransportProfileToYaml(first.content, profile(), 'fill-missing');

    expect(second.changes).toEqual([]);
    expect(second.content).toBe(first.content);
  });

  it('rejects a profile with missing device identity', () => {
    expect(() =>
      applyClaudeTransportProfileToYaml('custom: true\n', profile({ timezone: '' }), 'overwrite')
    ).toThrow('Invalid Claude transport profile');
  });

  it('replaces scalar parent nodes before writing nested settings', () => {
    const result = applyClaudeTransportProfileToYaml(
      ['claude-header-defaults: invalid', 'streaming: 3', ''].join('\n'),
      profile(),
      'overwrite'
    );
    const parsed = parse(result.content) as ParsedTransportYaml;

    expect(parsed['claude-header-defaults']?.os).toBe('Linux');
    expect(parsed.streaming?.['keepalive-seconds']).toBe(15);
  });
});
