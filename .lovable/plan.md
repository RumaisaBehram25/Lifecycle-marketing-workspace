

# Fix: Customer.io 401 -- Correct API Path Prefix

## Root Cause

The Customer.io credentials documentation states:

> "API requests to `https://api.customer.io/v1/api/` use App API Keys."

Our current code calls `https://api.customer.io/v1/campaigns`, but the correct path for App API key authentication is `https://api.customer.io/v1/api/campaigns` (note the extra `/api/` segment in the path).

While Customer.io's beta API release notes suggest both `/v1/` and `/v1/api/` should work, the credentials page explicitly ties App API keys to the `/v1/api/` prefix. This mismatch is the most likely cause of the 401.

## Changes

**File: `supabase/functions/customerio-proxy/index.ts`**

1. Update all endpoint paths from `/v1/...` to `/v1/api/...`:
   - `/v1/campaigns` becomes `/v1/api/campaigns`
   - `/v1/newsletters` becomes `/v1/api/newsletters`
   - `/v1/campaigns/:id/actions/:id` becomes `/v1/api/campaigns/:id/actions/:id`
   - `/v1/campaigns/:id/actions/:id/language/en` becomes `/v1/api/campaigns/:id/actions/:id/language/en`
   - `/v1/newsletters/:id/actions/:id` becomes `/v1/api/newsletters/:id/actions/:id`
   - `/v1/newsletters/:id/actions/:id/language/en` becomes `/v1/api/newsletters/:id/actions/:id/language/en`

2. Add a diagnostic `/debug` sub-path that returns:
   - Whether `CUSTOMERIO_API_KEY` is set (first 4 chars masked)
   - The resolved base URL being used
   - A test call result with full error details

This is a focused change -- only the path prefix in 8 fetch calls needs updating. No frontend changes required.

## Technical Details

The `cioFetch` helper constructs URLs as `CIO_BASE() + path`. Currently paths start with `/v1/`. The fix changes them to start with `/v1/api/`. Example:

Before: `https://api.customer.io/v1/campaigns?page=1&page_size=1`
After:  `https://api.customer.io/v1/api/campaigns?page=1&page_size=1`

After deploying, a quick health check call will confirm whether this resolves the 401.

