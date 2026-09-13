// This fork publishes its own images from its own repository, so the upstream
// identity is a default rather than a constant. Both values are read once at
// module load: release tooling runs as one-shot processes, and a mid-run change
// would silently split an index across two identities.
//
// Unset environment means byte-identical upstream behaviour, which is what keeps
// the inherited fixtures and the published upstream index valid.
// GITHUB_REPOSITORY is what Actions already sets, so a fork release needs no
// extra wiring; CPAMP_REPOSITORY_SLUG exists for local runs and to let a fork
// validate against its own identity outside CI. Both are resolved here so the
// notes links and release-info.json can never disagree about the repository.
export const repositorySlug =
  process.env.CPAMP_REPOSITORY_SLUG || process.env.GITHUB_REPOSITORY || 'seakee/CPA-Manager-Plus';
const slug = repositorySlug;
export const repository = `https://github.com/${slug}`;
export const dockerImage = process.env.CPAMP_DOCKER_IMAGE || 'seakee/cpa-manager-plus';
const pattern =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export function parseVersion(tag) {
  const m = typeof tag === 'string' && pattern.exec(tag);
  if (!m) throw new Error('Invalid semantic version');
  const pre = m[4]?.split('.') || [];
  if (pre.some((p) => /^0\d+$/.test(p))) throw new Error('Leading zero in prerelease');
  // `max` is this fork's own release train, sharing the shape of beta/rc so a
  // tag like v7.2.151-max.4 carries a real stage instead of failing identity
  // validation. It is deliberately not a maturity level between beta and
  // stable - see stageAllowed.
  const stage = !pre.length
    ? 'stable'
    : pre.length === 2 && /^(beta|rc|max)$/.test(pre[0]) && /^\d+$/.test(pre[1])
      ? pre[0]
      : '';
  return { core: m.slice(1, 4), pre, stage };
}
const textCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const numberCompare = (a, b) =>
  a.length === b.length ? textCompare(a, b) : Math.sign(a.length - b.length);
export function compareVersions(a, b) {
  a = parseVersion(a);
  b = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const c = numberCompare(a.core[i], b.core[i]);
    if (c) return c;
  }
  if (!a.pre.length || !b.pre.length)
    return !a.pre.length && !b.pre.length ? 0 : !a.pre.length ? 1 : -1;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i],
      y = b.pre[i],
      xn = /^\d+$/.test(x),
      yn = /^\d+$/.test(y);
    const c = xn && yn ? numberCompare(x, y) : xn !== yn ? (xn ? -1 : 1) : textCompare(x, y);
    if (c) return c;
  }
  return Math.sign(a.pre.length - b.pre.length);
}
// The `max` channel is a closed train, in both directions. A fork build must
// never be handed to someone tracking stable/rc/beta, and an upstream stable
// must never be offered as an update to a fork install either: the fork carries
// features upstream does not have, so "newer" there would be a downgrade in
// capability. That is why `max` is not folded into the usual stable-flows-
// everywhere rule.
export const stageAllowed = (channel, stage) =>
  channel === 'max'
    ? stage === 'max'
    : stage === 'stable' ||
      (channel === 'rc' && stage === 'rc') ||
      (channel === 'beta' && ['beta', 'rc'].includes(stage));
export const nativeAssets = (tag) =>
  ['darwin', 'linux', 'windows']
    .flatMap((os) =>
      ['amd64', 'arm64'].map(
        (arch) => `cpa-manager-plus_${tag}_${os}_${arch}${os === 'windows' ? '.zip' : '.tar.gz'}`
      )
    )
    .sort();
export function validateInfo(info, tag) {
  const v = parseVersion(tag);
  if (
    !/^v/.test(tag) ||
    tag.includes('+') ||
    !v.stage ||
    info?.schema_version !== 1 ||
    info.release?.version !== tag ||
    info.release.stage !== v.stage ||
    !/^[0-9a-f]{40}$/.test(info.release.source_commit)
  )
    throw new Error('Invalid release identity');
  for (const lang of ['zh', 'en']) {
    if (
      typeof info.content?.summary?.[lang] !== 'string' ||
      !info.content.summary[lang].trim() ||
      Buffer.byteLength(info.content.summary[lang], 'utf8') > 4096 ||
      info.content?.notes?.[lang] !==
        `${repository}/blob/${tag}/docs/release-notes/${tag}-${lang}.md`
    )
      throw new Error('Invalid release content');
  }
  if (
    typeof info.update?.breaking !== 'boolean' ||
    typeof info.update?.migration_required !== 'boolean'
  )
    throw new Error('Explicit update flags required');
  if (info.update.minimum_direct_upgrade_version !== null)
    parseVersion(info.update.minimum_direct_upgrade_version);
  const guide = new URL(info.update.upgrade_guide_url);
  if (
    guide.origin !== 'https://github.com' ||
    guide.username ||
    guide.password ||
    !guide.pathname.startsWith(`/${slug}/`)
  )
    throw new Error('Invalid upgrade guide');
  if (
    info.distribution?.docker?.image !== dockerImage ||
    info.distribution.docker.version_tag !== tag ||
    JSON.stringify([...(info.distribution?.native?.assets || [])].sort()) !==
      JSON.stringify(nativeAssets(tag))
  )
    throw new Error('Invalid distribution');
  if (info.compatibility?.minimum_cpa_version !== null)
    parseVersion(info.compatibility?.minimum_cpa_version);
  return info;
}
export function resolveChannels(infos, withdrawn = []) {
  const channels = { stable: null, rc: null, beta: null, max: null };
  for (const info of infos) {
    const tag = info.release.version;
    validateInfo(info, tag);
    if (withdrawn.includes(tag)) continue;
    for (const ch of Object.keys(channels))
      if (
        stageAllowed(ch, info.release.stage) &&
        (!channels[ch] || compareVersions(tag, channels[ch].version) > 0)
      )
        channels[ch] = { version: tag };
  }
  return channels;
}
