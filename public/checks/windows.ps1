# Pass the Specs - Windows system scan
# Read-only: this script only LOOKS at the machine, it never changes anything.
# Output is one line of JSON that the app reads.

$ErrorActionPreference = 'SilentlyContinue'
$r = [ordered]@{ platform = 'windows' }

# --- Basics ---------------------------------------------------------------
$cs = Get-CimInstance Win32_ComputerSystem
$r.manufacturer = "$($cs.Manufacturer)".Trim()
$r.model = "$($cs.Model)".Trim()
$r.serial = "$((Get-CimInstance Win32_BIOS).SerialNumber)".Trim()
# Lenovo keeps the friendly name (e.g. "ThinkPad T14 Gen 1") here
$r.productVersion = "$((Get-CimInstance Win32_ComputerSystemProduct).Version)".Trim()
$r.board = "$((Get-CimInstance Win32_BaseBoard).Manufacturer)".Trim()

# Laptop or desktop? (chassis types 8-14, 30-32 are portable)
$chassis = @((Get-CimInstance Win32_SystemEnclosure).ChassisTypes)
$r.chassis = 'unknown'
foreach ($c in $chassis) {
  if (@(8, 9, 10, 11, 12, 14, 30, 31, 32) -contains [int]$c) { $r.chassis = 'laptop' }
  elseif (@(3, 4, 5, 6, 7, 13, 15, 16, 35, 36) -contains [int]$c -and $r.chassis -ne 'laptop') { $r.chassis = 'desktop' }
}

# Graphics cards, with real memory size (the usual value maxes out at 4GB)
$gpus = @()
$classKey = 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
foreach ($k in (Get-ChildItem $classKey)) {
  $p = Get-ItemProperty $k.PSPath
  if (-not $p.DriverDesc) { continue }
  $mem = $p.'HardwareInformation.qwMemorySize'
  if (-not $mem) { $mem = $p.'HardwareInformation.MemorySize' }
  if ($mem -is [byte[]]) { $mem = [BitConverter]::ToUInt32($mem, 0) }
  $gpus += [ordered]@{ name = "$($p.DriverDesc)"; vramGB = $(if ($mem) { [math]::Round([double]$mem / 1GB) } else { $null }) }
}
if (-not $gpus.Count) {
  foreach ($v in (Get-CimInstance Win32_VideoController)) { $gpus += [ordered]@{ name = "$($v.Name)"; vramGB = $null } }
}
$r.gpus = $gpus

# Built-in screen size in inches
$disp = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBasicDisplayParams | Where-Object { $_.Active } | Select-Object -First 1
if ($disp -and $disp.MaxHorizontalImageSize -gt 0) {
  $r.screenInches = [math]::Round([math]::Sqrt([math]::Pow($disp.MaxHorizontalImageSize, 2) + [math]::Pow($disp.MaxVerticalImageSize, 2)) / 2.54, 1)
}

$os = Get-CimInstance Win32_OperatingSystem
$r.os = [ordered]@{ name = "$($os.Caption)".Trim(); version = "$($os.Version)"; build = "$($os.BuildNumber)" }

$r.cpu = "$((Get-CimInstance Win32_Processor | Select-Object -First 1).Name)".Trim()

# Memory type (DDR4, DDR5...) for CeX-style custom PC names
$memTypes = @{ 20 = 'DDR'; 21 = 'DDR2'; 24 = 'DDR3'; 26 = 'DDR4'; 27 = 'LPDDR'; 28 = 'LPDDR2'; 29 = 'LPDDR3'; 30 = 'LPDDR4'; 34 = 'DDR5'; 35 = 'LPDDR5' }
$mt = [int]((Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1).SMBIOSMemoryType)
$r.ramType = $memTypes[$mt]

# Highest screen refresh rate (for laptop names like 18"240Hz)
$r.maxRefresh = [int]((Get-CimInstance Win32_VideoController | Measure-Object -Property MaxRefreshRate -Maximum).Maximum)

$ram = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum
if ($ram) { $r.ramGB = [math]::Round($ram / 1GB) } else { $r.ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB) }

# --- Drives (ignores USB drives, e.g. the stick this runs from) -------------
$disks = @()
foreach ($d in (Get-PhysicalDisk)) {
  if ("$($d.BusType)" -eq 'USB') { continue }
  $wear = $null
  try { $wear = ($d | Get-StorageReliabilityCounter).Wear } catch {}
  $disks += [ordered]@{
    name = "$($d.FriendlyName)"
    sizeGB = [math]::Round($d.Size / 1000000000)
    type = "$($d.MediaType)"
    bus = "$($d.BusType)"
    health = "$($d.HealthStatus)"
    wear = $wear
  }
}
$r.disks = $disks

