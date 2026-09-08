import type { CacheTokenAdjustmentConfig, CacheTokenAdjustmentRule } from '@/types/visualConfig';

/** Validate the user-editable cache adjustment constraints before YAML persistence. */
export function hasCacheTokenAdjustmentValidationErrors(
  config: CacheTokenAdjustmentConfig | undefined
): boolean {
  if (!config) return false;

  const validateRule = (rule: CacheTokenAdjustmentRule) => {
    if (!rule.enabled) return false;
    const threshold = rule.maxTokens.trim();
    const clipMin = rule.clipMinTokens.trim();
    const clipMax = rule.clipMaxTokens.trim();
    if (threshold && (!/^\d+$/.test(threshold) || Number(threshold) >= 1_000_000)) return true;
    if (clipMin && (!/^\d+$/.test(clipMin) || Number(clipMin) < 0)) return true;
    if (clipMax && (!/^\d+$/.test(clipMax) || Number(clipMax) < 0)) return true;
    if (clipMin && clipMax && Number(clipMin) > Number(clipMax)) return true;
    if (threshold && clipMin && Number(threshold) + Number(clipMin) >= 1_000_000) return true;
    return false;
  };

  const inputMax = config.input.maxTokens.trim();
  const jitter = config.input.jitterRatio.trim();
  if (config.input.enabled) {
    if (inputMax && (!/^\d+$/.test(inputMax) || Number(inputMax) > 1_000_000)) return true;
    if (jitter && (!Number.isFinite(Number(jitter)) || Number(jitter) < 1)) return true;
  }
  return (
    validateRule(config.read) ||
    validateRule(config.write) ||
    (config.output.enabled ? validateRule(config.output) : false)
  );
}
