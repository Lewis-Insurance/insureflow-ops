/**
 * Quality Assessor Service
 *
 * Pre-upload image quality assessment for:
 * - Camera captures
 * - File uploads (PDF/images)
 *
 * Provides:
 * - Quality scoring (0-100)
 * - Issue detection (blur, glare, low contrast, etc.)
 * - Actionable recommendations
 * - Block/warn thresholds
 */

export interface QualityMetrics {
  blurScore: number; // 0-100, higher = sharper
  contrastScore: number; // 0-100
  brightnessScore: number; // 0-100, 50 = optimal
  edgeCoverage: number; // 0-100, how well document fills frame
  estimatedDpi: number; // estimated resolution
  glarePct: number; // 0-100, percentage of glare detected
  skewAngle: number; // degrees of rotation
}

export interface QualityIssue {
  code: 'LOW_RESOLUTION' | 'BLUR' | 'GLARE' | 'CROPPED' | 'LOW_CONTRAST' | 'ROTATED' | 'DUPLICATE_PAGE' | 'TOO_DARK' | 'TOO_BRIGHT' | 'FAINT_SCAN';
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface QualityReport {
  score: number; // 0-100 overall
  tier: 'excellent' | 'good' | 'acceptable' | 'poor' | 'unusable';
  issues: QualityIssue[];
  recommendedActions: string[];
  metrics: QualityMetrics;
  canProceed: boolean; // false if score < HARD_BLOCK_THRESHOLD
  requiresConfirmation: boolean; // true if score < WARN_THRESHOLD
}

export interface QualityAssessorConfig {
  hardBlockThreshold: number; // Default: 35
  warnThreshold: number; // Default: 60
  minDpi: number; // Default: 150
  idealDpi: number; // Default: 300
  blurThreshold: number; // Default: 40
  contrastThreshold: number; // Default: 30
  glareThreshold: number; // Default: 20
}

const DEFAULT_CONFIG: QualityAssessorConfig = {
  hardBlockThreshold: 35,
  warnThreshold: 60,
  minDpi: 150,
  idealDpi: 300,
  blurThreshold: 40,
  contrastThreshold: 30,
  glareThreshold: 20,
};

export class QualityAssessor {
  private config: QualityAssessorConfig;

  constructor(config: Partial<QualityAssessorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Assess quality of an image (from File or ImageData)
   */
  async assessImage(input: File | ImageData | HTMLCanvasElement): Promise<QualityReport> {
    let imageData: ImageData;

    if (input instanceof File) {
      imageData = await this.fileToImageData(input);
    } else if (input instanceof ImageData) {
      imageData = input;
    } else {
      // HTMLCanvasElement
      const ctx = input.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      imageData = ctx.getImageData(0, 0, input.width, input.height);
    }

    const metrics = this.calculateMetrics(imageData);
    const issues = this.detectIssues(metrics);
    const score = this.calculateOverallScore(metrics, issues);
    const recommendedActions = this.generateRecommendations(issues);
    const tier = this.scoreTier(score);

    return {
      score,
      tier,
      issues,
      recommendedActions,
      metrics,
      canProceed: score >= this.config.hardBlockThreshold,
      requiresConfirmation: score < this.config.warnThreshold,
    };
  }

  /**
   * Assess quality of a PDF file
   */
  async assessPdf(file: File): Promise<{
    isNativeText: boolean;
    pageCount: number;
    pages: QualityReport[];
    overall: QualityReport;
  }> {
    // For PDFs, we need to render pages to images
    // This would use pdf.js or similar
    // For now, return a simplified assessment

    const isNativeText = await this.detectNativeTextPdf(file);

    // Placeholder - in production, render each page and assess
    const metrics: QualityMetrics = {
      blurScore: isNativeText ? 100 : 70,
      contrastScore: isNativeText ? 100 : 80,
      brightnessScore: 50,
      edgeCoverage: 100,
      estimatedDpi: isNativeText ? 300 : 150,
      glarePct: 0,
      skewAngle: 0,
    };

    const issues: QualityIssue[] = [];
    if (!isNativeText) {
      issues.push({
        code: 'LOW_RESOLUTION',
        severity: 'warning',
        message: 'Image-based PDF detected. OCR quality may vary.',
      });
    }

    const score = isNativeText ? 95 : 70;

    const overall: QualityReport = {
      score,
      tier: this.scoreTier(score),
      issues,
      recommendedActions: isNativeText ? [] : ['Consider uploading a native PDF if available'],
      metrics,
      canProceed: true,
      requiresConfirmation: !isNativeText,
    };

    return {
      isNativeText,
      pageCount: 1, // Would be determined by pdf.js
      pages: [overall],
      overall,
    };
  }

  /**
   * Quick assessment for live camera preview (lightweight)
   */
  assessLive(imageData: ImageData): { blur: number; brightness: number; overall: number; guidance: string | null } {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Quick blur detection using Laplacian variance
    const grayValues: number[] = [];
    let totalBrightness = 0;

    for (let i = 0; i < data.length; i += 4) {
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grayValues.push(luminance);
      totalBrightness += luminance;
    }

    // Laplacian variance for blur
    let laplacianSum = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const laplacian = Math.abs(
          4 * grayValues[idx] -
          grayValues[idx - 1] -
          grayValues[idx + 1] -
          grayValues[idx - width] -
          grayValues[idx + width]
        );
        laplacianSum += laplacian;
        count++;
      }
    }