# --- Encryption / BitLocker -----------------------------------------------
$enc = [ordered]@{ state = 'unknown'; detail = '' }
$bl = Get-BitLockerVolume -MountPoint $env:SystemDrive
if ($bl) {
  $enc.detail = "$($bl.VolumeStatus), protection $($bl.ProtectionStatus)"
  if ("$($bl.VolumeStatus)" -eq 'FullyDecrypted') { $enc.state = 'off' }
  elseif ("$($bl.VolumeStatus)" -match 'Encrypt') { $enc.state = 'on' }
  elseif ("$($bl.ProtectionStatus)" -eq 'On') { $enc.state = 'on' }
} else {
  # Works without admin rights
  $v = (New-Object -ComObject Shell.Application).NameSpace("$($env:SystemDrive)\").Self.ExtendedProperty('System.Volume.BitLockerProtection')
  switch ($v) {
    0 { $enc.state = 'off'; $enc.detail = 'Drive cannot be encrypted' }
    1 { $enc.state = 'on'; $enc.detail = 'BitLocker on' }
    2 { $enc.state = 'off'; $enc.detail = 'BitLocker off' }
    3 { $enc.state = 'on'; $enc.detail = 'Encrypting' }
    4 { $enc.state = 'on'; $enc.detail = 'Decrypting (still in progress)' }
    5 { $enc.state = 'on'; $enc.detail = 'BitLocker suspended' }
    6 { $enc.state = 'on'; $enc.detail = 'BitLocker on (locked)' }
    8 { $enc.state = 'waiting'; $enc.detail = 'Device encryption waiting to activate' }
  }
}
$r.encryption = $enc

# --- Remote management (work/school accounts, domain, MDM) -----------------
$mgmt = [ordered]@{ known = $true; azureAd = $false; enterprise = $false; domain = [bool]$cs.PartOfDomain; mdm = @() }
$ds = dsregcmd /status 2>$null
if ($ds) {
  $mgmt.azureAd = [bool]($ds | Select-String 'AzureAdJoined\s*:\s*YES')
  $mgmt.enterprise = [bool]($ds | Select-String 'EnterpriseJoined\s*:\s*YES')
  $mdmUrl = $ds | Select-String 'MdmUrl\s*:\s*(https?://\S+)'
  if ($mdmUrl) { $mgmt.mdm += 'MDM server: ' + ([uri]$mdmUrl.Matches[0].Groups[1].Value).Host }
}
# Every Windows PC has built-in entries here ("Deploy Authority", "Cloud Authority",
# "Local Authority"...). A real enrolment has a server address and a signed-in account.
$builtIn = @('Deploy Authority', 'Cloud Authority', 'Local Authority', 'WMI_Bridge_Server', 'SCCM', 'Microsoft Device Management')
foreach ($e in (Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Enrollments')) {
  $p = Get-ItemProperty $e.PSPath
  if ($p.EnrollmentState -ne 1) { continue }
  if ($builtIn -contains "$($p.ProviderID)") { continue }
  if (-not $p.DiscoveryServiceFullURL -and -not $p.UPN) { continue }
  $name = if ($p.ProviderID -eq 'MS DM Server') { 'Microsoft Intune' } elseif ($p.ProviderID) { "$($p.ProviderID)" } else { 'Unknown MDM' }
  if ($mgmt.mdm -notcontains $name) { $mgmt.mdm += $name }
}
$r.management = $mgmt

# --- BIOS / firmware passwords ----------------------------------------------
# Dell, HP and Lenovo business machines report this directly. Others fall back
# to the generic Windows value, which is less reliable.
$bios = [ordered]@{ known = $false; set = $false; source = ''; detail = '' }
$dell = Get-CimInstance -Namespace 'root/dcim/sysman/wmisecurity' -ClassName PasswordObject
if ($dell) {
  $bios.known = $true; $bios.source = 'Dell'
  $on = @($dell | Where-Object { $_.IsPasswordSet -eq 1 } | ForEach-Object { "$($_.NameId)" })
  if ($on.Count) { $bios.set = $true; $bios.detail = ($on -join ', ') + ' password set' }
}
if (-not $bios.known) {
  $hp = Get-CimInstance -Namespace 'root/HP/InstrumentedBIOS' -ClassName HP_BIOSPassword
  if ($hp) {
    $bios.known = $true; $bios.source = 'HP'
    $on = @($hp | Where-Object { $_.IsSet -eq 1 } | ForEach-Object { "$($_.Name)" })
    if ($on.Count) { $bios.set = $true; $bios.detail = ($on -join ', ') + ' set' }
  }
}
if (-not $bios.known) {
  $lv = Get-CimInstance -Namespace 'root/WMI' -ClassName Lenovo_BiosPasswordSettings
  if ($lv) {
    $bios.known = $true; $bios.source = 'Lenovo'
    if ([int]$lv.PasswordState -ne 0) { $bios.set = $true; $bios.detail = 'Supervisor / power-on / drive password set' }
  }
}
if (-not $bios.known) {
  $a = [int]$cs.AdminPasswordStatus; $po = [int]$cs.PowerOnPasswordStatus
  if ((@(0, 1) -contains $a) -or (@(0, 1) -contains $po)) {
    $bios.known = $true; $bios.source = 'generic'
    if ($a -eq 1 -or $po -eq 1) { $bios.set = $true; $bios.detail = 'Firmware reports a password is enabled' }
  }
}
$r.biosPassword = $bios

# --- Stability history (last 30 days) ----------------------------------------
$since = (Get-Date).AddDays(-30)
$r.stability = [ordered]@{
  unexpectedShutdowns = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 41; StartTime = $since }).Count
  bluescreens = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; Id = 1001; StartTime = $since }).Count
  appHangs = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1002; StartTime = $since }).Count
  uptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
}

