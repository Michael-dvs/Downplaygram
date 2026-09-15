import { describe, it, expect } from 'vitest';
import { createVideoFromPhotoAndAudio } from '../src/lib/video-synthesizer';

describe('video-synthesizer', () => {
  it('exports createVideoFromPhotoAndAudio function', () => {
    expect(typeof createVideoFromPhotoAndAudio).toBe('function');
  });

  it('rejects if fetch fails for image or audio', async () => {
    // In Node test environment, fetch to invalid URL will reject
    await expect(
      createVideoFromPhotoAndAudio('http://invalid-test-url/photo.jpg', 'http://invalid-test-url/audio.mp4')
    ).rejects.toThrow();
  });
});
