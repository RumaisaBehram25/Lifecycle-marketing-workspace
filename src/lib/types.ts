export type PlatformType = 'braze' | 'klaviyo' | 'iterable' | 'customerio' | 'hubspot';
export type ChannelType = 'email' | 'push' | 'sms' | 'in_app';
export type ContentType = 'copy' | 'code';
export type AppRole = 'admin' | 'member';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_voice: string | null;
  tone_presets: string[];
  do_rules: string[];
  dont_rules: string[];
  legal_requirements: string | null;
  website_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientPlatform {
  id: string;
  client_id: string;
  platform: PlatformType;
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  additional_config: Record<string, unknown>;
  is_connected: boolean;
  last_sync_at: string | null;
  schema_cache: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  client_id: string | null;
  source_url: string;
  title: string | null;
  content: string;
  content_type: string;
  category: string | null;
  platform: PlatformType | null;
  is_vendor_doc: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlatformSchema {
  id: string;
  client_platform_id: string;
  schema_type: 'event' | 'attribute' | 'consent';
  name: string;
  data_type: string | null;
  description: string | null;
  sample_values: unknown[];
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GeneratedContent {
  id: string;
  client_id: string;
  user_id: string;
  content_type: ContentType;
  channel: ChannelType | null;
  platform: PlatformType | null;
  input_params: Record<string, unknown>;
  output_content: Record<string, unknown>;
  sources_used: string[];
  assumptions: string[];
  created_at: string;
}

export interface CopyGeneratorInput {
  client_id: string;
  channel: ChannelType;
  platform: PlatformType;
  audience_stage: 'awareness' | 'consideration' | 'decision' | 'retention' | 'advocacy';
  goal: 'activation' | 'conversion' | 'retention' | 'engagement' | 'winback';
  tone: string;
  cta_type: 'soft' | 'medium' | 'strong';
  additional_context?: string;
}

export interface CodeGeneratorInput {
  client_id: string;
  platform: PlatformType;
  trigger_type: string;
  available_attributes: string[];
  edge_cases: string[];
  additional_context?: string;
}

export const PLATFORM_INFO: Record<PlatformType, { name: string; color: string; icon: string }> = {
  braze: { name: 'Braze', color: 'braze', icon: '🔥' },
  klaviyo: { name: 'Klaviyo', color: 'klaviyo', icon: '📧' },
  iterable: { name: 'Iterable', color: 'iterable', icon: '🔄' },
  customerio: { name: 'Customer.io', color: 'customerio', icon: '👤' },
  hubspot: { name: 'HubSpot', color: 'hubspot', icon: '🧡' },
};

export const CHANNEL_INFO: Record<ChannelType, { name: string; icon: string }> = {
  email: { name: 'Email', icon: '📧' },
  push: { name: 'Push', icon: '🔔' },
  sms: { name: 'SMS', icon: '💬' },
  in_app: { name: 'In-App', icon: '📱' },
};
