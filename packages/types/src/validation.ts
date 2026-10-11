export interface CompatibilityResult {
  compatible: boolean;
  issues: CompatibilityIssue[];
  warnings: CompatibilityIssue[];
  score: number;
}

export interface CompatibilityIssue {
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  component1?: string;
  component2?: string;
  description: string;
  suggestion?: string;
}

export interface BottleneckAnalysis {
  overallBottleneck: 'NONE' | 'CPU' | 'GPU' | 'RAM' | 'STORAGE' | 'BALANCED';
  bottleneckPercentage: number;
  cpuGpuBalance: {
    ratio: number;
    classification: 'BALANCED' | 'CPU_LIMITED' | 'GPU_LIMITED';
  };
  resolutionAnalysis: {
    '1080p': BottleneckScore;
    '1440p': BottleneckScore;
    '4K': BottleneckScore;
  };
  recommendations: string[];
}

export interface BottleneckScore {
  bottleneckType: string;
  percentage: number;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
