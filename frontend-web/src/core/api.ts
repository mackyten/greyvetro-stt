import {
  DEFAULT_MODEL_ID,
  type Scene,
  type Transcript,
  type Usage,
  type Voice,
  type VoiceSettings,
} from './types';

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

export async function transcribeAudio(audio: Blob, fileName = 'clip.mp3'): Promise<Transcript> {
  const form = new FormData();
  form.append('file', audio, fileName);
  const res = await checkStatus(await fetch(`${BASE}/stt`, { method: 'POST', body: form }));
  return res.json();
}

export async function generateScript(
  topic: string,
  instructions?: string,
  targetSeconds = 60,
): Promise<string> {
  const res = await checkStatus(
    await fetch(`${BASE}/script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, instructions, targetSeconds }),
    }),
  );
  return (await res.json()).script;
}

export async function generateScenes(
  transcript: Transcript,
  instructions?: string,
): Promise<Scene[]> {
  const res = await checkStatus(
    await fetch(`${BASE}/script/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, instructions }),
    }),
  );
  return (await res.json()).scenes;
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
