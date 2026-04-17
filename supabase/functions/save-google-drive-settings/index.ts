import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  validateAuth,
  validateClientAccessForEdge,
  authErrorResponse,
} from '../_shared/auth.ts';
import { extractGoogleDriveFolderId, maskGoogleDriveApiKey } from '../_shared/googleDriveFolder.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) {
    logger.error('isAdmin check:', error);
    return false;
  }
  return !!data;
}

async function fetchFolderName(apiKey: string, folderId: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=name&key=${encodeURIComponent(apiKey)}`,
  );
  const data = await res.json();
  if (data?.error) return null;
  const name = data?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

async function fetchFilesFromFolder(apiKey: string, folderId: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${encodeURIComponent(apiKey)}&fields=files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,modifiedTime)&orderBy=createdTime+desc`,
  );
  const data = await res.json();
  if (data?.error) {
    throw new Error(data.error.message || 'Google Drive API error');
  }
  return (data.files ?? []) as Array<{
    id: string;
    name: string;
    mimeType?: string;
    thumbnailLink?: string;
    webViewLink?: string;
    createdTime?: string;
    modifiedTime?: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authResult = await validateAuth(req);
    if (!authResult.success || !authResult.userId) {
      return authErrorResponse(authResult.error!, authResult.status!, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!(await isAdmin(supabase, authResult.userId))) {
      return authErrorResponse('Admin access required', 403, corsHeaders);
    }

    const body = (await req.json()) as {
      clientId?: string;
      apiKey?: string | null;
      folderInputs?: string[];
    };

    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'clientId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const access = await validateClientAccessForEdge(supabase, authResult.userId, clientId);
    if (!access.success) {
      return authErrorResponse(access.error!, access.status!, corsHeaders);
    }

    const incomingKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const folderInputs = Array.isArray(body.folderInputs) ? body.folderInputs : [];

    const { data: existing } = await supabase
      .from('client_google_drive_settings')
      .select('google_drive_api_key')
      .eq('client_id', clientId)
      .maybeSingle();

    const existingKey =
      existing && typeof (existing as { google_drive_api_key?: string }).google_drive_api_key === 'string'
        ? String((existing as { google_drive_api_key: string }).google_drive_api_key).trim()
        : '';

    const effectiveKey = incomingKey || existingKey;
    if (!effectiveKey) {
      return new Response(JSON.stringify({ error: 'Google Drive API key is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawLines = folderInputs.map((s) => String(s).trim()).filter(Boolean);
    if (rawLines.length === 0) {
      return new Response(JSON.stringify({ error: 'Add at least one folder (ID or share link)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsedFolders: { raw: string; folderId: string }[] = [];
    const seen = new Set<string>();
    for (const raw of rawLines) {
      const folderId = extractGoogleDriveFolderId(raw);
      if (!folderId) {
        return new Response(JSON.stringify({ error: `Invalid folder ID or link: ${raw.slice(0, 80)}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (seen.has(folderId)) continue;
      seen.add(folderId);
      parsedFolders.push({ raw, folderId });
    }

    if (parsedFolders.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid folders after parsing' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: delFilesErr } = await supabase.from('client_drive_files').delete().eq('client_id', clientId);
    if (delFilesErr) {
      logger.error('delete client_drive_files:', delFilesErr);
      throw new Error('Failed to clear synced Drive files');
    }

    const { error: delConnErr } = await supabase.from('client_google_drive').delete().eq('client_id', clientId);
    if (delConnErr) {
      logger.error('delete client_google_drive:', delConnErr);
      throw new Error('Failed to clear Drive folder connections');
    }

    const hint = maskGoogleDriveApiKey(effectiveKey);
    const { error: settingsErr } = await supabase.from('client_google_drive_settings').upsert(
      {
        client_id: clientId,
        google_drive_api_key: effectiveKey,
        api_key_hint: hint,
        updated_at: new Date().toISOString(),
        updated_by: authResult.userId,
      },
      { onConflict: 'client_id' },
    );
    if (settingsErr) {
      logger.error('upsert client_google_drive_settings:', settingsErr);
      throw new Error('Failed to save Drive settings');
    }

    let totalFiles = 0;
    const now = new Date().toISOString();

    for (const { raw, folderId } of parsedFolders) {
      const folderName = await fetchFolderName(effectiveKey, folderId);
      const { data: conn, error: connErr } = await supabase
        .from('client_google_drive')
        .insert({
          client_id: clientId,
          folder_id: folderId,
          folder_name: folderName ?? null,
          folder_url: raw,
          status: 'connected',
          last_synced_at: now,
        })
        .select('id')
        .single();
      if (connErr || !conn) {
        logger.error('insert client_google_drive:', connErr);
        throw new Error('Failed to save folder connection');
      }

      const files = await fetchFilesFromFolder(effectiveKey, folderId);
      totalFiles += files.length;
      if (files.length > 0) {
        const payload = files.map((f) => ({
          client_id: clientId,
          drive_connection_id: conn.id,
          file_id: f.id,
          file_name: f.name,
          file_type: (f.mimeType || '').includes('folder') ? 'folder' : 'file',
          mime_type: f.mimeType ?? null,
          thumbnail_url: f.thumbnailLink ?? null,
          web_view_link: f.webViewLink ?? null,
          created_time: f.createdTime ?? null,
          modified_time: f.modifiedTime ?? null,
          synced_at: now,
        }));
        const { error: upErr } = await supabase
          .from('client_drive_files')
          .upsert(payload, { onConflict: 'client_id,file_id' });
        if (upErr) {
          logger.error('upsert client_drive_files:', upErr);
          throw new Error('Failed to sync Drive files');
        }
      }

      await supabase.from('client_google_drive').update({ last_synced_at: now }).eq('id', conn.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        apiKeyHint: hint,
        folderCount: parsedFolders.length,
        fileCount: totalFiles,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    logger.error('save-google-drive-settings:', e);
    const message = e instanceof Error ? e.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