    const avgLaplacian = laplacianSum / count;
    const blur = Math.min(100, avgLaplacian * 3);
    const brightness = Math.min(100, (totalBrightness / (data.length / 4)) / 2.55);
    const overall = (blur * 0.6 + brightness * 0.4);

    let guidance: string | null = null;
    if (blur < 40) {
      guidance = 'Hold steady to reduce blur';
    } else if (brightness < 30) {
      guidance = 'Move to better lighting';
    } else if (brightness > 85) {
      guidance = 'Too bright - reduce lighting or angle';
    }

    return { blur, brightness, overall, guidance };
  }

  private async fileToImageData(file: File): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  private calculateMetrics(imageData: ImageData): QualityMetrics {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Calculate grayscale values and basic stats
    const grayValues: number[] = [];
    let totalBrightness = 0;
    let minLum = 255, maxLum = 0;
    let brightPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      grayValues.push(luminance);
      totalBrightness += luminance;

      if (luminance < minLum) minLum = luminance;
      if (luminance > maxLum) maxLum = luminance;

      // Detect glare (very bright white pixels)
      if (luminance > 245 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
        brightPixels++;
      }
    }

    const avgBrightness = totalBrightness / grayValues.length;

    // Blur score using Laplacian variance
    let laplacianSum = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const laplacian = Math.abs(
          4 * grayValues[idx] -
          grayValues[idx - 1] -
          grayValues[idx + 1] -
          grayValues[idx - width] -
          grayValues[idx + width]
        );
        laplacianSum += laplacian;
        count++;
      }
    }
    const blurScore = Math.min(100, (laplacianSum / count) * 3);

    // Contrast score
    const contrastScore = Math.min(100, (maxLum - minLum) * 0.5);

    // Brightness score (optimal at 128)
    const brightnessScore = Math.max(0, 100 - Math.abs(avgBrightness - 128) * 0.8);

    // Glare percentage
    const glarePct = (brightPixels / grayValues.length) * 100;

    // Estimate DPI based on resolution
    // Assume letter size paper (8.5 x 11 inches) for estimation
    const estimatedDpi = Math.min(width, height) / 8.5;

    // Edge coverage - detect document boundaries
    // Simplified: check if edges have content
    const edgeCoverage = this.detectEdgeCoverage(grayValues, width, height);

    // Skew detection (simplified)
    const skewAngle = 0; // Would need more sophisticated edge detection

    return {
      blurScore,
      contrastScore,
      brightnessScore,
      edgeCoverage,
      estimatedDpi,
      glarePct,
      skewAngle,
    };
  }

  private detectEdgeCoverage(grayValues: number[], width: number, height: number): number {
    // Sample edges to detect if document fills frame
    let edgeVariance = 0;
    let samples = 0;

    // Top edge
    for (let x = 0; x < width; x += 10) {
      const variance = Math.abs(grayValues[x] - grayValues[width + x]);
      edgeVariance += variance;
      samples++;
    }

    // Bottom edge
    for (let x = 0; x < width; x += 10) {
      const idx = (height - 2) * width + x;
      const variance = Math.abs(grayValues[idx] - grayValues[idx + width]);
      edgeVariance += variance;
      samples++;
    }

    // If there's high variance at edges, document might be cropped
    const avgEdgeVariance = edgeVariance / samples;
    return Math.min(100, avgEdgeVariance > 20 ? 100 : avgEdgeVariance * 5);
  }

  private detectIssues(metrics: QualityMetrics): QualityIssue[] {
    const issues: QualityIssue[] = [];

    if (metrics.blurScore < this.config.blurThreshold) {
      issues.push({
        code: 'BLUR',
        severity: metrics.blurScore < 20 ? 'error' : 'warning',
        message: `Image is blurry (sharpness: ${metrics.blurScore.toFixed(0)}%)`,
      });
    }

    if (metrics.contrastScore < this.config.contrastThreshold) {
      issues.push({
        code: 'LOW_CONTRAST',
        severity: metrics.contrastScore < 15 ? 'error' : 'warning',
        message: `Low contrast detected (${metrics.contrastScore.toFixed(0)}%)`,
      });
    }

    if (metrics.brightnessScore < 30) {
      issues.push({
        code: 'TOO_DARK',
        severity: 'warning',
        message: 'Image is too dark',
      });
    }

    if (metrics.brightnessScore > 90) {
      issues.push({
        code: 'TOO_BRIGHT',
        severity: 'warning',
        message: 'Image is overexposed',
      });
    }

    if (metrics.glarePct > this.config.glareThreshold) {
      issues.push({
        code: 'GLARE',
        severity: metrics.glarePct > 40 ? 'error' : 'warning',
        message: `Glare detected (${metrics.glarePct.toFixed(0)}% of image)`,
      });
    }

    if (metrics.estimatedDpi < this.config.minDpi) {
      issues.push({
        code: 'LOW_RESOLUTION',
        severity: metrics.estimatedDpi < 100 ? 'error' : 'warning',
        message: `Low resolution (~${metrics.estimatedDpi.toFixed(0)} DPI, recommend ${this.config.idealDpi}+)`,
      });
    }

    if (metrics.edgeCoverage < 50) {
      issues.push({
        code: 'CROPPED',
        severity: 'warning',
        message: 'Document may be cropped or not centered',
      });
    }

    if (Math.abs(metrics.skewAngle) > 5) {
      issues.push({
        code: 'ROTATED',
        severity: 'info',
        message: `Document is tilted ${metrics.skewAngle.toFixed(1)}°`,
      });
    }

    return issues;
  }

  private calculateOverallScore(metrics: QualityMetrics, issues: QualityIssue[]): number {
    // Weighted scoring
    let score = (
      metrics.blurScore * 0.30 +
      metrics.contrastScore * 0.15 +
      metrics.brightnessScore * 0.15 +
      metrics.edgeCoverage * 0.10 +
      Math.min(100, (metrics.estimatedDpi / this.config.idealDpi) * 100) * 0.20 +
      Math.max(0, 100 - metrics.glarePct * 2) * 0.10
    );

    // Penalty for severe issues
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    score -= errorCount * 15;
    score -= warningCount * 5;

    return Math.max(0, Math.min(100, score));
  }

  private generateRecommendations(issues: QualityIssue[]): string[] {
    const recommendations: string[] = [];

    const issueCodes = new Set(issues.map(i => i.code));

    if (issueCodes.has('BLUR')) {
      recommendations.push('Hold the camera steady or use a tripod');
    }
    if (issueCodes.has('LOW_CONTRAST') || issueCodes.has('FAINT_SCAN')) {
      recommendations.push('Use better lighting or increase scan contrast settings');
    }
    if (issueCodes.has('GLARE')) {
      recommendations.push('Adjust the angle to reduce glare from lights');
    }
    if (issueCodes.has('TOO_DARK')) {
      recommendations.push('Move to a brighter location or add lighting');
    }
    if (issueCodes.has('TOO_BRIGHT')) {
      recommendations.push('Reduce direct light on the document');
    }
    if (issueCodes.has('LOW_RESOLUTION')) {
      recommendations.push('Use a higher resolution scanner or move camera closer');
    }
    if (issueCodes.has('CROPPED')) {
      recommendations.push('Ensure the entire document is visible in frame');
    }
    if (issueCodes.has('ROTATED')) {
      recommendations.push('Align document with frame edges');
    }

    return recommendations;
  }

  private scoreTier(score: number): QualityReport['tier'] {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'acceptable';
    if (score >= 35) return 'poor';
    return 'unusable';
  }

  private async detectNativeTextPdf(file: File): Promise<boolean> {
    // Read first few bytes to detect if it's a native PDF with text
    // This is a simplified check - production would use pdf.js
    const buffer = await file.slice(0, 1024).arrayBuffer();
    const text = new TextDecoder().decode(buffer);

    // Check for text stream markers in PDF
    return text.includes('/Type /Page') && text.includes('stream');
  }
}

// Export singleton instance
export const qualityAssessor = new QualityAssessor();
