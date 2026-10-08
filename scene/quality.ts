/**
 * Quality tiers. The target is a modern laptop; phones get a lighter tier.
 * A runtime governor steps down when frames stay slow.
 */
export interface Quality {
  tier: "high" | "medium" | "low";
  dpr: number;
  msaa: number;
  ao: boolean;
  shadows: boolean;
  shadowSize: number;
  /** how many detailed 1 km tiles may be resident at once */
  tileBudget: number;
  /** detailed tiles load inside this camera distance multiple */
  detailRange: number;
  terrainStride: number;
}

function gpuString(): string {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } catch {
    return "";
  }
}

export function detectQuality(): Quality {
  const gpu = gpuString().toLowerCase();
  const small = matchMedia("(max-width: 760px)").matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const strong = /apple m\d|apple gpu|nvidia|geforce|rtx|radeon rx|radeon pro|arc a/.test(gpu) || (cores >= 10 && !/intel|swiftshader|llvmpipe/.test(gpu));
  const weak = /swiftshader|llvmpipe|software|mali|adreno [1-5]|powervr/.test(gpu);
  const dprRaw = window.devicePixelRatio || 1;
  if (small || weak)
    return { tier: "low", dpr: Math.min(dprRaw, 1.25), msaa: 0, ao: false, shadows: !weak, shadowSize: 1024, tileBudget: 10, detailRange: 0.9, terrainStride: 2 };
  if (strong)
    return { tier: "high", dpr: Math.min(dprRaw, 2), msaa: 4, ao: true, shadows: true, shadowSize: 4096, tileBudget: 70, detailRange: 1.6, terrainStride: 1 };
  return { tier: "medium", dpr: Math.min(dprRaw, 1.5), msaa: 4, ao: true, shadows: true, shadowSize: 2048, tileBudget: 40, detailRange: 1.25, terrainStride: 1 };
}

/** Called once per frame with the frame time; returns a step to apply, if any. */
export function createGovernor(onStep: (step: number) => void) {
  let slow = 0, steps = 0, frames = 0;
  return (dtMs: number) => {
    frames++;
    if (frames < 90) return; // let the first loads settle
    if (dtMs > 40) slow += dtMs;
    else slow = Math.max(0, slow - dtMs * 0.6);
    if (slow > 2600 && steps < 4) {
      slow = 0;
      onStep(++steps);
    }
  };
}
