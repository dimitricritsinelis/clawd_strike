type HudSnapshot = {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
  grounded: boolean;
  speedMps: number;
  propStats?: {
    seed: number;
    profile: "subtle" | "medium" | "high";
    jitter: number;
    cluster: number;
    density: number;
    candidatesTotal: number;
    collidersPlaced: number;
    rejectedClearZone: number;
    rejectedBounds: number;
    rejectedGapRule: number;
    visualOnlyLandmarks: number;
  };
  weaponStats?: {
    loaded: boolean;
    dot: number;
    angleDeg: number;
    shotsFired: number;
    shotIndex: number;
    spreadDeg: number;
    bloomDeg: number;
    lastShotRecoilPitchDeg: number;
    lastShotRecoilYawDeg: number;
  };
};

export class Hud {
  private readonly root: HTMLDivElement;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.left = "10px";
    this.root.style.top = "10px";
    this.root.style.padding = "8px 10px";
    this.root.style.borderRadius = "8px";
    this.root.style.background = "rgba(6, 14, 23, 0.78)";
    this.root.style.color = "#d5ecff";
    this.root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    this.root.style.fontSize = "12px";
    this.root.style.lineHeight = "1.35";
    this.root.style.whiteSpace = "pre";
    this.root.style.pointerEvents = "none";
    this.root.style.zIndex = "12";
    mountEl.append(this.root);
  }

  update(snapshot: HudSnapshot): void {
    const lines = [
      `pos: ${snapshot.x.toFixed(2)}, ${snapshot.y.toFixed(2)}, ${snapshot.z.toFixed(2)}`,
      `yaw/pitch: ${snapshot.yawDeg.toFixed(1)} / ${snapshot.pitchDeg.toFixed(1)}`,
      `grounded: ${snapshot.grounded ? "yes" : "no"}`,
      `speed: ${snapshot.speedMps.toFixed(2)} m/s`,
    ];

    if (snapshot.propStats) {
      lines.push(`seed: ${snapshot.propStats.seed}`);
      lines.push(
        `props profile: ${snapshot.propStats.profile} (j ${snapshot.propStats.jitter.toFixed(2)} c ${snapshot.propStats.cluster.toFixed(2)} d ${snapshot.propStats.density.toFixed(2)})`,
      );
      lines.push(
        `props placed/candidates: ${snapshot.propStats.collidersPlaced}/${snapshot.propStats.candidatesTotal}`,
      );
      lines.push(
        `rejects clear/bounds/gap: ${snapshot.propStats.rejectedClearZone}/${snapshot.propStats.rejectedBounds}/${snapshot.propStats.rejectedGapRule}`,
      );
      lines.push(`visual-only landmarks: ${snapshot.propStats.visualOnlyLandmarks}`);
    }

    if (snapshot.weaponStats) {
      lines.push(`weapon loaded: ${snapshot.weaponStats.loaded ? "yes" : "no"}`);
      lines.push(`weapon align dot: ${snapshot.weaponStats.dot.toFixed(3)}`);
      lines.push(`weapon align angle: ${snapshot.weaponStats.angleDeg.toFixed(2)} deg`);
      lines.push(`weapon shots/frame: ${snapshot.weaponStats.shotsFired}`);
      lines.push(`weapon shotIndex: ${snapshot.weaponStats.shotIndex}`);
      lines.push(`weapon spread/bloom: ${snapshot.weaponStats.spreadDeg.toFixed(2)} / ${snapshot.weaponStats.bloomDeg.toFixed(2)} deg`);
      lines.push(
        `weapon recoil last p/y: ${snapshot.weaponStats.lastShotRecoilPitchDeg.toFixed(2)} / ${snapshot.weaponStats.lastShotRecoilYawDeg.toFixed(2)} deg`,
      );
    }

    this.root.textContent = lines.join("\n");
  }

  dispose(): void {
    this.root.remove();
  }
}
