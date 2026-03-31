import type { EmailProviderService } from '../types';

export const klaviyoEmailProviderService: EmailProviderService = {
  id: 'klaviyo',
  analyticsLabel: 'klaviyo',
  capabilities: {
    displayName: 'Klaviyo',
    hasUsageTimeSeries: false,
    hasCampaignDirectory: false,
    hasAudienceDirectory: true,
  },
};
