#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
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
fn current_timestamp() -> String {
    #[repr(C)]
    struct SYSTEMTIME {
        w_year: u16,
        w_month: u16,
        w_day_of_week: u16,
        w_day: u16,
        w_hour: u16,
        w_minute: u16,
        w_second: u16,
        w_milliseconds: u16,
    }
    unsafe extern "system" {
        fn GetLocalTime(lp_system_time: *mut SYSTEMTIME);
    }
    let mut st: SYSTEMTIME = unsafe { std::mem::zeroed() };
    unsafe { GetLocalTime(&mut st) };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        st.w_year, st.w_month, st.w_day, st.w_hour, st.w_minute, st.w_second, st.w_milliseconds
    )
}

#[cfg(not(windows))]
fn current_timestamp() -> String {
    "0000-00-00 00:00:00.000".to_string()
}

fn log_line(file: &mut File, msg: &str) {
    let line = format!("[{}] {}\r\n", current_timestamp(), msg);
    let _ = file.write_all(line.as_bytes());
    let _ = file.flush();
}

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
            // Keep job object alive until this launcher terminates
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

fn is_port_bindable(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn find_available_port(preferred: u16) -> u16 {
    if is_port_bindable(preferred) {
        return preferred;
    }
    for p in (preferred + 1)..=(preferred + 100) {
        if is_port_bindable(p) {
            return p;
        }
    }
    if let Ok(listener) = TcpListener::bind(("127.0.0.1", 0)) {
        if let Ok(addr) = listener.local_addr() {
            return addr.port();
        }
    }
    preferred
}

fn get_app_dir() -> PathBuf {
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            return parent.to_path_buf();
        }
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn get_corelyze_appdata_dir(app_dir: &Path) -> PathBuf {
    let app_data = env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| app_dir.to_path_buf());
    app_data.join("Corelyze")
}

fn get_log_file(app_dir: &Path) -> (PathBuf, File) {
    let base_dir = get_corelyze_appdata_dir(app_dir);
    let log_dir = base_dir.join("logs");
    let _ = fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("backend.log");

    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(true)
        .open(&log_path)
        .unwrap_or_else(|_| {
            let fallback_path = app_dir.join("backend.log");
            OpenOptions::new()
                .create(true)
                .write(true)
                .append(true)
                .open(&fallback_path)
                .expect("Failed to create log file")
        });

    (log_path, file)
}

fn save_port_to_appdata(app_dir: &Path, port: u16) {
    let base_dir = get_corelyze_appdata_dir(app_dir);
    let _ = fs::create_dir_all(&base_dir);
    let port_file = base_dir.join("port.txt");
    let _ = fs::write(port_file, port.to_string());
}

fn resolve_node_exe(app_dir: &Path, log: &mut File) -> Option<PathBuf> {
    let candidates = [
        app_dir.join("resources").join("node.exe"),
        app_dir.join("node.exe"),
        app_dir.join("../resources").join("node.exe"),
        app_dir.join("../../resources").join("node.exe"),
        app_dir.join("../../../resources").join("node.exe"),
        app_dir.join("bin").join("node.exe"),
        app_dir.join("resources").join("bin").join("node.exe"),
    ];
    for c in &candidates {
        log_line(log, &format!("Verificando ejecutable de Node: {}", c.display()));
        if c.is_file() {
            log_line(log, &format!("Encontrado ejecutable de Node: {}", c.display()));
            return Some(c.clone());
        }
    }

    if let Ok(path_var) = env::var("PATH") {
        for p in env::split_paths(&path_var) {
            let candidate = p.join("node.exe");
            if candidate.is_file() {
                log_line(log, &format!("Encontrado Node en PATH: {}", candidate.display()));
                return Some(candidate);
            }
            let unix_candidate = p.join("node");
            if unix_candidate.is_file() {
                log_line(log, &format!("Encontrado Node en PATH (unix): {}", unix_candidate.display()));
                return Some(unix_candidate);
            }
        }
    }
    None
}

