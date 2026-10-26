# Pass the Specs - live port check (read-only)
# Run every few seconds while the Ports / Memory card checks are on screen.
$ErrorActionPreference = 'SilentlyContinue'
$out = [ordered]@{}

# Top-level USB devices and which physical port they are in
$usb = @(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB\VID_*' -and $_.InstanceId -notmatch '&MI_' })
$loc = @{}
if ($usb.Count) {
  foreach ($p in (Get-PnpDeviceProperty -InstanceId $usb.InstanceId -KeyName 'DEVPKEY_Device_LocationInfo')) { $loc[$p.InstanceId] = "$($p.Data)" }
}
$out.usb = @($usb | ForEach-Object { [ordered]@{ id = $_.InstanceId; name = "$($_.FriendlyName)"; port = $loc[$_.InstanceId] } })

# A memory card in a built-in reader (SD / MMC bus, or a card-reader disk with media in it)
$card = @(Get-Disk | Where-Object { "$($_.BusType)" -match 'SD|MMC' -or ("$($_.FriendlyName)" -match 'card|SD|MMC' -and "$($_.BusType)" -ne 'USB') })
$out.card = [ordered]@{ present = ($card.Count -gt 0); name = $(if ($card.Count) { "$($card[0].FriendlyName) $([math]::Round($card[0].Size / 1000000000))GB" } else { '' }) }

# Wired network
$eth = Get-NetAdapter -Physical | Where-Object { $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|802\.11|WLAN|Bluetooth' }
$out.ethernet = [ordered]@{ present = [bool]$eth; up = [bool]($eth | Where-Object { $_.Status -eq 'Up' }) }

$out | ConvertTo-Json -Depth 4 -Compress
