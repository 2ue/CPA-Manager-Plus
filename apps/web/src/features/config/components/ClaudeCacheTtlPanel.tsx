import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/Select';
import type { ClaudeCodeConfig, CacheTtlMode } from '@/types/visualConfig';
import styles from './ClaudeCacheTtlPanel.module.scss';

type ClaudeCacheTtlPanelProps = {
  value: ClaudeCodeConfig;
  disabled?: boolean;
  onChange: (value: ClaudeCodeConfig) => void;
};

/**
 * Editor for `claude-code.cache-ttl`.
 *
 * Deliberately separate from CacheTokenAdjustmentPanel: every rule in that panel
 * only rewrites reported usage figures, whereas this one rewrites the request
 * body sent upstream. That changes which cache pool is actually written and read
 * — moving the real hit rate and the billing rate together — so it gets its own
 * panel and an explicit warning instead of sitting among the reporting knobs.
 */
export function ClaudeCacheTtlPanel({
  value,
  disabled = false,
  onChange,
}: ClaudeCacheTtlPanelProps) {
  const { t } = useTranslation();
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2>{t('config_management.claude_cache_ttl.title')}</h2>
          <p>{t('config_management.claude_cache_ttl.description')}</p>
        </div>
        <span className={styles.badge}>{t('config_management.claude_cache_ttl.badge')}</span>
      </header>
      <p className={styles.warning} role="note">
        {t('config_management.claude_cache_ttl.warning')}
      </p>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor="claude-cache-ttl">
            {t('config_management.claude_cache_ttl.label')}
          </label>
          <Select
            id="claude-cache-ttl"
            value={value.cacheTtl}
            options={[
              {
                value: 'passthrough',
                label: t('config_management.claude_cache_ttl.passthrough'),
              },
              { value: '5m', label: t('config_management.claude_cache_ttl.five_minutes') },
              { value: '1h', label: t('config_management.claude_cache_ttl.one_hour') },
            ]}
            onChange={(next) => onChange({ ...value, cacheTtl: next as CacheTtlMode })}
            disabled={disabled}
          />
          <div className="hint">
            {value.cacheTtl === 'passthrough'
              ? t('config_management.claude_cache_ttl.hint_passthrough')
              : t('config_management.claude_cache_ttl.hint_forced')}
          </div>
        </div>
      </div>
    </section>
  );
}