fn resolve_backend_script(app_dir: &Path, log: &mut File) -> Option<(PathBuf, PathBuf)> {
    let candidates = [
        // Producción empaquetada (junto al exe en Program Files o portable)
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
        // Relativo desde binaries/ (dev o ejecución directa)
        (
            app_dir.join("../resources").join("backend").join("index.js"),
            app_dir.join("../resources").join("backend"),
        ),
        // Relativo desde target/release o target/debug
        (
            app_dir.join("../../resources").join("backend").join("index.js"),
            app_dir.join("../../resources").join("backend"),
        ),
        (
            app_dir.join("../../../resources").join("backend").join("index.js"),
            app_dir.join("../../../resources").join("backend"),
        ),
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
        log_line(log, &format!("Buscando script backend en: {}", script.display()));
        if script.is_file() {
            log_line(log, &format!("Script backend encontrado en: {}", script.display()));
            return Some((script, cwd));
        }
    }
    None
}

fn check_prisma_native_dll(log: &mut File, cwd: &Path) {
    #[cfg(windows)]
    unsafe {
        unsafe extern "system" {
            fn LoadLibraryW(lp_lib_file_name: *const u16) -> *mut std::ffi::c_void;
            fn FreeLibrary(h_lib_module: *mut std::ffi::c_void) -> i32;
            fn GetLastError() -> u32;
        }

        let candidates = [
            cwd.join("node_modules").join(".prisma").join("client").join("query_engine-windows.dll.node"),
            cwd.join(".prisma").join("client").join("query_engine-windows.dll.node"),
        ];

        for dll_path in &candidates {
            if dll_path.is_file() {
                log_line(log, &format!("Verificando carga de motor Prisma: {}", dll_path.display()));
                let wide: Vec<u16> = dll_path
                    .to_string_lossy()
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect();
                let handle = LoadLibraryW(wide.as_ptr());
                if handle.is_null() {
                    let code = GetLastError();
                    log_line(
                        log,
                        &format!(
                            "ADVERTENCIA: LoadLibraryW falló para Prisma query engine (Código de error Windows: {}).",
                            code
                        ),
                    );
                    if code == 126 {
                        log_line(
                            log,
                            "El error 126 indica que falta una dependencia DLL (como VC++ 2015-2022 Redistributable: msvcp140.dll o vcruntime140.dll).",
                        );
                    }
                } else {
                    log_line(log, "Motor nativo de Prisma (.dll.node) validado y cargado correctamente.");
                    FreeLibrary(handle);
                }
                return;
            }
        }
        log_line(log, "Aviso: query_engine-windows.dll.node no encontrado en las rutas estándar.");
    }
}

fn setup_database(app_dir: &Path, cwd: &Path, log: &mut File) -> String {
    let base_dir = get_corelyze_appdata_dir(app_dir);
    let target_dir = base_dir.join("data");
    let target_db = target_dir.join("corelyze.sqlite");

    if !target_db.exists() {
        log_line(log, &format!("Base de datos local no existe en {}. Creando carpeta y buscando seed...", target_db.display()));
        let _ = fs::create_dir_all(&target_dir);
        let seed_sources = [
            cwd.join("data").join("corelyze.sqlite"),
            app_dir.join("resources").join("backend").join("data").join("corelyze.sqlite"),
            app_dir.join("../resources").join("backend").join("data").join("corelyze.sqlite"),
            app_dir.join("../../resources").join("backend").join("data").join("corelyze.sqlite"),
            app_dir.join("resources").join("data").join("corelyze.sqlite"),
            app_dir.join("../../../apps/backend/data/corelyze.sqlite"),
            app_dir.join("../../../apps/agent/src-tauri/resources/backend/data/corelyze.sqlite"),
        ];
        let mut copied = false;
        for src in &seed_sources {
            if src.is_file() {
                log_line(log, &format!("Copiando seed inicial desde: {}", src.display()));
                if let Err(e) = fs::copy(src, &target_db) {
                    log_line(log, &format!("Error al copiar seed DB: {}", e));
                } else {
                    copied = true;
                    log_line(log, "Seed DB copiado con éxito.");
                }
                break;
            }
        }
        if !copied {
            log_line(log, "Aviso: No se encontró seed SQLite previo. Prisma inicializará un archivo nuevo si es necesario.");
        }
    } else {
        log_line(log, &format!("Base de datos local existente encontrada en: {}", target_db.display()));
    }

    let normalized = target_db.to_string_lossy().replace('\\', "/");
    let db_url = format!("file:{}", normalized);
    log_line(log, &format!("DATABASE_URL resuelta: {}", db_url));
    db_url
}

