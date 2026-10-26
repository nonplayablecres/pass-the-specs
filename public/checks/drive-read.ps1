# Pass the Specs: reads a whole drive (bad sector scan) or measures its read speed.
# READ-ONLY: the drive is opened for reading only, nothing is ever written to it.
# Prints one line per update:  P {...progress...}   and finally  R {...result...}
param(
  [int]$Disk,
  [string]$Mode = 'quick',   # quick | full | speed
  [long]$Size,
  [int]$Hdd = 0,
  [int]$Seconds = 6
)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.ComponentModel;
using System.Globalization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class PtsDisk {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);

  const long MB = 1048576;
  const long ALIGN = 4096;
  static readonly CultureInfo C = CultureInfo.InvariantCulture;

  // .NET won't open \\.\PhysicalDriveN by name, so open the handle ourselves (read-only)
  static FileStream Open(int n) {
    SafeFileHandle h = CreateFile("\\\\.\\PhysicalDrive" + n, 0x80000000u /* GENERIC_READ */, 3u /* share read + write */,
      IntPtr.Zero, 3u /* OPEN_EXISTING */, 0u, IntPtr.Zero);
    if (h.IsInvalid) {
      int err = Marshal.GetLastWin32Error();
      if (err == 5) throw new Exception("Windows blocked reading the drive. Close the app and open it again, choosing Yes when Windows asks.");
      throw new Exception("Couldn't open the drive: " + new Win32Exception(err).Message);
    }
    return new FileStream(h, FileAccess.Read, 4096, false);
  }

  static void Emit(string kind, string json) {
    Console.Out.WriteLine(kind + " " + json);
    Console.Out.Flush();
  }

  static bool TryRead(FileStream fs, byte[] buf, long offset, int length, out double ms) {
    Stopwatch sw = Stopwatch.StartNew();
    try {
      fs.Position = offset;
      int got = 0;
      while (got < length) {
        int r = fs.Read(buf, got, length - got);
        if (r <= 0) break;
        got += r;
      }
      ms = sw.Elapsed.TotalMilliseconds;
      return got == length;
    } catch (IOException) {
      ms = sw.Elapsed.TotalMilliseconds;
      return false;
    }
  }

  // A block failed: re-read it in small pieces to count how much is really unreadable
  static long MeasureBad(FileStream fs, long offset, int length) {
    int piece = 65536;
    byte[] buf = new byte[piece];
    long bad = 0;
    double ms;
    for (long o = offset; o < offset + length; o += piece) {
      if (!TryRead(fs, buf, o, piece, out ms)) bad += piece;
    }
    return bad;
  }

  static string Json(long done, long total, long bad, int slow, List<long> spots, double secs, bool final) {
    StringBuilder sb = new StringBuilder();
    sb.Append("{\"done\":").Append(done.ToString(C));
    sb.Append(",\"total\":").Append(total.ToString(C));
    sb.Append(",\"badBytes\":").Append(bad.ToString(C));
    sb.Append(",\"slow\":").Append(slow.ToString(C));
    sb.Append(",\"seconds\":").Append(secs.ToString("0.###", C));
    sb.Append(",\"speed\":").Append((secs > 0 ? done / (double)MB / secs : 0).ToString("0.##", C));
    sb.Append(",\"badSpots\":[");
    for (int i = 0; i < spots.Count; i++) { if (i > 0) sb.Append(','); sb.Append(spots[i].ToString(C)); }
    sb.Append("]");
    if (!final && done > 0 && secs > 2) sb.Append(",\"eta\":").Append(((total - done) / (double)done * secs).ToString("0", C));
    sb.Append("}");
    return sb.ToString();
  }

  public static void Scan(int n, long size, string mode, bool hdd) {
    size = size / ALIGN * ALIGN;
    int block = (int)(mode == "full" ? 8 * MB : MB);
    double slowMsPerMB = hdd ? 60 : 25; // slower than this = a weak area
    List<long> offsets = new List<long>();
    if (mode == "full") {
      for (long o = 0; o < size; o += block) offsets.Add(o);
    } else {
      long edge = Math.Min(256 * MB, size / 4) / ALIGN * ALIGN;
      for (long o = 0; o < edge; o += block) { offsets.Add(o); offsets.Add((size - edge + o) / ALIGN * ALIGN); }
      int spots = 2000;
      for (int i = 0; i < spots; i++) offsets.Add((long)((size - block) * (i / (double)(spots - 1))) / ALIGN * ALIGN);
    }
    long total = 0;
    foreach (long o in offsets) total += Math.Max(0, Math.Min(block, size - o));

    long done = 0, bad = 0;
    int slow = 0;
    List<long> badSpots = new List<long>();
    Stopwatch sw = Stopwatch.StartNew();
    double lastEmit = 0;
    byte[] buf = new byte[block];
    using (FileStream fs = Open(n)) {
      foreach (long o in offsets) {
        int len = (int)Math.Min(block, size - o);
        if (len <= 0) continue;
        double ms;
        if (!TryRead(fs, buf, o, len, out ms)) {
          long b = MeasureBad(fs, o, len);
          bad += b > 0 ? b : len;
          if (badSpots.Count < 20) badSpots.Add(o / MB);
        } else if (ms / (len / (double)MB) > slowMsPerMB) {
          slow++;
        }
        done += len;
        double now = sw.Elapsed.TotalMilliseconds;
        if (now - lastEmit > 250) { lastEmit = now; Emit("P", Json(done, total, bad, slow, badSpots, now / 1000, false)); }
      }
    }
    Emit("R", Json(done, total, bad, slow, badSpots, sw.Elapsed.TotalSeconds, true));
  }

  // Sequential read straight from the disk with several reads at once, like a benchmark
  public static void Speed(int n, long size, int seconds) {
    long limit = Math.Min(size / ALIGN * ALIGN, 4096 * MB);
    int chunk = (int)(8 * MB);
    long pos = -chunk;
    long bytes = 0;
    Stopwatch sw = Stopwatch.StartNew();
    Exception failed = null;
    List<Thread> threads = new List<Thread>();
    for (int t = 0; t < 4; t++) {
      Thread th = new Thread(() => {
        try {
          using (FileStream fs = Open(n)) {
            byte[] buf = new byte[chunk];
            while (sw.Elapsed.TotalSeconds < seconds) {
              long o = Interlocked.Add(ref pos, chunk) % Math.Max(limit - chunk, ALIGN);
              o = o / ALIGN * ALIGN;
              double ms;
              if (TryRead(fs, buf, o, chunk, out ms)) Interlocked.Add(ref bytes, chunk);
            }
          }
        } catch (Exception e) { failed = e; }
      });
      th.Start();
      threads.Add(th);
    }
    foreach (Thread th in threads) th.Join();
    if (failed != null && bytes == 0) throw failed;
    double secs = sw.Elapsed.TotalSeconds;
    Emit("R", "{\"read\":" + (bytes / (double)MB / secs).ToString("0.##", C) + "}");
  }
}
'@

try {
  if ($Mode -eq 'speed') { [PtsDisk]::Speed($Disk, $Size, $Seconds) }
  else { [PtsDisk]::Scan($Disk, $Size, $Mode, [bool]$Hdd) }
} catch {
  $msg = $_.Exception.Message
  if ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message }
  Write-Output ('E ' + (@{ error = $msg } | ConvertTo-Json -Compress))
  exit 1
}
