import { isMap, parseDocument } from 'yaml';

export type ClaudeTransportProfile = {
  userAgent: string;
  packageVersion: string;
  runtimeVersion: string;
  os: string;
  arch: string;
  timeout: string;
  timezone: string;
  stabilizeDeviceProfile: boolean;
  disableCooling: boolean;
  nonstreamKeepaliveInterval: string;
  streamingKeepaliveSeconds: string;
};

export type ClaudeTransportApplyMode = 'fill-missing' | 'overwrite';

export const CLAUDE_TRANSPORT_OS_VALUES = [
  'MacOS',
  'Windows',
  'Linux',
  'Android',
  'FreeBSD',
  'OpenBSD',
] as const;

export const CLAUDE_TRANSPORT_ARCH_VALUES = ['arm64', 'x64', 'x32', 'arm'] as const;

type ClaudeTransportValidationError =
  | 'required'
  | 'timezone'
  | 'non_negative_integer'
  | 'os'
  | 'arch';

export type ClaudeTransportChange = {
  path: string;
  before: string;
  after: string;
};

export const CLAUDE_TRANSPORT_DEFAULTS: ClaudeTransportProfile = {
  userAgent: 'claude-cli/2.1.220 (external, cli)',
  packageVersion: '0.94.0',
  runtimeVersion: 'v26.3.0',
  os: '',
  arch: '',
  timeout: '600',
  timezone: '',
  stabilizeDeviceProfile: true,
  disableCooling: false,
  nonstreamKeepaliveInterval: '15',
  streamingKeepaliveSeconds: '15',
};

const profileEntries = (profile: ClaudeTransportProfile) => [
  { path: ['claude-header-defaults', 'user-agent'], value: profile.userAgent },
  { path: ['claude-header-defaults', 'package-version'], value: profile.packageVersion },
  { path: ['claude-header-defaults', 'runtime-version'], value: profile.runtimeVersion },
  { path: ['claude-header-defaults', 'os'], value: profile.os },
  { path: ['claude-header-defaults', 'arch'], value: profile.arch },
  { path: ['claude-header-defaults', 'timeout'], value: profile.timeout },
  { path: ['claude-header-defaults', 'timezone'], value: profile.timezone },
  {
    path: ['claude-header-defaults', 'stabilize-device-profile'],
    value: profile.stabilizeDeviceProfile,
  },
  { path: ['disable-cooling'], value: profile.disableCooling },
  { path: ['nonstream-keepalive-interval'], value: Number(profile.nonstreamKeepaliveInterval) },
  { path: ['streaming', 'keepalive-seconds'], value: Number(profile.streamingKeepaliveSeconds) },
];

const formatChangeValue = (value: unknown): string => {
  if (value === undefined) return '(missing)';
  if (value === null) return 'null';
  return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
};

const isMissingValue = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

export function validateClaudeTransportProfile(
  profile: ClaudeTransportProfile
): Partial<Record<keyof ClaudeTransportProfile, ClaudeTransportValidationError>> {
  const errors: Partial<Record<keyof ClaudeTransportProfile, ClaudeTransportValidationError>> = {};
  if (!profile.userAgent.trim()) errors.userAgent = 'required';
  if (!profile.packageVersion.trim()) errors.packageVersion = 'required';
  if (!profile.runtimeVersion.trim()) errors.runtimeVersion = 'required';
  if (!profile.os.trim()) errors.os = 'required';
  else if (
    !CLAUDE_TRANSPORT_OS_VALUES.includes(
      profile.os.trim() as (typeof CLAUDE_TRANSPORT_OS_VALUES)[number]
    )
  ) {
    errors.os = 'os';
  }
  if (!profile.arch.trim()) errors.arch = 'required';
  else if (
    !CLAUDE_TRANSPORT_ARCH_VALUES.includes(
      profile.arch.trim() as (typeof CLAUDE_TRANSPORT_ARCH_VALUES)[number]
    )
  ) {
    errors.arch = 'arch';
  }
  if (!profile.timezone.trim()) errors.timezone = 'required';

  try {
    if (profile.timezone.trim()) {
      new Intl.DateTimeFormat('en-US', { timeZone: profile.timezone.trim() }).format();
    }
  } catch {
    errors.timezone = 'timezone';
  }

  const integerFields: Array<keyof ClaudeTransportProfile> = [
    'timeout',
    'nonstreamKeepaliveInterval',
    'streamingKeepaliveSeconds',
  ];
  integerFields.forEach((field) => {
    const value = String(profile[field]).trim();
    if (!/^\d+$/.test(value)) errors[field] = 'non_negative_integer';
  });
  return errors;
}

export function applyClaudeTransportProfileToYaml(
  yamlContent: string,
  profile: ClaudeTransportProfile,
  mode: ClaudeTransportApplyMode
): { content: string; changes: ClaudeTransportChange[] } {
  const validationErrors = validateClaudeTransportProfile(profile);
  if (Object.keys(validationErrors).length > 0) {
    throw new Error('Invalid Claude transport profile');
  }

  const document = parseDocument(yamlContent);
  if (document.errors.length > 0) {
    throw new Error(document.errors[0]?.message ?? 'Invalid YAML');
  }
  if (!isMap(document.contents)) {
    document.contents = document.createNode({}) as unknown as typeof document.contents;
  }
  const changes: ClaudeTransportChange[] = [];

  profileEntries(profile).forEach(({ path, value }) => {
    const parentPath = path.slice(0, -1);
    const parent = document.getIn(parentPath, true);
    if (parentPath.length > 0 && !isMap(parent)) {
      document.setIn(parentPath, document.createNode({}));
    }
    const current = document.getIn(path);
    if (mode === 'fill-missing' && !isMissingValue(current)) return;
    if (Object.is(current, value)) return;
    document.setIn(path, value);
    changes.push({
      path: path.join('.'),
      before: formatChangeValue(current),
      after: formatChangeValue(value),
    });
  });

  const streamingNode = document.getIn(['streaming'], true);
  if (isMap(streamingNode) && streamingNode.items.length === 0) {
    document.deleteIn(['streaming']);
  }

  return {
    content: document.toString({ indent: 2, lineWidth: 120, minContentWidth: 0 }),
    changes,
  };
}