fn main() {
    let app_dir = get_app_dir();
    let (log_path, mut log) = get_log_file(&app_dir);

    log_line(&mut log, "================================================================================");
    log_line(&mut log, "Corelyze Backend Sidecar Launcher Iniciado");
    log_line(&mut log, &format!("Launcher PID: {}", std::process::id()));
    log_line(&mut log, &format!("Directorio de la aplicación (app_dir): {}", app_dir.display()));
    log_line(&mut log, &format!("Archivo de registro de eventos: {}", log_path.display()));

    // Resolución de puerto dinámico/libre
    let preferred_port = env::var("BACKEND_PORT")
        .or_else(|_| env::var("PORT"))
        .unwrap_or_else(|_| "49152".to_string())
        .parse::<u16>()
        .unwrap_or(49152);

    let active_port = find_available_port(preferred_port);
    save_port_to_appdata(&app_dir, active_port);
    log_line(&mut log, &format!("Puerto preferido: {}, Puerto asignado disponible: {}", preferred_port, active_port));

    let running = Arc::new(AtomicBool::new(true));

    #[cfg(windows)]
    if let Ok(parent_pid_str) = env::var("CORELYZE_PARENT_PID") {
        if let Ok(parent_pid) = parent_pid_str.parse::<u32>() {
            log_line(&mut log, &format!("Monitorizando proceso padre Tauri con PID: {}", parent_pid));
            watch_parent_process(parent_pid, Arc::clone(&running));
        }
    }

    let node_exe = match resolve_node_exe(&app_dir, &mut log) {
        Some(p) => p,
        None => {
            log_line(&mut log, "ERROR CRÍTICO: No se encontró el ejecutable de Node.js en resources ni en PATH.");
            return;
        }
    };

    let (script_path, cwd) = match resolve_backend_script(&app_dir, &mut log) {
        Some(pair) => pair,
        None => {
            log_line(&mut log, "ERROR CRÍTICO: No se encontró el script de backend (index.js / main.js).");
            return;
        }
    };

    check_prisma_native_dll(&mut log, &cwd);
    let database_url = setup_database(&app_dir, &cwd, &mut log);

    // Preparación y redirección de stdout / stderr hacia backend.log
    let stdout_handle = OpenOptions::new().create(true).write(true).append(true).open(&log_path);
    let stderr_handle = OpenOptions::new().create(true).write(true).append(true).open(&log_path);

    let mut cmd = Command::new(&node_exe);
    cmd.arg(&script_path)
        .current_dir(&cwd)
        .env("PORT", active_port.to_string())
        .env("BACKEND_PORT", active_port.to_string())
        .env("DATABASE_URL", &database_url)
        .env("API_PREFIX", "api")
        .env("NODE_ENV", "production")
        .env("CORS_ORIGIN", "*");

    if let Ok(stdout_file) = stdout_handle {
        cmd.stdout(Stdio::from(stdout_file));
    }
    if let Ok(stderr_file) = stderr_handle {
        cmd.stderr(Stdio::from(stderr_file));
    }

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    log_line(&mut log, &format!("Ejecutando proceso: {} \"{}\"", node_exe.display(), script_path.display()));
    log_line(&mut log, &format!("Directorio de trabajo: {}", cwd.display()));

    let mut child = match cmd.spawn() {
        Ok(c) => {
            log_line(&mut log, &format!("Proceso hijo de Node.js lanzado exitosamente con PID: {}", c.id()));
            c
        }
        Err(e) => {
            log_line(&mut log, &format!("ERROR CRÍTICO: Fallo al lanzar proceso hijo de Node.js: {}", e));
            return;
        }
    };

    #[cfg(windows)]
    assign_process_to_job(&child);

    // Bucle de supervisión del proceso hijo y proceso padre
    let mut check_count = 0;
    while running.load(Ordering::SeqCst) {
        match child.try_wait() {
            Ok(Some(status)) => {
                log_line(&mut log, &format!("El proceso backend terminó con estado: {:?}", status));
                break;
            }
            Ok(None) => {
                thread::sleep(Duration::from_millis(300));
                check_count += 1;
                if check_count == 10 {
                    log_line(&mut log, "El proceso backend continúa ejecutándose normalmente tras los primeros 3 segundos.");
                }
            }
            Err(e) => {
                log_line(&mut log, &format!("Error al verificar estado del proceso hijo: {}", e));
                break;
            }
        }
    }

    if !running.load(Ordering::SeqCst) {
        log_line(&mut log, "Señal de cierre recibida desde el proceso padre. Finalizando backend...");
    }

    let _ = child.kill();
    let _ = child.wait();
    log_line(&mut log, "Launcher de Corelyze finalizado.");
    log_line(&mut log, "================================================================================");
}
