export function getNearestPowerOfTwo(value: number) {
  return 2 ** Math.max(5, Math.round(Math.log2(Math.max(32, value))));
}

export function fft(real: Float32Array, imag: Float32Array, inverse = false) {
  const size = real.length;
  if (size !== imag.length || size < 2 || (size & (size - 1)) !== 0) {
    throw new Error("FFT buffers must be matching powers of two");
  }

  let reversed = 0;
  for (let index = 1; index < size; index += 1) {
    let bit = size >> 1;
    while ((reversed & bit) !== 0) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;

    if (index < reversed) {
      const realValue = real[index] ?? 0;
      const imagValue = imag[index] ?? 0;
      real[index] = real[reversed] ?? 0;
      imag[index] = imag[reversed] ?? 0;
      real[reversed] = realValue;
      imag[reversed] = imagValue;
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImag = Math.sin(angle);
    const half = length >> 1;

    for (let offset = 0; offset < size; offset += length) {
      let twiddleReal = 1;
      let twiddleImag = 0;

      for (let pair = 0; pair < half; pair += 1) {
        const evenIndex = offset + pair;
        const oddIndex = evenIndex + half;
        const oddReal = real[oddIndex] ?? 0;
        const oddImag = imag[oddIndex] ?? 0;
        const tempReal = twiddleReal * oddReal - twiddleImag * oddImag;
        const tempImag = twiddleReal * oddImag + twiddleImag * oddReal;

        real[oddIndex] = (real[evenIndex] ?? 0) - tempReal;
        imag[oddIndex] = (imag[evenIndex] ?? 0) - tempImag;
        real[evenIndex] = (real[evenIndex] ?? 0) + tempReal;
        imag[evenIndex] = (imag[evenIndex] ?? 0) + tempImag;

        const nextReal = twiddleReal * stepReal - twiddleImag * stepImag;
        twiddleImag = twiddleReal * stepImag + twiddleImag * stepReal;
        twiddleReal = nextReal;
      }
    }
  }

  if (!inverse) {
    return;
  }

  for (let index = 0; index < size; index += 1) {
    real[index] = (real[index] ?? 0) / size;
    imag[index] = (imag[index] ?? 0) / size;
  }
}

export function createHannWindow(size: number) {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, size - 1));
  }
  return window;
}
