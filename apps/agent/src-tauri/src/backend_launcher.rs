#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn assign_process_to_job(child: &Child) {
    #[repr(C)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    struct IO_COUNTERS {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        basic_limit_information: JOBOBJECT_BASIC_LIMIT_INFORMATION,
        io_info: IO_COUNTERS,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_limit: usize,
        peak_job_memory_limit: usize,
    }

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x00002000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: u32 = 9;

    unsafe extern "system" {
        fn CreateJobObjectW(lp_job_attributes: *mut std::ffi::c_void, lp_name: *const u16) -> *mut std::ffi::c_void;
        fn SetInformationJobObject(
            h_job: *mut std::ffi::c_void,
            job_object_information_class: u32,
            lp_job_object_information: *const std::ffi::c_void,
            cb_job_object_information_length: u32,
        ) -> i32;
        fn AssignProcessToJobObject(h_job: *mut std::ffi::c_void, h_process: *mut std::ffi::c_void) -> i32;
    }

    unsafe {
        let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if !job.is_null() {
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if ok != 0 {
                let handle = child.as_raw_handle() as *mut std::ffi::c_void;
                let _ = AssignProcessToJobObject(job, handle);
            }
            // Keep job object alive until this process terminates
            Box::leak(Box::new(job));
        }
    }
}

#[cfg(windows)]
fn watch_parent_process(parent_pid: u32, running: Arc<AtomicBool>) {
    unsafe extern "system" {
        fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32) -> *mut std::ffi::c_void;
        fn WaitForSingleObject(h_handle: *mut std::ffi::c_void, dw_milliseconds: u32) -> u32;
        fn CloseHandle(h_object: *mut std::ffi::c_void) -> i32;
    }
    const PROCESS_SYNCHRONIZE: u32 = 0x00100000;
    const INFINITE: u32 = 0xFFFFFFFF;

    thread::spawn(move || {
        unsafe {
            let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, parent_pid);
            if !handle.is_null() {
                WaitForSingleObject(handle, INFINITE);
                CloseHandle(handle);
            }
        }
        running.store(false, Ordering::SeqCst);
    });
}

fn is_port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(300),
    )
    .is_ok()
}

fn get_app_dir() -> PathBuf {
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            return parent.to_path_buf();
        }
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn resolve_node_exe(app_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        app_dir.join("resources").join("node.exe"),
        app_dir.join("node.exe"),
        app_dir.join("bin").join("node.exe"),
        app_dir.join("resources").join("bin").join("node.exe"),
    ];
    for c in &candidates {
        if c.is_file() {
            return Some(c.clone());
        }
    }

    if let Ok(path_var) = env::var("PATH") {
        for p in env::split_paths(&path_var) {
            let candidate = p.join("node.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
            let unix_candidate = p.join("node");
            if unix_candidate.is_file() {
                return Some(unix_candidate);
            }
        }
    }
    None
}

fn resolve_backend_script(app_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    let candidates = [
        // Production: packaged in resources/backend
        (
            app_dir.join("resources").join("backend").join("index.js"),
            app_dir.join("resources").join("backend"),
        ),
        (
            app_dir.join("resources").join("backend").join("dist").join("main.js"),
            app_dir.join("resources").join("backend"),
        ),
        (
            app_dir.join("backend").join("index.js"),
            app_dir.join("backend"),
        ),
        // Dev: relative from src-tauri/target/release or src-tauri/target/debug
        (
            app_dir.join("../../../apps/agent/src-tauri/resources/backend/index.js"),
            app_dir.join("../../../apps/agent/src-tauri/resources/backend"),
        ),
        (
            app_dir.join("../../../apps/backend/dist/main.js"),
            app_dir.join("../../../apps/backend"),
        ),
        (
            app_dir.join("../../backend/dist/main.js"),
            app_dir.join("../../backend"),
        ),
    ];

    for (script, cwd) in candidates {
        if script.is_file() {
            return Some((script, cwd));
        }
    }
    None
}

fn setup_database(app_dir: &Path, cwd: &Path) -> String {
    let app_data = env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| app_dir.to_path_buf());

    let target_dir = app_data.join("Corelyze").join("data");
    let target_db = target_dir.join("corelyze.sqlite");

    if !target_db.exists() {
        let _ = fs::create_dir_all(&target_dir);
        let seed_sources = [
            cwd.join("data").join("corelyze.sqlite"),
            app_dir.join("resources").join("backend").join("data").join("corelyze.sqlite"),
            app_dir.join("resources").join("data").join("corelyze.sqlite"),
            app_dir.join("../../../apps/backend/data/corelyze.sqlite"),
            app_dir.join("../../../apps/agent/src-tauri/resources/backend/data/corelyze.sqlite"),
        ];
        for src in &seed_sources {
            if src.is_file() {
                let _ = fs::copy(src, &target_db);
                break;
            }
        }
    }

    let normalized = target_db.to_string_lossy().replace('\\', "/");
    format!("file:{}", normalized)
}

fn main() {
    let port = env::var("BACKEND_PORT")
        .or_else(|_| env::var("PORT"))
        .unwrap_or_else(|_| "3000".to_string())
        .parse::<u16>()
        .unwrap_or(3000);

    let running = Arc::new(AtomicBool::new(true));

    #[cfg(windows)]
    if let Ok(parent_pid_str) = env::var("CORELYZE_PARENT_PID") {
        if let Ok(parent_pid) = parent_pid_str.parse::<u32>() {
            watch_parent_process(parent_pid, Arc::clone(&running));
        }
    }

    if is_port_open(port) {
        // Backend is already running on this port (e.g. dev mode or previous instance)
        while running.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(500));
        }
        return;
    }

    let app_dir = get_app_dir();
    let node_exe = match resolve_node_exe(&app_dir) {
        Some(p) => p,
        None => {
            eprintln!("Error: node executable not found in resources or PATH");
            return;
        }
    };

    let (script_path, cwd) = match resolve_backend_script(&app_dir) {
        Some(pair) => pair,
        None => {
            eprintln!("Error: backend script (index.js / main.js) not found");
            return;
        }
    };

    let database_url = setup_database(&app_dir, &cwd);

    let mut cmd = Command::new(&node_exe);
    cmd.arg(&script_path)
        .current_dir(&cwd)
        .env("PORT", port.to_string())
        .env("BACKEND_PORT", port.to_string())
        .env("DATABASE_URL", &database_url)
        .env("API_PREFIX", "api")
        .env("NODE_ENV", "production")
        .env("CORS_ORIGIN", "http://localhost:5173");

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to spawn backend child process: {}", e);
            return;
        }
    };

    #[cfg(windows)]
    assign_process_to_job(&child);

    // Wait loop: terminates if parent exits or child exits
    while running.load(Ordering::SeqCst) {
        match child.try_wait() {
            Ok(Some(_status)) => {
                break;
            }
            Ok(None) => {
                thread::sleep(Duration::from_millis(300));
            }
            Err(_) => break,
        }
    }

    let _ = child.kill();
    let _ = child.wait();
}
