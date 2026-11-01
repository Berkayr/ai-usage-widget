//! Bounded local child execution. Never returns raw provider stderr to the webview.
use std::{io::Read, process::{Child, Command, Stdio}, thread, time::{Duration, Instant}};
const MAX_OUTPUT: u64 = 1024 * 1024;

#[cfg(windows)]
struct ProcessTree(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl ProcessTree {
    fn attach(child: &Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() { return Err("Collector job creation failed".into()); }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info as *const _ as _, std::mem::size_of_val(&info) as u32) == 0
                || AssignProcessToJobObject(job, child.as_raw_handle() as _) == 0 {
                CloseHandle(job);
                return Err("Collector job assignment failed".into());
            }
            Ok(Self(job))
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) { unsafe { windows_sys::Win32::Foundation::CloseHandle(self.0); } }
}
#[cfg(unix)]
struct ProcessTree(i32);
#[cfg(unix)]
impl ProcessTree {
    fn attach(child: &Child) -> Result<Self, String> { Ok(Self(child.id() as i32)) }
}
#[cfg(unix)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        extern "C" { fn kill(pid: i32, sig: i32) -> i32; }
        // Child was spawned in its own process group; also stop its provider tools.
        unsafe { kill(-self.0, 9); }
    }
}

pub(super) fn run(mut command: Command, deadline: Duration) -> Result<Vec<u8>, String> {
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(unix)] { use std::os::unix::process::CommandExt; command.process_group(0); }
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let mut child = command.spawn().map_err(|_| "Collector could not start")?;
    let tree = match ProcessTree::attach(&child) {
        Ok(tree) => tree,
        Err(error) => { let _=child.kill(); let _=child.wait(); return Err(error); }
    };
    let stdout = child.stdout.take().ok_or("Collector stdout unavailable")?;
    let (sender, receiver) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stdout.take(MAX_OUTPUT + 1).read_to_end(&mut bytes);
        let _ = sender.send((result, bytes));
    });
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < deadline => thread::sleep(Duration::from_millis(20)),
            _ => {
                drop(tree);
                let _=child.kill(); let _=child.wait();
                return Err("Collector timed out or could not be monitored".into());
            }
        }
    };
    drop(tree); // no provider descendants should outlive a collection
    let (result, bytes) = receiver.recv_timeout(Duration::from_secs(1)).map_err(|_| "Collector output timed out")?;
    result.map_err(|_| "Collector output unavailable")?;
    if bytes.len() as u64 > MAX_OUTPUT { return Err("Collector output exceeds 1 MiB".into()); }
    if !status.success() { return Err("Collector failed; run quotacore doctor for local diagnostics".into()); }
    Ok(bytes)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    fn python(code: &str) -> Command { let mut cmd=Command::new("python3"); cmd.args(["-c",code]); cmd }
    #[test]
    fn captures_fictional_output() {
        assert_eq!(run(python("print('fictional')"),Duration::from_secs(2)).unwrap(),b"fictional\n");
    }
    #[test]
    fn bounds_runtime_and_output() {
        assert!(run(python("import time;time.sleep(30)"),Duration::from_millis(50)).unwrap_err().contains("timed out"));
        assert!(run(python("import sys;sys.stdout.write('x'*2000000)"),Duration::from_secs(2)).unwrap_err().contains("1 MiB"));
    }
    #[test]
    fn stops_descendants_holding_stdout() {
        let start=Instant::now();
        run(python("import subprocess;subprocess.Popen(['sleep','30']);print('fixture')"),Duration::from_secs(2)).unwrap();
        assert!(start.elapsed()<Duration::from_secs(2));
    }
}
