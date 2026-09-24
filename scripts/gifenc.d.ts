declare module 'gifenc/dist/gifenc.esm.js' {
  export type RGBPalette = number[][];
  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: RGBPalette;
        delay?: number;
        repeat?: number;
        dispose?: number;
        transparent?: boolean;
        transparentIndex?: number;
      },
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: string },
  ): RGBPalette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: RGBPalette,
    format?: string,
  ): Uint8Array;
}
