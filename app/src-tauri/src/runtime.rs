//! Interpreter selection is independent of provider collection and never installs anything.
use std::{ffi::OsStr, path::{Path, PathBuf}, process::Command, sync::OnceLock, time::Duration};
use serde::Serialize;

static RESOURCES: OnceLock<PathBuf> = OnceLock::new();

pub fn configure(root: PathBuf) { let _ = RESOURCES.set(root); }

#[derive(Clone, Debug, Serialize)]
pub struct Runtime {
    pub source: &'static str,
    pub executable: PathBuf,
    pub version: String,
    launcher: bool,
}
impl Runtime {
    fn command(&self) -> Command {
        let mut command = Command::new(&self.executable);
        if self.launcher { command.arg("-3"); }
        // Never let the Windows install manager download a missing runtime.
        command.env_remove("PYLAUNCHER_ALLOW_INSTALL")
            .env_remove("PYLAUNCHER_ALWAYS_INSTALL").env_remove("PYLAUNCHER_DRYRUN")
            .env("PYTHON_MANAGER_AUTOMATIC_INSTALL", "false");
        command
    }
    pub fn collector(&self, root: &Path, operation: &str, extra: &[String]) -> Command {
        let mut command = self.command();
        command.args(["-S", "-s", "-m", "quotacore", operation]).args(extra)
            .current_dir(root).env("PYTHONPATH", root).env_remove("PYTHONHOME")
            .env("PYTHONDONTWRITEBYTECODE", "1").env("QUOTACORE_RUNTIME_SOURCE", self.source);
        command
    }
}

