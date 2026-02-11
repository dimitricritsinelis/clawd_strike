import * as THREE from "three";

export class AkViewmodel {
  private readonly root = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private time = 0;
  private recoil = 0;
  private active = true;

  constructor(camera: THREE.Camera) {
    this.root.position.set(0.33, -0.33, -0.56);
    this.root.add(this.pivot);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3f3a34, roughness: 0.62, metalness: 0.54 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x292b2d, roughness: 0.44, metalness: 0.78 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a482d, roughness: 0.76, metalness: 0.05 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.92), bodyMat);
    receiver.position.set(0, 0, -0.05);
    receiver.castShadow = false;

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.4), woodMat);
    stock.position.set(0, -0.02, 0.62);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.36), woodMat);
    handguard.position.set(0, -0.03, -0.7);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.8, 10), metalMat);
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0, 0.01, -1.05);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.03), metalMat);
    frontSight.position.set(0, 0.08, -1.3);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.23, 0.2), metalMat);
    mag.position.set(0, -0.17, -0.18);
    mag.rotation.x = 0.3;

    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.05), metalMat);
    rearSight.position.set(0, 0.08, 0.06);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.08), bodyMat);
    grip.position.set(0, -0.17, 0.18);

    this.pivot.add(receiver, stock, handguard, barrel, frontSight, rearSight, mag, grip);

    camera.add(this.root);
  }

  setActive(active: boolean) {
    this.active = active;
    this.root.visible = active;
  }

  onShot() {
    this.recoil = Math.min(1.1, this.recoil + 0.28);
  }

  update(dt: number, velocityMagnitude: number) {
    if (!this.active) return;
    this.time += dt;
    this.recoil = Math.max(0, this.recoil - dt * 4.2);

    const moveAmp = Math.min(1, velocityMagnitude / 6);
    const bobX = Math.sin(this.time * 8.4) * 0.011 * moveAmp;
    const bobY = Math.abs(Math.cos(this.time * 7.7)) * 0.009 * moveAmp;

    this.root.position.x = 0.33 + bobX;
    this.root.position.y = -0.33 - bobY + this.recoil * 0.03;
    this.root.rotation.y = -0.05 + bobX * 0.45;

    this.pivot.rotation.x = this.recoil * 0.2;
    this.pivot.position.z = this.recoil * 0.08;
  }
}
