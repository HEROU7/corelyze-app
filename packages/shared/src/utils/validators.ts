export function validateSocketCompatibility(
  cpuSocket: string,
  motherboardSocket: string,
): boolean {
  if (!cpuSocket || !motherboardSocket) return false;
  return cpuSocket.toUpperCase() === motherboardSocket.toUpperCase();
}

export function validateRamType(
  ramType: string,
  motherboardRamType: string,
): boolean {
  if (!ramType || !motherboardRamType) return false;
  return ramType.toUpperCase() === motherboardRamType.toUpperCase();
}

export function calculateRequiredPower(
  cpuTdp: number,
  gpuTdp: number,
  otherTdp: number = 50,
  margin: number = 1.2,
): number {
  const total = cpuTdp + gpuTdp + otherTdp;
  return Math.ceil(total * margin);
}
