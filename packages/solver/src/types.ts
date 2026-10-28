// All quantities are SI (m, m², m³, kg, s, Pa, J) unless the name says otherwise.

export type TailType = 'flat' | 'hollow' | 'boattail';

export interface CartridgeInput {
  /** Water capacity of the fired case [m³]. */
  caseVolume: number;
  /** Case length L3 [m]. */
  caseLength: number;
  /** Effective bore cross-section Aeff [m²]. */
  boreArea: number;
  /** Groove diameter [m]. */
  grooveDiameter: number;
  /** Maximum permitted pressure (C.I.P. Pmax) [Pa]; only used for warnings and bands. */
  maxPressure: number;
  /** Sebert factor: share of the charge mass moving with the bullet. */
  sebert: number;
}

export interface GunInput {
  /** Barrel length from the bolt face [m]. */
  barrelLength: number;
  /** Twist length [m]; 0 = unknown. */
  twistLength: number;
  /** Gun mass [kg]; 0 = no recoil calculation. */
  gunMass: number;
}

export interface ProjectileInput {
  diameter: number;
  mass: number;
  length: number;
  /** Seating depth: bullet base to case mouth [m]. */
  seatingDepth: number;
  /** Shot-start pressure: the bullet moves once the gas reaches it [Pa]. */
  startPressure: number;
  tailType: TailType;
  tailLength: number;
  tailDiameterA: number;
  tailDiameterB: number;
}

export interface PropellantInput {
  /** Vivacity Ba [1/(s·bar)]: dz/dt = Ba·φ(z)·p[bar]. */
  Ba: number;
  /** Specific explosive heat Qex [J/kg]. */
  Qex: number;
  /** Ratio of specific heats κ. */
  kappa: number;
  a0: number;
  a1: number;
  z1: number;
  z2: number;
  /** Covolume of the powder gas [m³/kg] as given in the data (eta); the model does not use it, see ModelParams.covolumeFactor. */
  covolume: number;
  /** Material density of the solid powder [kg/m³]. */
  materialDensity: number;
  /** Bulk density [kg/m³]. */
  bulkDensity: number;
  /** Temperature the powder data refers to [°C]. */
  referenceTemperature: number;
  /** Powder temperature of this simulation [°C]. */
  temperature: number;
  /** Cold / hot temperature coefficients of Ba [1/(s·bar·K)]; see burnRateAt(). */
  tcc: number;
  tch: number;
  /** Charge mass [kg]. */
  charge: number;
}

export interface LoadInput {
  cartridge: CartridgeInput;
  gun: GunInput;
  projectile: ProjectileInput;
  propellant: PropellantInput;
}

/**
 * Constants of the model that are not part of the load. Defaults are physical textbook values;
 * calibration against measured loads changes them (scripts/calibrate.ts).
 */
export interface ModelParams {
  /** Exponent n of the phase-1 form function φ = (1 + a0·z)^n. */
  phase1Exponent: number;
  /** Phase 2: burnt fraction at which φ falls linearly to 0 from φ(z1); 0 = constant φ(z1) (plateau). */
  phase2End: number;
  /**
   * Vivacity correction from the database value alone: Ba · (Ba / vivacityReference)^vivacityExponent
   * (0 = none). Fitted by scripts/calibrate.ts.
   */
  vivacityExponent: number;
  vivacityReference: number;
  /** Exponent of the phase-3 decay φ ∝ ((1 − z)/(1 − z2))^q (2/3: surface of a shrinking sphere). */
  phase3Exponent: number;
  /**
   * Pressure exponent n of the burn rate (Vieille: rate ∝ pⁿ), taken relative to 1000 bar so that Ba keeps its
   * meaning: dz/dt = Ba · φ(z) · 1000 bar · (p / 1000 bar)ⁿ. 1 = rate proportional to the pressure; default 0.9.
   */
  burnPressureExponent: number;
  /** Share of the chemical energy lost as heat to the walls (constant fraction). */
  heatLoss: number;
  /** Covolume of the powder gas = covolumeFactor / material density pc (1.2: 0.75 cm³/g at pc 1600 kg/m³). */
  covolumeFactor: number;
  /**
   * Bullet friction: a force `bulletFriction · bullet length · bullet diameter` [Pa] that
   * the gas loses as work along the travel; it does not act in the bullet's momentum.
   */
  bulletFriction: number;
  /** Bore resistance acting against the bullet once it moves [Pa]. */
  boreResistance: number;
  /** 1: the friction force also brakes the bullet (m·dv/dt = A·p − Ff; default); 0: energy loss of the gas only. */
  frictionInMomentum: number;
  /** Share of the friction work that returns to the gas as heat (0 = all lost, default). */
  frictionHeatReturn: number;
  /**
   * Engraving resistance [Pa over the bore area] at shot start, falling linearly to zero over
   * `engravingLength` [m] of travel; acts in the bullet's momentum and takes its work from the gas. 0 = off.
   */
  engravingResistance: number;
  engravingLength: number;
  /** Which pressure the results report. */
  reportedPressure: 'mean' | 'breech';
  /** Relative tolerance of the adaptive integration. */
  tolerance: number;
  /** Largest time step [s]; keeps the pressure peak resolved. */
  maxStep: number;
}

export interface CurvePoint {
  /** Time since shot start [s]. */
  t: number;
  /** Bullet travel from its seated position [m]. */
  x: number;
  v: number;
  p: number;
  z: number;
}

export type SimStatus = 'ok' | 'invalid-input' | 'charge-too-high' | 'bullet-stuck';

export interface SimResult {
  status: SimStatus;
  message?: string;
  curve: CurvePoint[];
  /** Peak of the reported pressure [Pa] and its time [s]. */
  maxPressure: number;
  maxPressureTime: number;
  muzzlePressure: number;
  muzzleVelocity: number;
  muzzleEnergy: number;
  /** Time from shot start to muzzle exit [s]. */
  barrelTime: number;
  /** Time from the pressure first reaching 10 % of its peak to muzzle exit [s]. */
  bulletLeadTime: number;
  /** Burnt fraction at muzzle exit. */
  burnt: number;
  /** Bullet travel to the muzzle [m]. */
  travel: number;
  /** Muzzle energy / chemical energy of the charge. */
  efficiency: number;
}
