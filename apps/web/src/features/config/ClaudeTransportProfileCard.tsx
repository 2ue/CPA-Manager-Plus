import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ConfigSection } from '@/components/config/ConfigSection';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconShield, IconSettings } from '@/components/ui/icons';
import type { AuthFileItem } from '@/types';
import {
  CLAUDE_TRANSPORT_DEFAULTS,
  CLAUDE_TRANSPORT_ARCH_VALUES,
  CLAUDE_TRANSPORT_OS_VALUES,
  type ClaudeTransportApplyMode,
  type ClaudeTransportProfile,
  validateClaudeTransportProfile,
} from './claudeTransportProfile';
import styles from './ClaudeTransportProfileCard.module.scss';

type ClaudeTransportProfileCardProps = {
  values: ClaudeTransportProfile;
  files: AuthFileItem[];
  filesLoading: boolean;
  disabled?: boolean;
  onApply: (
    profile: ClaudeTransportProfile,
    mode: ClaudeTransportApplyMode,
    patchCredentialStableUserId: boolean
  ) => Promise<void>;
};

const isClaudeCredential = (file: AuthFileItem): boolean =>
  !(file.runtimeOnly === true || file.runtimeOnly === 'true') &&
  String(file.provider ?? file.type ?? '').trim().toLowerCase() === 'claude';

