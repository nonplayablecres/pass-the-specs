# Pass the Specs: lists physical drives with their health details. Read-only.
# Output: JSON array, one entry per drive.
$ErrorActionPreference = 'SilentlyContinue'

$bootDisks = @(Get-Disk | Where-Object { $_.IsBoot -or $_.IsSystem } | ForEach-Object { [int]$_.Number })
$wmiDisks = @(Get-CimInstance Win32_DiskDrive)
$predictData = @(Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictData)
$predictStatus = @(Get-CimInstance -Namespace root\wmi -ClassName MSStorageDriver_FailurePredictStatus)

# SATA SMART attributes we care about -> raw values
$wanted = @(5, 9, 187, 194, 196, 197, 198, 199, 231, 233)
function Read-Smart($bytes) {
  $out = @{}
  if (-not $bytes) { return $out }
  for ($i = 2; $i -le $bytes.Length - 12; $i += 12) {
    $id = [int]$bytes[$i]
    if ($id -eq 0) { continue }
    if ($wanted -contains $id) {
      $raw = [int64]0
      for ($b = 5; $b -ge 0; $b--) { $raw = ($raw * 256) + [int64]$bytes[$i + 5 + $b] }
      if ($id -eq 194) { $raw = $raw -band 0xFF }
      $out["$id"] = @{ raw = $raw; value = [int]$bytes[$i + 3]; worst = [int]$bytes[$i + 4] }
    }
  }
  return $out
}

$out = @()
foreach ($pd in Get-PhysicalDisk) {
  $n = [int]$pd.DeviceId
  $rc = $pd | Get-StorageReliabilityCounter
  $w = $wmiDisks | Where-Object { $_.Index -eq $n } | Select-Object -First 1
  $smart = @{}
  $predict = $null
  if ($w -and $w.PNPDeviceID) {
    $pnp = [string]$w.PNPDeviceID
    $f = $predictData | Where-Object { ([string]$_.InstanceName).ToUpper().StartsWith($pnp.ToUpper()) } | Select-Object -First 1
    if ($f) { $smart = Read-Smart $f.VendorSpecific }
    $s = $predictStatus | Where-Object { ([string]$_.InstanceName).ToUpper().StartsWith($pnp.ToUpper()) } | Select-Object -First 1
    if ($s) { $predict = [bool]$s.PredictFailure }
  }
  $vols = @()
  foreach ($p in @(Get-Partition -DiskNumber $n | Where-Object { $_.DriveLetter })) {
    $v = Get-Volume -DriveLetter $p.DriveLetter
    if ($v) { $vols += @{ letter = [string]$p.DriveLetter; label = [string]$v.FileSystemLabel; fs = [string]$v.FileSystem; size = [int64]$v.Size; free = [int64]$v.SizeRemaining } }
  }
  $out += [pscustomobject]@{
    number = $n
    model = ([string]$pd.FriendlyName).Trim()
    serial = ([string]$pd.SerialNumber).Trim()
    firmware = [string]$pd.FirmwareVersion
    media = [string]$pd.MediaType
    bus = [string]$pd.BusType
    spindle = $pd.SpindleSpeed
    sizeBytes = [int64]$pd.Size
    sector = [int]$pd.PhysicalSectorSize
    health = [string]$pd.HealthStatus
    boot = ($bootDisks -contains $n)
    temp = $rc.Temperature
    wear = $rc.Wear
    hours = $rc.PowerOnHours
    readErrors = $rc.ReadErrorsUncorrected
    writeErrors = $rc.WriteErrorsUncorrected
    predictFail = $predict
    smart = $smart
    volumes = $vols
  }
}
ConvertTo-Json -Depth 6 -Compress -InputObject @($out)