fn supported(version: &str) -> bool {
    let Some(version) = version.trim().strip_prefix("Python ") else { return false; };
    let mut parts = version.split('.');
    matches!((parts.next(), parts.next().and_then(|v| v.parse::<u32>().ok())), (Some("3"), Some(minor)) if minor >= 10)
}
fn probe(candidate: &Runtime) -> Option<String> {
    let mut command = candidate.command();
    command.args(["-I", "-S", "--version"]).env_remove("PYTHONHOME");
    let bytes = super::collector::run(command, Duration::from_secs(5)).ok()?;
    let version = String::from_utf8(bytes).ok()?.trim().to_owned();
    supported(&version).then_some(version)
}
fn choose(root: &Path, override_path: Option<&OsStr>, windows: bool,
          mut version: impl FnMut(&Runtime) -> Option<String>) -> Result<Runtime, String> {
    let candidate = |source, executable, launcher| Runtime { source, executable, launcher, version: String::new() };
    let validate = |mut runtime: Runtime, version: &mut dyn FnMut(&Runtime) -> Option<String>| {
        runtime.version = version(&runtime).filter(|v| supported(v))?;
        Some(runtime)
    };
    if let Some(path) = override_path {
        return validate(candidate("override", PathBuf::from(path), false), &mut version)
            .ok_or_else(|| "QUOTACORE_PYTHON must name a working Python 3.10+ executable (no arguments).".into());
    }
    let embedded = root.join("python/python.exe");
    if windows && embedded.is_file() {
        return validate(candidate("embedded", embedded, false), &mut version)
            .ok_or_else(|| "Bundled Python is damaged. Reinstall the with-Python package.".into());
    }
    let names: &[(&str, bool)] = if windows { &[("py", true), ("python3", false), ("python", false)] }
                               else { &[("python3", false), ("python", false)] };
    for (name, launcher) in names {
        if let Some(runtime) = validate(candidate("system", PathBuf::from(name), *launcher), &mut version) { return Ok(runtime); }
    }
    Err(if windows {
        "Python 3.10+ was not found. Install the with-Python edition, or install Python and restart the widget."
    } else {
        "Python 3.10+ was not found. Install python3 with your package manager (Debian/Ubuntu: apt install python3; Fedora: dnf install python3; Arch: pacman -S python), then restart the widget."
    }.into())
}
pub fn resources() -> Result<&'static Path, String> {
    RESOURCES.get().map(PathBuf::as_path).filter(|p| p.join("quotacore/__main__.py").is_file())
        .ok_or_else(|| "Packaged quotacore sources are missing. Reinstall the widget.".into())
}
pub fn select(root: &Path) -> Result<Runtime, String> {
    choose(root, std::env::var_os("QUOTACORE_PYTHON").as_deref(), cfg!(windows), probe)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn versions_require_python_310() {
        for version in ["Python 3.10.0", "Python 3.13.17", "Python 3.14.0rc1"] { assert!(supported(version)); }
        for version in ["Python 2.7.18", "Python 3.9.20", "Python 4.0.0", "garbage"] { assert!(!supported(version)); }
    }
    #[test]
    fn override_precedes_system_and_invalid_override_does_not_fall_back() {
        let root = Path::new("fictional");
        let value = choose(root, Some(OsStr::new("custom-python")), false, |r| {
            assert_eq!(r.executable, PathBuf::from("custom-python")); Some("Python 3.12.0".into())
        }).unwrap();
        assert_eq!(value.source, "override");
        assert!(choose(root, Some(OsStr::new("missing")), false, |_| None).is_err());
    }
    #[test]
    fn falls_back_past_missing_and_old_system_versions() {
        let mut calls = Vec::new();
        let value = choose(Path::new("fictional"), None, true, |r| {
            calls.push(r.executable.clone());
            match r.executable.to_str().unwrap() { "py" => None, "python3" => Some("Python 3.9.0".into()), _ => Some("Python 3.10.1".into()) }
        }).unwrap();
        assert_eq!(value.source, "system"); assert_eq!(calls.len(), 3);
        assert!(choose(Path::new("fictional"), None, false, |_| None).unwrap_err().contains("apt install"));
    }
    #[test]
    fn embedded_precedes_system() {
        let root = std::env::temp_dir().join(format!("quotacore-runtime-{}", std::process::id()));
        std::fs::create_dir_all(root.join("python")).unwrap();
        std::fs::write(root.join("python/python.exe"), b"fixture").unwrap();
        let selected = choose(&root, None, true, |r| {
            assert_eq!(r.source, "embedded"); Some("Python 3.13.17".into())
        }).unwrap();
        assert_eq!(selected.source, "embedded");
        assert!(choose(&root, None, true, |_| None).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn linux_real_system_and_explicit_override() {
        let system = choose(Path::new("/tmp"), None, false, probe).unwrap();
        assert_eq!(system.source, "system");
        let overridden = choose(Path::new("/tmp"), Some(system.executable.as_os_str()), false, probe).unwrap();
        assert_eq!(overridden.source, "override");
        assert_eq!(overridden.version, system.version);
        let command = overridden.collector(Path::new("/tmp"), "doctor", &[]);
        assert_eq!(command.get_current_dir(), Some(Path::new("/tmp")));
        for key in ["PYLAUNCHER_ALLOW_INSTALL", "PYLAUNCHER_ALWAYS_INSTALL", "PYLAUNCHER_DRYRUN"] {
            assert!(command.get_envs().any(|(name, value)| name == key && value.is_none()));
        }
        assert!(command.get_envs().any(|(name, value)| name == "PYTHON_MANAGER_AUTOMATIC_INSTALL" && value == Some(OsStr::new("false"))));
        assert!(command.get_envs().any(|(key, value)| key == "PYTHONPATH" && value == Some(OsStr::new("/tmp"))));
    }
    #[cfg(unix)]
    #[test]
    fn collector_uses_resource_sources_without_site_packages() {
        let root = std::env::temp_dir().join(format!("quotacore-resource-test-{}", std::process::id()));
        std::fs::create_dir_all(root.join("quotacore")).unwrap();
        std::fs::write(root.join("quotacore/__init__.py"), "").unwrap();
        std::fs::write(root.join("quotacore/__main__.py"),
            "import json,os,sys; print(json.dumps({'source':os.environ['QUOTACORE_RUNTIME_SOURCE'],'site':'site' in sys.modules,'module':__file__}))").unwrap();
        // A sitecustomize in the resource directory must never run either.
        std::fs::write(root.join("sitecustomize.py"), "raise RuntimeError('site must be disabled')").unwrap();
        let runtime = choose(&root, None, false, probe).unwrap();
        let bytes = super::super::collector::run(runtime.collector(&root, "doctor", &[]), Duration::from_secs(5)).unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["source"], "system"); assert_eq!(value["site"], false);
        assert_eq!(Path::new(value["module"].as_str().unwrap()), root.join("quotacore/__main__.py"));
        std::fs::remove_dir_all(root).unwrap();
    }

}
