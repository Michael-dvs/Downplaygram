/**
 * Downplaygram Video Synthesizer
 * Merges static photo stories with music audio stickers into a unified macOS/QuickTime-compatible MP4 video
 * using client-side WebCodecs and mp4-muxer.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

/**
 * Determines the best supported H.264 profile codec string for 1080x1920 video
 */
async function getSupportedVideoCodec(width: number, height: number): Promise<string> {
  const candidates = [
    'avc1.42001f', // H.264 Baseline Profile Level 3.1
    'avc1.420028', // H.264 Baseline Profile Level 4.0 (1080p)
    'avc1.420029', // H.264 Baseline Profile Level 4.1
    'avc1.4d002a', // H.264 Main Profile Level 4.2
    'avc1.64002a', // H.264 High Profile Level 4.2
  ];

  if (typeof VideoEncoder !== 'undefined' && typeof VideoEncoder.isConfigSupported === 'function') {
    for (const codec of candidates) {
      try {
        const res = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate: 3_000_000,
          framerate: 30,
        });
        if (res.supported) {
          return codec;
        }
      } catch {
        // Test next candidate
      }
    }
  }

  return 'avc1.42001f';
}

/**
 * Combines a static photo and audio stream into a unified MP4 video (H.264 + AAC)
 * optimized for macOS QuickTime Player and Finder Quick Look.
 */
export async function createVideoFromPhotoAndAudio(
  imageUrl: string,
  audioUrl: string,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  onProgress?.('Memuat aset...');

  // 1. Fetch photo and audio data in parallel
  const [imageBlob, audioArrayBuffer] = await Promise.all([
    fetch(imageUrl).then((r) => {
      if (!r.ok) throw new Error(`Gagal memuat foto (${r.status})`);
      return r.blob();
    }),
    fetch(audioUrl).then((r) => {
      if (!r.ok) throw new Error(`Gagal memuat audio (${r.status})`);
      return r.arrayBuffer();
    }),
  ]);

  // 2. Decode Audio using Web Audio API to extract PCM samples
  onProgress?.('Memproses audio...');
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer.slice(0));
  } catch (err) {
    await audioCtx.close();
    throw new Error(`Gagal mendecode data audio: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Cap duration at maximum 15s to match Instagram Story limit
  const duration = Math.min(audioBuffer.duration, 15);
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = Math.min(audioBuffer.numberOfChannels, 2);

  // 3. Prepare Canvas with standard Instagram Story dimensions (1080 x 1920)
  onProgress?.('Menyiapkan visual...');
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    await audioCtx.close();
    throw new Error('Gagal menginisialisasi konteks 2D Canvas');
  }

  // Draw black background and render centered photo with preserved aspect ratio
  const imgBitmap = await createImageBitmap(imageBlob);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(canvas.width / imgBitmap.width, canvas.height / imgBitmap.height);
  const x = canvas.width / 2 - (imgBitmap.width / 2) * scale;
  const y = canvas.height / 2 - (imgBitmap.height / 2) * scale;
  ctx.drawImage(imgBitmap, x, y, imgBitmap.width * scale, imgBitmap.height * scale);
  imgBitmap.close();

  // 4. Initialize MP4 Muxer (with fastStart for Apple QuickTime / macOS compatibility)
  const muxerTarget = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: muxerTarget,
    video: {
      codec: 'avc',
      width: canvas.width,
      height: canvas.height,
    },
    audio: {
      codec: 'aac',
      numberOfChannels: numberOfChannels,
      sampleRate: sampleRate,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError: Error | null = null;

  // 5. Encode Video Track using WebCodecs (H.264)
  onProgress?.('Menggabungkan video...');
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      console.error('[Downplaygram] VideoEncoder error:', e);
      encoderError = e;
    },
  });

  const chosenCodec = await getSupportedVideoCodec(canvas.width, canvas.height);
  videoEncoder.configure({
    codec: chosenCodec,
    width: canvas.width,
    height: canvas.height,
    bitrate: 3_000_000,
    framerate: 30,
  });

  // Render 30 frames per second over the audio duration
  const fps = 30;
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) throw encoderError;

    const timestampUs = Math.round((i / fps) * 1_000_000);
    const videoFrame = new VideoFrame(canvas, {
      timestamp: timestampUs,
      duration: Math.round((1 / fps) * 1_000_000),
    });

    // Provide keyframe every 2 seconds (60 frames)
    videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
    videoFrame.close();

    // Prevent memory pressure if queue backs up
    if (videoEncoder.encodeQueueSize > 15) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  await videoEncoder.flush();
  if (encoderError) throw encoderError;

  // 6. Encode Audio Track using WebCodecs (AAC-LC)
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      console.error('[Downplaygram] AudioEncoder error:', e);
      encoderError = e;
    },
  });

  audioEncoder.configure({
    codec: 'mp4a.40.2', // AAC-LC
    numberOfChannels: numberOfChannels,
    sampleRate: sampleRate,
    bitrate: 128_000,
  });

  // Chunk PCM data into standard 1024-frame AAC-sized AudioData slices
  const totalAudioFrames = Math.floor(duration * sampleRate);
  const CHUNK_SIZE = 1024;

  for (let offset = 0; offset < totalAudioFrames; offset += CHUNK_SIZE) {
    if (encoderError) throw encoderError;

    const chunkFrames = Math.min(CHUNK_SIZE, totalAudioFrames - offset);
    const chunkBuffer = new Float32Array(chunkFrames * numberOfChannels);

    // Build planar buffer format (plane 0 followed by plane 1, etc.)
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      chunkBuffer.set(channelData.subarray(offset, offset + chunkFrames), ch * chunkFrames);
    }

    const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: sampleRate,
      numberOfFrames: chunkFrames,
      numberOfChannels: numberOfChannels,
      timestamp: timestampUs,
      data: chunkBuffer,
    });

    audioEncoder.encode(audioData);
    audioData.close();

    if (audioEncoder.encodeQueueSize > 20) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  await audioEncoder.flush();
  if (encoderError) throw encoderError;

  // 7. Finalize Muxer and close Audio Context
  muxer.finalize();
  await audioCtx.close();

  return new Blob([muxerTarget.buffer], { type: 'video/mp4' });
}