export function ClaudeTransportProfileCard({
  values,
  files,
  filesLoading,
  disabled = false,
  onApply,
}: ClaudeTransportProfileCardProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ClaudeTransportProfile>(() => ({
    ...CLAUDE_TRANSPORT_DEFAULTS,
    userAgent: values.userAgent || CLAUDE_TRANSPORT_DEFAULTS.userAgent,
    packageVersion: values.packageVersion || CLAUDE_TRANSPORT_DEFAULTS.packageVersion,
    runtimeVersion: values.runtimeVersion || CLAUDE_TRANSPORT_DEFAULTS.runtimeVersion,
    os: values.os,
    arch: values.arch,
    timeout: values.timeout || CLAUDE_TRANSPORT_DEFAULTS.timeout,
    timezone: values.timezone,
    stabilizeDeviceProfile: values.stabilizeDeviceProfile,
    disableCooling: values.disableCooling,
    nonstreamKeepaliveInterval:
      values.nonstreamKeepaliveInterval || CLAUDE_TRANSPORT_DEFAULTS.nonstreamKeepaliveInterval,
    streamingKeepaliveSeconds:
      values.streamingKeepaliveSeconds || CLAUDE_TRANSPORT_DEFAULTS.streamingKeepaliveSeconds,
  }));
  const [mode, setMode] = useState<ClaudeTransportApplyMode>('fill-missing');
  const [patchCredentialStableUserId, setPatchCredentialStableUserId] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setProfile((current) => ({
      ...current,
      userAgent: values.userAgent || CLAUDE_TRANSPORT_DEFAULTS.userAgent,
      packageVersion: values.packageVersion || CLAUDE_TRANSPORT_DEFAULTS.packageVersion,
      runtimeVersion: values.runtimeVersion || CLAUDE_TRANSPORT_DEFAULTS.runtimeVersion,
      os: values.os,
      arch: values.arch,
      timeout: values.timeout || CLAUDE_TRANSPORT_DEFAULTS.timeout,
      timezone: values.timezone,
      stabilizeDeviceProfile: values.stabilizeDeviceProfile,
      disableCooling: values.disableCooling,
      nonstreamKeepaliveInterval:
        values.nonstreamKeepaliveInterval || CLAUDE_TRANSPORT_DEFAULTS.nonstreamKeepaliveInterval,
      streamingKeepaliveSeconds:
        values.streamingKeepaliveSeconds || CLAUDE_TRANSPORT_DEFAULTS.streamingKeepaliveSeconds,
    }));
  }, [
    values.arch,
    values.disableCooling,
    values.nonstreamKeepaliveInterval,
    values.os,
    values.packageVersion,
    values.runtimeVersion,
    values.stabilizeDeviceProfile,
    values.streamingKeepaliveSeconds,
    values.timeout,
    values.timezone,
    values.userAgent,
  ]);

  const validationErrors = validateClaudeTransportProfile(profile);
  const claudeCount = useMemo(() => files.filter(isClaudeCredential).length, [files]);
  const osOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = CLAUDE_TRANSPORT_OS_VALUES.map(
      (value) => ({ value, label: value })
    );
    if (profile.os && !CLAUDE_TRANSPORT_OS_VALUES.includes(profile.os as (typeof CLAUDE_TRANSPORT_OS_VALUES)[number])) {
      options.unshift({ value: profile.os, label: profile.os });
    }
    return options;
  }, [profile.os]);
  const archOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = CLAUDE_TRANSPORT_ARCH_VALUES.map(
      (value) => ({ value, label: value })
    );
    if (
      profile.arch &&
      !CLAUDE_TRANSPORT_ARCH_VALUES.includes(
        profile.arch as (typeof CLAUDE_TRANSPORT_ARCH_VALUES)[number]
      )
    ) {
      options.unshift({ value: profile.arch, label: profile.arch });
    }
    return options;
  }, [profile.arch]);

  const setField = <K extends keyof ClaudeTransportProfile>(
    field: K,
    value: ClaudeTransportProfile[K]
  ) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleApply = async () => {
    if (Object.keys(validationErrors).length > 0 || applying || disabled) return;
    setApplying(true);
    try {
      await onApply(profile, mode, patchCredentialStableUserId);
    } finally {
      setApplying(false);
    }
  };

  return (
    <ConfigSection
      icon={<IconShield size={16} />}
      title={t('config_management.claude_transport.title')}
      description={t('config_management.claude_transport.description')}
    >
      <div className={styles.card}>
        <div className={styles.notice}>{t('config_management.claude_transport.notice')}</div>
        <div className={styles.grid}>
          <Input
            label={t('config_management.claude_transport.user_agent')}
            value={profile.userAgent}
            onChange={(event) => setField('userAgent', event.target.value)}
            disabled={disabled || applying}
            error={
              validationErrors.userAgent
                ? t('config_management.claude_transport.required')
                : undefined
            }
          />
          <Input
            label={t('config_management.claude_transport.package_version')}
            value={profile.packageVersion}
            onChange={(event) => setField('packageVersion', event.target.value)}
            disabled={disabled || applying}
            error={
              validationErrors.packageVersion
                ? t('config_management.claude_transport.required')
                : undefined
            }
          />
          <Input
            label={t('config_management.claude_transport.runtime_version')}
            value={profile.runtimeVersion}
            onChange={(event) => setField('runtimeVersion', event.target.value)}
            disabled={disabled || applying}
            error={
              validationErrors.runtimeVersion
                ? t('config_management.claude_transport.required')
                : undefined
            }
          />
          <div className="form-group">
            <label>{t('config_management.claude_transport.os')}</label>
            <Select
              value={profile.os}
              options={osOptions}
              onChange={(value) => setField('os', value)}
              disabled={disabled || applying}
              ariaLabel={t('config_management.claude_transport.os')}
              placeholder={t('config_management.claude_transport.os_placeholder')}
            />
            {validationErrors.os && (
              <div className="error-box">
                {t(
                  validationErrors.os === 'required'
                    ? 'config_management.claude_transport.required'
                    : 'config_management.claude_transport.invalid_os'
                )}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>{t('config_management.claude_transport.arch')}</label>
            <Select
              value={profile.arch}
              options={archOptions}
              onChange={(value) => setField('arch', value)}
              disabled={disabled || applying}
              ariaLabel={t('config_management.claude_transport.arch')}
              placeholder={t('config_management.claude_transport.arch_placeholder')}
            />
            {validationErrors.arch && (
              <div className="error-box">
                {t(
                  validationErrors.arch === 'required'
                    ? 'config_management.claude_transport.required'
                    : 'config_management.claude_transport.invalid_arch'
                )}
              </div>
            )}
          </div>
          <Input
            label={t('config_management.claude_transport.timeout')}
            value={profile.timeout}
            onChange={(event) => setField('timeout', event.target.value)}
            disabled={disabled || applying}
            error={
              validationErrors.timeout
                ? t('config_management.visual.validation.non_negative_integer')
                : undefined
            }
          />
          <Input
            label={t('config_management.claude_transport.timezone')}
            value={profile.timezone}
            onChange={(event) => setField('timezone', event.target.value)}
            disabled={disabled || applying}
            error={
              validationErrors.timezone
                ? t(
                    validationErrors.timezone === 'required'
                      ? 'config_management.claude_transport.required'
                      : 'config_management.visual.validation.timezone'
                  )
                : undefined
            }
            placeholder={t('config_management.claude_transport.timezone_placeholder')}
          />
          <Input
            label={t('config_management.claude_transport.nonstream_keepalive')}
            value={profile.nonstreamKeepaliveInterval}
            onChange={(event) => setField('nonstreamKeepaliveInterval', event.target.value)}
            disabled={disabled || applying}
            error={
              validationErrors.nonstreamKeepaliveInterval
                ? t('config_management.visual.validation.non_negative_integer')
                : undefined
            }
          />
          <Input
            label={t('config_management.claude_transport.streaming_keepalive')}
            value={profile.streamingKeepaliveSeconds}
            onChange={(event) => setField('streamingKeepaliveSeconds', event.target.value)}
            disabled={disabled || applying}
            error={
              validationErrors.streamingKeepaliveSeconds
                ? t('config_management.visual.validation.non_negative_integer')
                : undefined
            }
          />
        </div>
        <div className={styles.options}>
          <div className={styles.toggle}>
            <div>
              <strong>{t('config_management.claude_transport.stabilize_device')}</strong>
              <span>{t('config_management.claude_transport.stabilize_device_desc')}</span>
            </div>
            <ToggleSwitch
              checked={profile.stabilizeDeviceProfile}
              onChange={(value) => setField('stabilizeDeviceProfile', value)}
              disabled={disabled || applying}
              ariaLabel={t('config_management.claude_transport.stabilize_device')}
            />
          </div>
          <div className={styles.toggle}>
            <div>
              <strong>{t('config_management.claude_transport.disable_cooling')}</strong>
              <span>{t('config_management.claude_transport.disable_cooling_desc')}</span>
            </div>
            <ToggleSwitch
              checked={profile.disableCooling}
              onChange={(value) => setField('disableCooling', value)}
              disabled={disabled || applying}
              ariaLabel={t('config_management.claude_transport.disable_cooling')}
            />
          </div>
          <div className={styles.toggle}>
            <div>
              <strong>
                {t('config_management.claude_transport.credential_stable_user_id')}
              </strong>
              <span>
                {t('config_management.claude_transport.credential_stable_user_id_desc')}
              </span>
            </div>
            <ToggleSwitch
              checked={patchCredentialStableUserId}
              onChange={setPatchCredentialStableUserId}
              disabled={disabled || applying}
              ariaLabel={t('config_management.claude_transport.credential_stable_user_id')}
            />
          </div>
        </div>
        <div className={styles.footer}>
          <div className={styles.mode}>
            <Select
              value={mode}
              options={[
                {
                  value: 'fill-missing',
                  label: t('config_management.claude_transport.mode_fill_missing'),
                },
                {
                  value: 'overwrite',
                  label: t('config_management.claude_transport.mode_overwrite'),
                },
              ]}
              onChange={(value) => setMode(value as ClaudeTransportApplyMode)}
              disabled={disabled || applying}
              ariaLabel={t('config_management.claude_transport.mode_label')}
            />
          </div>
          <div className={styles.summary}>
            <IconSettings size={15} />
            {filesLoading
              ? t('config_management.claude_transport.credentials_loading')
              : t('config_management.claude_transport.credentials_count', {
                  count: claudeCount,
                })}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleApply()}
            disabled={
              disabled || applying || filesLoading || Object.keys(validationErrors).length > 0
            }
            loading={applying}
          >
            {t('config_management.claude_transport.preview_apply')}
          </Button>
        </div>
      </div>
    </ConfigSection>
  );
}
