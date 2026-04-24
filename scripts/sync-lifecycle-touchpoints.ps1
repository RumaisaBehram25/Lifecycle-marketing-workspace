param(
  [Parameter(Mandatory = $true)] [string]$AccessToken,
  [Parameter(Mandatory = $true)] [string]$ClientId,
  [Parameter(Mandatory = $true)] [string]$PlatformId,
  [string]$ApiOrigin = "http://localhost:3000",
  [int]$RecentDays = 365,
  [int]$MaxRounds = 80
)

$ErrorActionPreference = "Stop"

$uri = "$($ApiOrigin.TrimEnd('/'))/api/sync-touchpoints"
$headers = @{
  Authorization = if ($AccessToken.StartsWith("Bearer ")) { $AccessToken } else { "Bearer $AccessToken" }
  "Content-Type" = "application/json"
}

$offset = 0
for ($round = 1; $round -le $MaxRounds; $round++) {
  $payload = @{
    clientId = $ClientId
    platformId = $PlatformId
    lifecycle_only = $true
    lifecycle_recent_days = [Math]::Max(30, [Math]::Min(1095, $RecentDays))
    canvas_offset = $offset
  } | ConvertTo-Json -Depth 5

  $res = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $payload

  $current = [int]($res.offset | ForEach-Object { $_ })
  $total = [int]($res.total | ForEach-Object { $_ })
  $done = [bool]($res.done)

  Write-Host ("Round {0}: lifecycle touchpoints {1}/{2} done={3}" -f $round, $current, $total, $done)

  if ($done -or $current -ge $total) {
    Write-Host "Lifecycle touchpoints sync complete."
    break
  }

  if ($current -eq $offset) {
    Write-Warning "Offset did not advance; stopping to avoid loop."
    break
  }

  $offset = $current
}
