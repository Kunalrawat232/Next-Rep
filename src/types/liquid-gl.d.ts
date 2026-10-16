// liquid-gl ships plain JavaScript without types. Only what the app uses is declared.
declare module 'liquid-gl' {
  export type LiquidGlassOptions = {
    target: string;
    snapshot?: string;
    resolution?: number;
    zIndex?: number;
    refraction?: number;
    bevelDepth?: number;
    bevelWidth?: number;
    frost?: number;
    shadow?: boolean;
    specular?: boolean;
    reveal?: 'none' | 'fade';
    tint?: string | null;
  };

  export type LiquidGlassLens = {
    /** Restores the element's own styles and releases the GPU resources. */
    destroy(): void;
  };

  /** One lens for one matching element, a list for several, nothing when no element matches. */
  const liquidGL: (options: LiquidGlassOptions) => LiquidGlassLens | LiquidGlassLens[] | undefined;
  export default liquidGL;
}
