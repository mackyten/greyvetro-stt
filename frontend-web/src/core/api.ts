import { DEFAULT_MODEL_ID, type Usage, type Voice, type VoiceSettings } from './types';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5050';

async function checkStatus(res: Response): Promise<Response> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res;
}

export async function getVoices(): Promise<Voice[]> {
  const res = await checkStatus(await fetch(`${BASE}/voices`));
  return res.json();
}

export async function getUsage(): Promise<Usage> {
  const res = await checkStatus(await fetch(`${BASE}/usage`));
  return res.json();
}

export async function generateSpeech(
  text: string,
  voiceId: string,
  settings: VoiceSettings,
): Promise<Blob> {
  const res = await checkStatus(
    await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceId,
        stability: settings.stability,
        similarityBoost: settings.similarityBoost,
        style: settings.style,
        useSpeakerBoost: settings.useSpeakerBoost,
        modelId: settings.modelId ?? DEFAULT_MODEL_ID,
      }),
    }),
  );
  return res.blob();
}

export async function cloneVoice(
  name: string,
  description: string,
  files: File[],
): Promise<Voice> {
  const form = new FormData();
  form.append('name', name);
  form.append('description', description);
  for (const f of files) form.append('files', f);
  const res = await checkStatus(
    await fetch(`${BASE}/voices/clone`, { method: 'POST', body: form }),
  );
  return res.json();
}
