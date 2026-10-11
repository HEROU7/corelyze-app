use serde::Serialize;
use serde_json::Value;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    name: String,
    #[serde(rename = "vramGB")]
    vram_gb: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotherboardInfo {
    manufacturer: String,
    model: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    model: String,
    kind: String,
    #[serde(rename = "capacityGB")]
    capacity_gb: f64,
    #[serde(rename = "freeGB")]
    free_gb: f64,
    #[serde(rename = "smartStatus")]
    smart_status: String,
    #[serde(rename = "predictFailure")]
    predict_failure: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverIssue {
    device: String,
    class: String,
    error_code: u32,
    problem: String,
    recommendation: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    hostname: String,
    platform: String,
    arch: String,
    cpu_model: String,
    cpu_cores: u32,
    cpu_logical: u32,
    cpu_speed_ghz: f64,
    #[serde(rename = "totalMemoryGB")]
    total_memory_gb: f64,
    #[serde(rename = "freeMemoryGB")]
    free_memory_gb: f64,
    gpus: Vec<GpuInfo>,
    motherboard: Option<MotherboardInfo>,
    storage: Vec<StorageInfo>,
    driver_issues: Vec<DriverIssue>,
    source: String,
}

fn run_command(cmd: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(cmd).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn windows_command(script: &str) -> Option<String> {
    run_command("powershell", &["-NoProfile", "-Command", script])
}

fn gb_from_bytes(bytes: f64) -> f64 {
    if bytes <= 0.0 {
        return 0.0;
    }
    ((bytes / 1024.0 / 1024.0 / 1024.0) * 100.0).round() / 100.0
}

fn gb_from_kb(kb: f64) -> f64 {
    gb_from_bytes(kb * 1024.0)
}

fn as_array(value: Option<&Value>) -> Vec<&Value> {
    match value {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(other) if !other.is_null() => vec![other],
        _ => Vec::new(),
    }
}

fn json_str(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn json_f64(value: &Value, key: &str) -> f64 {
    value.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0)
}

fn json_u32(value: &Value, key: &str) -> u32 {
    value
        .get(key)
        .and_then(|v| v.as_f64())
        .map(|n| n.max(0.0) as u32)
        .unwrap_or(0)
}

fn json_bool(value: &Value, key: &str) -> bool {
    value.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

const WIN_HW_SCRIPT: &str = r#"
$out = [ordered]@{}
try {
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  if ($cpu) {
    $out.cpu = [ordered]@{ name = [string]$cpu.Name; cores = [int]$cpu.NumberOfCores; logical = [int]$cpu.NumberOfLogicalProcessors; speedMhz = [double]$cpu.MaxClockSpeed }
  }
} catch {}
try {
  $mb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
  if ($mb) { $out.motherboard = [ordered]@{ manufacturer = [string]$mb.Manufacturer; model = [string]$mb.Product } }
} catch {}
try {
  $os = Get-CimInstance Win32_OperatingSystem
  if ($os) { $out.memory = [ordered]@{ totalKb = [double]$os.TotalVisibleMemorySize; freeKb = [double]$os.FreePhysicalMemory } }
} catch {}
try {
  $regPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
  $regVram = @{}
  Get-ChildItem $regPath -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    $adapter = [string]$p.'HardwareInformation.AdapterString'
    $qw = $p.'HardwareInformation.qwMemorySize'
    if ($adapter -and $qw) { $regVram[$adapter] = [double]$qw }
  }
  $gpuList = @()
  foreach ($g in (Get-CimInstance Win32_VideoController)) {
    $vram = 0.0
    if ($regVram.ContainsKey([string]$g.Name)) { $vram = $regVram[[string]$g.Name] }
    if ($vram -le 0 -and $g.AdapterRAM) { $vram = [double]$g.AdapterRAM }
    $gpuList += [ordered]@{ name = [string]$g.Name; vramBytes = $vram }
  }
  $out.gpus = $gpuList
} catch {}
try {
  $disks = @()
  foreach ($d in (Get-CimInstance Win32_DiskDrive)) {
    $disks += [ordered]@{ model = [string]$d.Model; serial = [string]$d.SerialNumber; sizeBytes = [double]$d.Size; mediaType = [string]$d.MediaType }
  }
  $out.disks = $disks
} catch {}
try {
  $vols = @()
  foreach ($v in (Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3")) {
    $vols += [ordered]@{ sizeBytes = [double]$v.Size; freeBytes = [double]$v.FreeSpace }
  }
  $out.volumes = $vols
} catch {}
try {
  $issues = @()
  Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object {
    $_.ConfigManagerErrorCode -and $_.ConfigManagerErrorCode -ne 0
  } | ForEach-Object {
    $issues += [ordered]@{ device = [string]$_.Name; class = [string]$_.PNPClass; errorCode = [int]$_.ConfigManagerErrorCode; problem = [string]$_.ConfigManagerErrorDescription }
  }
  $out.driverIssues = $issues
} catch {}
try {
  $smart = @()
  foreach ($pd in (Get-PhysicalDisk -ErrorAction SilentlyContinue)) {
    $rc = $pd | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
    $temp = 0.0; $wear = -1
    if ($rc) {
      if ($null -ne $rc.Temperature) { $temp = [double]$rc.Temperature }
      if ($null -ne $rc.Wear) { $wear = [int]$rc.Wear }
    }
    $health = [string]$pd.HealthStatus
    $smart += [ordered]@{
      friendlyName = [string]$pd.FriendlyName
      serial = [string]$pd.SerialNumber
      mediaType = [string]$pd.MediaType
      healthStatus = $health
      predictFailure = ($health -eq 'Unhealthy' -or $health -eq 'Warning')
      temperatureC = $temp
      wear = $wear
    }
  }
  $out.smart = $smart
} catch {}
$out | ConvertTo-Json -Depth 6 -Compress
"#;

fn classify_storage(model: &str, media_type: &str) -> String {
    let haystack = format!("{} {}", model, media_type).to_lowercase();
    if haystack.contains("ssd") || haystack.contains("nvme") || haystack.contains("solid") {
        "SSD".to_string()
    } else if haystack.contains("hdd") || haystack.contains("hard disk") {
        "HDD".to_string()
    } else {
        "Desconocido".to_string()
    }
}

fn driver_recommendation(code: u32, class: &str) -> String {
    let device_class = class.to_lowercase();
    match code {
        28 => "No hay un controlador instalado. Instala el driver oficial del fabricante; si es una GPU, usa DDU para limpiar el controlador anterior.".to_string(),
        43 => "El dispositivo reportó un problema detectado por Windows. Reinstala el controlador (para GPU usa DDU en modo seguro) o evalúa un fallo físico del componente.".to_string(),
        22 => "El dispositivo está deshabilitado. Habilítalo en el Administrador de dispositivos (Ver > Mostrar dispositivos ocultos).".to_string(),
        31 => format!("Windows no pudo cargar el controlador de {device_class} correctamente. Actualiza o reinstala desde el sitio del fabricante."),
        10 => format!("El dispositivo {device_class} no pudo iniciarse (Código 10). Actualiza o reinstala el driver y verifica firmware/BIOS."),
        _ => "Revisa el código de error en el Administrador de dispositivos y actualiza o reinstala el controlador del fabricante.".to_string(),
    }
}

fn smart_status_for(model: &str, serial: &str, smart: &[&Value]) -> (String, bool) {
    if smart.is_empty() {
        return ("N/A".to_string(), false);
    }
    let model_l = model.to_lowercase();
    let serial_l = serial.trim().to_lowercase();
    for s in smart {
        let fname = json_str(s, "friendlyName").to_lowercase();
        let sserial = json_str(s, "serial").trim().to_lowercase();
        let matches = (!sserial.is_empty() && !serial_l.is_empty() && sserial == serial_l)
            || (!fname.is_empty() && !model_l.is_empty() && (fname.contains(&model_l) || model_l.contains(&fname)));
        if matches {
            let health = json_str(s, "healthStatus");
            let predict = json_bool(s, "predictFailure");
            let status = if health.eq_ignore_ascii_case("Healthy") {
                "OK".to_string()
            } else if health.eq_ignore_ascii_case("Warning") {
                "Atencion".to_string()
            } else if health.eq_ignore_ascii_case("Unhealthy") || health.eq_ignore_ascii_case("Failing") {
                "Fallo".to_string()
            } else {
                "N/A".to_string()
            };
            return (status, predict);
        }
    }
    ("N/A".to_string(), false)
}

fn scan_windows() -> Option<Value> {
    let raw = windows_command(WIN_HW_SCRIPT)?;
    serde_json::from_str::<Value>(&raw).ok()
}

fn windows_hardware() -> HardwareInfo {
    let value = scan_windows();

    let cpu = value.as_ref().and_then(|v| v.get("cpu"));
    let memory = value.as_ref().and_then(|v| v.get("memory"));
    let motherboard = value.as_ref().and_then(|v| v.get("motherboard"));

    let gpus: Vec<GpuInfo> = value
        .as_ref()
        .and_then(|v| v.get("gpus"))
        .map(|v| {
            as_array(Some(v))
                .into_iter()
                .filter_map(|g| {
                    let name = json_str(g, "name");
                    if name.is_empty() {
                        return None;
                    }
                    let vram_bytes = json_f64(g, "vramBytes");
                    Some(GpuInfo {
                        name,
                        vram_gb: if vram_bytes > 0.0 {
                            Some(gb_from_bytes(vram_bytes))
                        } else {
                            None
                        },
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let disks = value
        .as_ref()
        .and_then(|v| v.get("disks"))
        .map(|v| as_array(Some(v)))
        .unwrap_or_default();
    let volumes = value
        .as_ref()
        .and_then(|v| v.get("volumes"))
        .map(|v| as_array(Some(v)))
        .unwrap_or_default();
    let smart = value
        .as_ref()
        .and_then(|v| v.get("smart"))
        .map(|v| as_array(Some(v)))
        .unwrap_or_default();

    let total_capacity: f64 = disks.iter().map(|d| json_f64(d, "sizeBytes")).sum();
    let total_free: f64 = volumes.iter().map(|v| json_f64(v, "freeBytes")).sum();

    let driver_issues: Vec<DriverIssue> = value
        .as_ref()
        .and_then(|v| v.get("driverIssues"))
        .map(|v| {
            as_array(Some(v))
                .into_iter()
                .filter_map(|d| {
                    let device = json_str(d, "device");
                    if device.is_empty() {
                        return None;
                    }
                    let class = json_str(d, "class");
                    let code = json_u32(d, "errorCode");
                    Some(DriverIssue {
                        device,
                        class: if class.is_empty() {
                            "Dispositivo".to_string()
                        } else {
                            class.clone()
                        },
                        error_code: code,
                        problem: json_str(d, "problem"),
                        recommendation: driver_recommendation(code, &class),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let storage: Vec<StorageInfo> = disks
        .iter()
        .filter_map(|d| {
            let model = json_str(d, "model");
            let size_bytes = json_f64(d, "sizeBytes");
            if model.is_empty() && size_bytes <= 0.0 {
                return None;
            }
            let free_bytes = if total_capacity > 0.0 {
                total_free * (size_bytes / total_capacity)
            } else {
                0.0
            };
            let (smart_status, predict_failure) =
                smart_status_for(&model, &json_str(d, "serial"), &smart);
            Some(StorageInfo {
                model: if model.is_empty() {
                    "Disco desconocido".to_string()
                } else {
                    model.clone()
                },
                kind: classify_storage(&model, &json_str(d, "mediaType")),
                capacity_gb: gb_from_bytes(size_bytes),
                free_gb: gb_from_bytes(free_bytes),
                smart_status,
                predict_failure,
            })
        })
        .collect();

    let board = motherboard
        .filter(|m| !json_str(m, "model").is_empty() || !json_str(m, "manufacturer").is_empty())
        .map(|m| MotherboardInfo {
            manufacturer: json_str(m, "manufacturer"),
            model: json_str(m, "model"),
        });

    HardwareInfo {
        hostname: std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "desconocido".into()),
        platform: "windows".into(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_model: cpu
            .map(|c| json_str(c, "name"))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Desconocido".into()),
        cpu_cores: cpu.map(|c| json_u32(c, "cores")).unwrap_or(0),
        cpu_logical: cpu
            .map(|c| json_u32(c, "logical"))
            .filter(|n| *n > 0)
            .unwrap_or_else(|| std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(0)),
        cpu_speed_ghz: cpu
            .map(|c| (json_f64(c, "speedMhz") / 1000.0 * 100.0).round() / 100.0)
            .unwrap_or(0.0),
        total_memory_gb: memory.map(|m| gb_from_kb(json_f64(m, "totalKb"))).unwrap_or(0.0),
        free_memory_gb: memory.map(|m| gb_from_kb(json_f64(m, "freeKb"))).unwrap_or(0.0),
        gpus,
        motherboard: board,
        storage,
        driver_issues,
        source: "tauri".into(),
    }
}

fn detect_cpu_model(os: &str) -> String {
    match os {
        "macos" => run_command("sysctl", &["-n", "machdep.cpu.brand_string"])
            .unwrap_or_else(|| "Desconocido".into()),
        _ => {
            if let Ok(content) = std::fs::read_to_string("/proc/cpuinfo") {
                for line in content.lines() {
                    if let Some(rest) = line.strip_prefix("model name") {
                        if let Some((_, value)) = rest.split_once(':') {
                            return value.trim().to_string();
                        }
                    }
                }
            }
            "Desconocido".into()
        }
    }
}

fn linux_cpu_counts() -> (u32, u32) {
    let mut logical = 0u32;
    let mut cores_per_socket = 0u32;
    if let Ok(content) = std::fs::read_to_string("/proc/cpuinfo") {
        for line in content.lines() {
            if line.starts_with("processor") {
                logical += 1;
            } else if line.starts_with("cpu cores") {
                if let Some((_, value)) = line.split_once(':') {
                    cores_per_socket = value.trim().parse().unwrap_or(0);
                }
            }
        }
    }
    let physical = if cores_per_socket > 0 {
        cores_per_socket
    } else {
        logical
    };
    (physical, logical)
}

fn linux_memory_gb() -> (f64, f64) {
    let mut total = 0.0;
    let mut available = 0.0;
    if let Ok(content) = std::fs::read_to_string("/proc/meminfo") {
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("MemTotal:") {
                total = rest.trim().trim_end_matches("kB").trim().parse::<f64>().unwrap_or(0.0);
            } else if let Some(rest) = line.strip_prefix("MemAvailable:") {
                available = rest.trim().trim_end_matches("kB").trim().parse::<f64>().unwrap_or(0.0);
            }
        }
    }
    (gb_from_kb(total), gb_from_kb(available))
}

fn detect_gpus(os: &str) -> Vec<GpuInfo> {
    let output = match os {
        "macos" => run_command("system_profiler", &["SPDisplaysDataType"]),
        _ => run_command("sh", &["-c", "lspci 2>/dev/null | grep -iE 'vga|3d|display'"]),
    };

    output
        .map(|out| {
            out.lines()
                .map(|line| line.replace("Chipset Model:", "").trim().to_string())
                .filter(|line| !line.is_empty())
                .map(|name| GpuInfo { name, vram_gb: None })
                .collect()
        })
        .unwrap_or_default()
}

fn detect_storage_linux() -> Vec<StorageInfo> {
    let mut storage = Vec::new();
    if let Some(output) = run_command("sh", &["-c", "lsblk -bdno NAME,SIZE,MODEL 2>/dev/null"]) {
        for line in output.lines() {
            let mut parts = line.split_whitespace();
            let _name = parts.next();
            let size = parts.next().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
            let model: String = parts.collect::<Vec<_>>().join(" ");
            if size <= 0.0 {
                continue;
            }
            storage.push(StorageInfo {
                model: if model.is_empty() {
                    "Disco desconocido".to_string()
                } else {
                    model
                },
                kind: "Desconocido".to_string(),
                capacity_gb: gb_from_bytes(size),
                free_gb: 0.0,
                smart_status: "N/A".to_string(),
                predict_failure: false,
            });
        }
    }
    storage
}

fn scan_hardware_impl() -> HardwareInfo {
    let os = std::env::consts::OS;
    if os == "windows" {
        return windows_hardware();
    }

    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "desconocido".into());

    if os == "macos" {
        let logical = run_command("sysctl", &["-n", "hw.logicalcpu"])
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(0);
        let physical = run_command("sysctl", &["-n", "hw.physicalcpu"])
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(logical);
        let total_memory = run_command("sysctl", &["-n", "hw.memsize"])
            .and_then(|s| s.trim().parse::<f64>().ok())
            .map(gb_from_bytes)
            .unwrap_or(0.0);
        return HardwareInfo {
            hostname,
            platform: os.into(),
            arch: std::env::consts::ARCH.to_string(),
            cpu_model: detect_cpu_model(os),
            cpu_cores: physical,
            cpu_logical: logical,
            cpu_speed_ghz: 0.0,
            total_memory_gb: total_memory,
            free_memory_gb: 0.0,
            gpus: detect_gpus(os),
            motherboard: None,
            storage: Vec::new(),
            driver_issues: Vec::new(),
            source: "tauri".into(),
        };
    }

    let (physical, logical) = linux_cpu_counts();
    let (total_memory, free_memory) = linux_memory_gb();
    HardwareInfo {
        hostname,
        platform: os.into(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_model: detect_cpu_model(os),
        cpu_cores: physical,
        cpu_logical: logical,
        cpu_speed_ghz: 0.0,
        total_memory_gb: total_memory,
        free_memory_gb: free_memory,
        gpus: detect_gpus(os),
        motherboard: None,
        storage: detect_storage_linux(),
        driver_issues: Vec::new(),
        source: "tauri".into(),
    }
}

#[tauri::command]
fn scan_hardware() -> HardwareInfo {
    scan_hardware_impl()
}

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

pub struct BackendState {
    pub child: Option<CommandChild>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(Mutex::new(BackendState { child: None }))
    .invoke_handler(tauri::generate_handler![scan_hardware])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Inicia automáticamente el sidecar del backend de Corelyze
      let parent_pid = std::process::id().to_string();
      match app.shell().sidecar("corelyze-backend") {
        Ok(cmd) => {
          let configured_cmd = cmd.env("CORELYZE_PARENT_PID", &parent_pid);
          match configured_cmd.spawn() {
            Ok((_rx, child)) => {
              log::info!("Backend sidecar de Corelyze iniciado con éxito");
              let state = app.state::<Mutex<BackendState>>();
              if let Ok(mut lock) = state.lock() {
                lock.child = Some(child);
              }
            }
            Err(e) => {
              log::error!("No se pudo inicializar el backend sidecar: {}", e);
            }
          }
        }
        Err(e) => {
          log::warn!("Sidecar del backend no disponible: {}", e);
        }
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::Destroyed = event {
        let state = window.state::<Mutex<BackendState>>();
        if let Ok(mut lock) = state.lock() {
          if let Some(child) = lock.child.take() {
            let _ = child.kill();
          }
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
