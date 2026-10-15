// Audio utilities for PCM encoding/decoding

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function float32To16BitPCM(float32Arr: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Arr.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Arr.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Arr[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  // Ensure even number of bytes for 16-bit PCM
  const evenBytesLength = data.byteLength - (data.byteLength % 2);
  if (evenBytesLength <= 0) {
    return ctx.createBuffer(numChannels, 1, sampleRate);
  }

  const samplesCount = Math.floor(evenBytesLength / 2);
  const frameCount = Math.max(1, Math.floor(samplesCount / numChannels));
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  const dataView = new DataView(data.buffer, data.byteOffset, evenBytesLength);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      const byteIndex = (i * numChannels + channel) * 2;
      if (byteIndex + 1 < evenBytesLength) {
        const int16 = dataView.getInt16(byteIndex, true);
        channelData[i] = int16 / 32768.0;
      } else {
        channelData[i] = 0;
      }
    }
  }
  return buffer;
}
// Baja una señal de la tasa del dispositivo (44.1/48 kHz) a 16 kHz promediando
// muestras, que es lo que espera Gemini Live. Si ya viene a 16 kHz, la regresa igual.
export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  let pos = 0;
  for (let i = 0; i < outLength; i++) {
    const next = Math.round((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = pos; j < next && j < input.length; j++) { sum += input[j]; count++; }
    out[i] = count ? sum / count : 0;
    pos = next;
  }
  return out;
}