# --- Windows activation and licence ----------------------------------------
$lic = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" | Select-Object -First 1
$r.activation = [ordered]@{ known = [bool]$lic; activated = ($lic.LicenseStatus -eq 1); channel = "$($lic.ProductKeyChannel)" }
$oa3 = (Get-CimInstance SoftwareLicensingService).OA3xOriginalProductKey
$r.firmwareKey = [bool]$oa3   # true/false only, the key itself is never read out

# --- Windows 11 readiness ---------------------------------------------------
$tpm = [ordered]@{ present = $null; version = $null }
$t = Get-Tpm
if ($t) { $tpm.present = [bool]$t.TpmPresent }
$tw = Get-CimInstance -Namespace 'root/cimv2/security/microsofttpm' -ClassName Win32_Tpm
if ($tw) { $tpm.present = $true; $tpm.version = ("$($tw.SpecVersion)" -split ',')[0].Trim() }
$r.tpm = $tpm
$sb = $null
try { $sb = Confirm-SecureBootUEFI -ErrorAction Stop } catch { $sb = $null }
$r.secureBoot = $sb

# --- Battery ---------------------------------------------------------------
$batt = [ordered]@{ present = [bool](Get-CimInstance Win32_Battery) }
if ($batt.present) {
  $design = (Get-CimInstance -Namespace root/wmi -ClassName BatteryStaticData | Select-Object -First 1).DesignedCapacity
  $full = (Get-CimInstance -Namespace root/wmi -ClassName BatteryFullChargedCapacity | Select-Object -First 1).FullChargedCapacity
  $cycles = (Get-CimInstance -Namespace root/wmi -ClassName BatteryCycleCount | Select-Object -First 1).CycleCount
  $status = Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus | Select-Object -First 1
  if ($design -and $full) { $batt.healthPct = [math]::Round(($full / $design) * 100) }
  $batt.cycles = $cycles
  $batt.charging = [bool]$status.Charging
  $batt.pluggedIn = [bool]$status.PowerOnline
}
$r.battery = $batt

# --- Wireless ---------------------------------------------------------------
$wifiAdapter = Get-NetAdapter -Physical | Where-Object { $_.InterfaceDescription -match 'Wi-?Fi|Wireless|802\.11|WLAN' -or $_.Name -match 'Wi-?Fi|WLAN' } | Select-Object -First 1
$r.wifi = [ordered]@{ present = [bool]$wifiAdapter; up = ("$($wifiAdapter.Status)" -eq 'Up') }
$r.bluetooth = [ordered]@{ present = [bool](Get-PnpDevice -Class Bluetooth -PresentOnly | Where-Object { $_.Status -eq 'OK' }) }

# --- Which parts this machine has (used to skip checks that don't apply) ----
$pnp = Get-PnpDevice -PresentOnly
$r.touch = [bool]($pnp | Where-Object { $_.FriendlyName -match 'touch ?screen' })
$r.fingerprint = [bool](Get-PnpDevice -Class Biometric -PresentOnly)
$r.optical = [bool](Get-CimInstance Win32_CDROMDrive)
$r.cardReader = [bool]($pnp | Where-Object { $_.FriendlyName -match 'card reader|SD Host|SDXC|SD Card|MMC' })
$r.cameras = @($pnp | Where-Object { $_.Class -eq 'Camera' -or $_.Class -eq 'Image' }).Count

# --- User accounts left on the machine --------------------------------------
$skip = @('Public', 'Default', 'Default User', 'All Users')
$r.profiles = @(Get-ChildItem "$($env:SystemDrive)\Users" -Directory | Where-Object { $skip -notcontains $_.Name } | ForEach-Object { $_.Name })

$r | ConvertTo-Json -Depth 5 -Compress
