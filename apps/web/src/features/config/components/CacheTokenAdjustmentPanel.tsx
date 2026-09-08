import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { hasCacheTokenAdjustmentValidationErrors } from '@/utils/cacheTokenAdjustment';
import type {
  CacheAdjustmentTrigger,
  CacheTokenAdjustmentConfig,
  CacheTokenAdjustmentRule,
} from '@/types/visualConfig';
import styles from './CacheTokenAdjustmentPanel.module.scss';

type CacheTokenAdjustmentPanelProps = {
  value: CacheTokenAdjustmentConfig;
  disabled?: boolean;
  onChange: (value: CacheTokenAdjustmentConfig) => void;
};

function RuleEditor({
  kind,
  value,
  disabled,
  onChange,
}: {
  kind: 'read' | 'write' | 'output';
  value: CacheTokenAdjustmentRule;
  disabled: boolean;
  onChange: (value: CacheTokenAdjustmentRule) => void;
}) {
  const { t } = useTranslation();
  const update = (patch: Partial<CacheTokenAdjustmentRule>) => onChange({ ...value, ...patch });
  const prefix = `config_management.cache_adjustment.${kind}`;
  const trigger = value.trigger;
  const fieldsDisabled = disabled || !value.enabled;

  return (
    <section className={styles.rule}>
      <div className={styles.ruleHeader}>
        <div>
          <h3>{t(`${prefix}.title`)}</h3>
          <p>{t(`${prefix}.description`)}</p>
        </div>
        <ToggleSwitch
          checked={value.enabled}
          onChange={(enabled) => onChange({ ...value, enabled })}
          label={t('config_management.cache_adjustment.enabled')}
          labelClassName={styles.switchLabel}
          ariaLabel={t('config_management.cache_adjustment.enabled')}
          disabled={disabled}
        />
      </div>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label>{t('config_management.cache_adjustment.trigger')}</label>
          <Select
            value={trigger}
            placeholder={t('config_management.cache_adjustment.trigger_placeholder')}
            options={[
              {
                value: 'range',
                label: t('config_management.cache_adjustment.trigger_range'),
              },
              {
                value: 'greater-than',
                label: t('config_management.cache_adjustment.trigger_greater_than'),
              },
              {
                value: 'less-than',
                label: t('config_management.cache_adjustment.trigger_less_than'),
              },
            ]}
            onChange={(next) => update({ trigger: next as CacheAdjustmentTrigger })}
            disabled={fieldsDisabled}
          />
        </div>
        {trigger === 'range' ? (
          <>
            <Input
              label={t('config_management.cache_adjustment.trigger_min')}
              type="number"
              min="0"
              value={value.triggerMin}
              onChange={(event) => update({ triggerMin: event.target.value })}
              disabled={fieldsDisabled}
            />
            <Input
              label={t('config_management.cache_adjustment.trigger_max')}
              type="number"
              min="0"
              value={value.triggerMax}
              onChange={(event) => update({ triggerMax: event.target.value })}
              disabled={fieldsDisabled}
            />
          </>
        ) : trigger === 'greater-than' ? (
          <Input
            label={t('config_management.cache_adjustment.trigger_threshold')}
            type="number"
            min="0"
            value={value.triggerMin}
            onChange={(event) => update({ triggerMin: event.target.value })}
            disabled={fieldsDisabled}
          />
        ) : trigger === 'less-than' ? (
          <Input
            label={t('config_management.cache_adjustment.trigger_threshold')}
            type="number"
            min="0"
            value={value.triggerMax}
            onChange={(event) => update({ triggerMax: event.target.value })}
            disabled={fieldsDisabled}
          />
        ) : null}
        <Input
          label={t('config_management.cache_adjustment.multiplier')}
          type="number"
          min="0"
          step="0.01"
          placeholder="1.1"
          value={value.multiplier}
          onChange={(event) => update({ multiplier: event.target.value })}
          disabled={fieldsDisabled}
          hint={t('config_management.cache_adjustment.multiplier_hint')}
        />
        <Input
          label={t('config_management.cache_adjustment.max_tokens')}
          type="number"
          min="0"
          max="1000000"
          value={value.maxTokens}
          onChange={(event) => update({ maxTokens: event.target.value })}
          disabled={fieldsDisabled}
          hint={t('config_management.cache_adjustment.max_tokens_hint')}
        />
        <Input
          label={t('config_management.cache_adjustment.clip_min_tokens')}
          type="number"
          min="0"
          value={value.clipMinTokens}
          onChange={(event) => update({ clipMinTokens: event.target.value })}
          disabled={fieldsDisabled}
        />
        <Input
          label={t('config_management.cache_adjustment.clip_max_tokens')}
          type="number"
          min="0"
          value={value.clipMaxTokens}
          onChange={(event) => update({ clipMaxTokens: event.target.value })}
          disabled={fieldsDisabled}
          hint={t('config_management.cache_adjustment.clip_hint')}
        />
      </div>
    </section>
  );
}

export function CacheTokenAdjustmentPanel({
  value,
  disabled = false,
  onChange,
}: CacheTokenAdjustmentPanelProps) {
  const { t } = useTranslation();
  const hasValidationErrors = hasCacheTokenAdjustmentValidationErrors(value);
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2>{t('config_management.cache_adjustment.title')}</h2>
          <p>{t('config_management.cache_adjustment.description')}</p>
          {hasValidationErrors ? (
            <p className={styles.validation} role="alert">
              {t('config_management.cache_adjustment.validation_blocked')}
            </p>
          ) : null}
        </div>
        <span className={styles.limit}>{t('config_management.cache_adjustment.hard_limit')}</span>
      </header>
      <div className={styles.rules}>
        <section className={styles.rule}>
          <div className={styles.ruleHeader}>
            <div>
              <h3>{t('config_management.cache_adjustment.input.title')}</h3>
              <p>{t('config_management.cache_adjustment.input.description')}</p>
            </div>
            <ToggleSwitch
              checked={value.input.enabled}
              onChange={(enabled) =>
                onChange({ ...value, input: { ...value.input, enabled } })
              }
              label={t('config_management.cache_adjustment.enabled')}
              labelClassName={styles.switchLabel}
              ariaLabel={t('config_management.cache_adjustment.enabled')}
              disabled={disabled}
            />
          </div>
          <div className={styles.grid}>
            <Input
              label={t('config_management.cache_adjustment.input.max_tokens')}
              type="number"
              min="0"
              max="1000000"
              value={value.input.maxTokens}
              onChange={(event) =>
                onChange({ ...value, input: { ...value.input, maxTokens: event.target.value } })
              }
              disabled={disabled || !value.input.enabled}
            />
            <Input
              label={t('config_management.cache_adjustment.input.jitter_ratio')}
              type="number"
              min="1"
              step="0.01"
              placeholder="1.1"
              value={value.input.jitterRatio}
              onChange={(event) =>
                onChange({ ...value, input: { ...value.input, jitterRatio: event.target.value } })
              }
              disabled={disabled || !value.input.enabled}
              hint={t('config_management.cache_adjustment.input.jitter_hint')}
            />
          </div>
        </section>
        <RuleEditor
          kind="read"
          value={value.read}
          disabled={disabled}
          onChange={(read) => onChange({ ...value, read })}
        />
        <RuleEditor
          kind="write"
          value={value.write}
          disabled={disabled}
          onChange={(write) => onChange({ ...value, write })}
        />
        <RuleEditor
          kind="output"
          value={value.output}
          disabled={disabled}
          onChange={(output) => onChange({ ...value, output: output as typeof value.output })}
        />
      </div>
    </div>
  );
}
