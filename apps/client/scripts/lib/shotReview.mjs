function pushFinding(findings, severity, code, message) {
  findings.push({ severity, code, message });
}

export function collectShotFindings({ state, metrics, consoleCounts }) {
  const findings = [];

  if (metrics.meanLuminance < 0.16) {
    pushFinding(findings, "warn", "dark-frame", "Frame is very dark; landmarking or albedo contrast may be too weak.");
  }
  if (metrics.contrast < 0.09) {
    pushFinding(findings, "warn", "low-contrast", "Frame contrast is low; forms may read as flat from this shot.");
  }
  if (metrics.edgeEnergy < 0.006) {
    pushFinding(findings, "warn", "low-detail-energy", "Frame detail energy is low; the composition may be overly empty or floor-dominant.");
  }
  if ((state.landmarks?.visible?.length ?? 0) === 0) {
    pushFinding(findings, "warn", "no-landmarks", "No landmark anchors are visible in-frame.");
  }
  if ((state.render?.warnings?.length ?? 0) > 0) {
    pushFinding(findings, "warn", "runtime-warnings", `Runtime warnings present: ${state.render.warnings.join(" | ")}`);
  }
  if ((consoleCounts?.errorCount ?? 0) > 0) {
    pushFinding(findings, "error", "console-errors", `Console/page errors present: ${consoleCounts.errorCount}`);
  }
  if (state.assets?.wall?.requestedMode === "pbr" && state.assets?.wall?.activeMode !== "pbr") {
    pushFinding(findings, "warn", "wall-fallback", "Wall materials fell back from requested PBR mode.");
  }
  if (state.assets?.floor?.requestedMode === "pbr" && state.assets?.floor?.activeMode !== "pbr") {
    pushFinding(findings, "warn", "floor-fallback", "Floor materials fell back from requested PBR mode.");
  }

  return findings;
}

export function scoreShotReview(findings) {
  let score = 100;
  for (const finding of findings) {
    score -= finding.severity === "error" ? 35 : 10;
  }
  return Math.max(0, score);
}

export function summarizeCapturedShot(capture, metrics, consoleCounts, options = {}) {
  const state = capture.state;
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 80;
  const shotDefinition = options.shotDefinition && typeof options.shotDefinition === "object"
    ? options.shotDefinition
    : null;
  const findings = collectShotFindings({ state, metrics, consoleCounts });
  const score = scoreShotReview(findings);
  const passed = score >= minScore && findings.every((finding) => finding.severity !== "error");

  return {
    shotId: capture.shotId,
    imagePath: capture.imagePath,
    statePath: capture.statePath,
    consolePath: capture.consolePath,
    metrics,
    zoneId: state.player?.zoneId ?? null,
    visibleLandmarks: state.landmarks?.visible?.map((entry) => entry.id) ?? [],
    console: consoleCounts,
    reviewFocus: Array.isArray(shotDefinition?.reviewFocus) ? shotDefinition.reviewFocus : [],
    mustShow: Array.isArray(shotDefinition?.mustShow) ? shotDefinition.mustShow : [],
    findings,
    score,
    passed,
  };
}

export function aggregateShotReviews(shots, options = {}) {
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 80;
  const severityCounts = { error: 0, warn: 0 };
  const failingShots = [];
  const shotsWithFindings = [];

  for (const shot of shots) {
    if (shot.findings.length > 0) {
      shotsWithFindings.push(shot.shotId);
    }
    if (!shot.passed) {
      failingShots.push(shot.shotId);
    }
    for (const finding of shot.findings) {
      if (finding.severity === "error") severityCounts.error += 1;
      if (finding.severity === "warn") severityCounts.warn += 1;
    }
  }

  return {
    minScore,
    passed: failingShots.length === 0,
    totalShots: shots.length,
    totalFindings: severityCounts.error + severityCounts.warn,
    severityCounts,
    shotsWithFindings,
    failingShots,
  };
}
