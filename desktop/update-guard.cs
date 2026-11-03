using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Fixed-purpose updater helper. It can inspect/stop only Agent Studio.exe
// from the exact supplied installation; it accepts no executable or PID.
class StudioUpdateGuard {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr handle, int flags, StringBuilder value, ref int size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr handle, uint code);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static string Normalize(string value) {
    if (String.IsNullOrWhiteSpace(value) || value.Length > 1000 || value.IndexOfAny(new char[]{'\r','\n','\0','"'}) >= 0 || value.StartsWith("\\\\")) throw new Exception("invalid_installation");
    string root=Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar);
    if (root.Length < 4 || root[1] != ':' || root[2] != '\\') throw new Exception("invalid_installation");
    for (DirectoryInfo dir=new DirectoryInfo(root); dir != null; dir=dir.Parent)
      if (dir.Exists && (dir.Attributes & FileAttributes.ReparsePoint) != 0) throw new Exception("installation_link_refused");
    return root;
  }
  static int Processes(string target, bool stop) {
    int found=0;
    foreach (Process process in Process.GetProcessesByName("Agent Studio")) {
      using (process) {
        IntPtr handle=OpenProcess(0x1000 | 0x100000 | (stop ? 1u : 0u), false, process.Id);
        if (handle == IntPtr.Zero) { if (process.HasExited) continue; throw new Exception("process_identity_unavailable"); }
        try {
          var image=new StringBuilder(32768); int length=image.Capacity;
          if (!QueryFullProcessImageName(handle,0,image,ref length)) {
            if (WaitForSingleObject(handle,0) == 0) continue;
            throw new Exception("process_identity_unavailable");
          }
          if (!String.Equals(Path.GetFullPath(image.ToString()),target,StringComparison.OrdinalIgnoreCase)) continue;
          found++;
          // The identity is verified on the same handle used for termination.
          if (stop && WaitForSingleObject(handle,0) != 0) {
            if (!TerminateProcess(handle,0) || WaitForSingleObject(handle,10000) != 0) throw new Exception("application_exit_pending");
          }
        } finally { CloseHandle(handle); }
      }
    }
    return found;
  }
  static void Unlocked(string root) {
    if (!Directory.Exists(root)) return;
    var files=new System.Collections.Generic.List<string>();
    foreach (string file in Directory.GetFiles(root)) {
      string ext=Path.GetExtension(file).ToLowerInvariant();
      if (ext == ".exe" || ext == ".dll" || ext == ".pak") files.Add(file);
    }
    files.Add(Path.Combine(root,"resources","app.asar"));
    files.Add(Path.Combine(root,"resources","connector","runtime","node.exe"));
    foreach (string file in files) if (File.Exists(file)) {
      if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) throw new Exception("installation_link_refused");
      using (var stream=new FileStream(file,FileMode.Open,FileAccess.ReadWrite,FileShare.None)) { }
    }
  }
  static int Main(string[] args) {
    Console.OutputEncoding=new UTF8Encoding(false);
    try {
      if (args.Length != 2 || (args[0] != "--check" && args[0] != "--stop")) throw new Exception("invalid_guard_arguments");
      string root=Normalize(args[1]),target=Path.Combine(root,"Agent Studio.exe"); bool stop=args[0] == "--stop";
      int stopped=0;
      for (int pass=0;pass<10;pass++) {
        int found=Processes(target,stop); if (!stop && found != 0) throw new Exception("application_running");
        if (found == 0) { Unlocked(root); Console.WriteLine("{\"ok\":true,\"stopped\":"+stopped+",\"filesUnlocked\":true}"); return 0; }
        stopped+=found; Thread.Sleep(100);
      }
      throw new Exception("application_exit_pending");
    } catch (IOException) { Console.WriteLine("{\"ok\":false,\"error\":\"installation_files_busy\"}"); return 2; }
      catch (Exception e) { Console.WriteLine("{\"ok\":false,\"error\":\""+(e.Message.IndexOf(' ') < 0 ? e.Message : "update_guard_failed")+"\"}"); return 2; }
  }
}
