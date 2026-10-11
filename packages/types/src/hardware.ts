export enum ComponentCategory {
  CPU = 'CPU',
  MOTHERBOARD = 'MOTHERBOARD',
  RAM = 'RAM',
  GPU = 'GPU',
  STORAGE = 'STORAGE',
  PSU = 'PSU',
  CASE = 'CASE',
  COOLER = 'COOLER',
  OTHER = 'OTHER',
}

export interface HardwareInfo {
  cpu: CPUInfo | null;
  motherboard: MotherboardInfo | null;
  ram: RAMInfo[] | null;
  gpu: GPUInfo[] | null;
  storage: StorageInfo[] | null;
  psu: PSUInfo | null;
  chassis: CaseInfo | null;
}

export interface CPUInfo {
  manufacturer: string;
  brand: string;
  family: string;
  model: string;
  socket: string;
  cores: number;
  threads: number;
  baseFrequency: number;
  boostFrequency: number;
  tdp: number;
  architecture: string;
  processNode: string;
  cache: string;
  integratedGraphics: string | null;
  benchmarkScore?: number;
}

export interface MotherboardInfo {
  manufacturer: string;
  model: string;
  chipset: string;
  socket: string;
  formFactor: string;
  ramType: string;
  ramSlots: number;
  maxRam: number;
  ramSpeed: string[];
  pciSlots: string[];
  sataPorts: number;
  m2Slots: number;
  usbPorts: any;
  ethernet: string;
  wifi: string | null;
  bluetooth: string | null;
}

export interface RAMInfo {
  manufacturer: string;
  model: string;
  capacity: number;
  type: string;
  speed: number;
  modules: number;
  voltage: number;
  formFactor: string;
  serial?: string;
}

export interface GPUInfo {
  manufacturer: string;
  model: string;
  chipset: string;
  vram: number;
  vramType: string;
  interface: string;
  length: number;
  width: number;
  thickness: number;
  tdp: number;
  boostClock: number;
  baseClock: number;
  ports: string[];
  powerConnectors: string[];
}

export interface StorageInfo {
  manufacturer: string;
  model: string;
  capacity: number;
  type: string;
  interface: string;
  rpm?: number;
  readSpeed: number;
  writeSpeed: number;
  formFactor: string;
  health?: number;
}

export interface PSUInfo {
  manufacturer: string;
  model: string;
  wattage: number;
  efficiency: string;
  formFactor: string;
  modular: boolean;
  connectors: any;
  fanSize?: number;
}

export interface CaseInfo {
  manufacturer: string;
  model: string;
  formFactor: string;
  dimensions: {
    height: number;
    width: number;
    depth: number;
  };
  maxGpuLength: number;
  maxCpuCoolerHeight: number;
  driveBays: any;
  expansionSlots: number;
  material: string;
  weight?: number;
}
