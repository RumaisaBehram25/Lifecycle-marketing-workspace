import type { EmailProviderService } from '../types';

export const brazeEmailProviderService: EmailProviderService = {
  id: 'braze',
  analyticsLabel: 'braze',
  capabilities: {
    displayName: 'Braze',
    hasUsageTimeSeries: true,
    hasCampaignDirectory: true,
    hasAudienceDirectory: true,
  },
};
