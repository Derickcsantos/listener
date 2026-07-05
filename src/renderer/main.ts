import "./styles/app.css";
import type { AppConfiguration, AppSnapshot, AppStatus, AudioInputDevice, BibleReference, TranscriptLine } from "../types/domain";

const state: {
  status: AppStatus;
  configuration: AppConfiguration;
  devices: AudioInputDevice[];
  lines: TranscriptLine[];
  lastReference?: BibleReference;
  mediaStream?: MediaStream;
  audioContext?: AudioContext;
  processor?: ScriptProcessorNode;
  meterFrame?: number;
} = {
  status: "stopped",
  configuration: { bibleVersion: "NAA" },
  devices: [],
  lines: []
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found.");

app.innerHTML = `
  <main class="shell">
    <section class="topbar">
      <div>
        <h1>Bible Listener</h1>
        <p class="muted">Escuta continua, transcricao em tempo real e abertura automatica no Holyrics.</p>
      </div>
      <div class="status-pill" data-status="stopped">PARADO</div>
    </section>

    <section class="toolbar">
      <label class="field">
        <span>Dispositivo</span>
        <select id="deviceSelect"></select>
      </label>
      <button id="listenButton" class="primary">Ouvir</button>
      <button id="stopButton">Parar</button>
      <button id="settingsButton">Configuracoes</button>
      <button id="finishButton">Finalizar</button>
    </section>

    <section class="metrics">
      <div>
        <span class="label">Ultima referencia</span>
        <strong id="lastReference">Nenhuma</strong>
      </div>
      <div>
        <span class="label">Linhas transcritas</span>
        <strong id="lineCounter">0</strong>
      </div>
      <div>
        <span class="label">Microfone</span>
        <div class="meter"><span id="meterBar"></span></div>
      </div>
    </section>

    <section class="transcript">
      <div class="section-title">Transcricao em tempo real</div>
      <div id="transcriptLines" class="transcript-lines"></div>
    </section>
  </main>

  <dialog id="settingsDialog" class="dialog">
    <form method="dialog" class="dialog-content">
      <h2>Configuracoes</h2>
      <label class="field"><span>Gladia API Key</span><input id="gladiaKey" type="password" /></label>
      <label class="field"><span>Gemini API Key</span><input id="geminiKey" type="password" /></label>
      <label class="field"><span>Local do Holyrics</span><div class="path-row"><input id="holyricsPath" /><button id="browseHolyrics" type="button">Escolher</button></div></label>
      <label class="field"><span>Versao da Biblia</span><input id="bibleVersion" value="NAA" /></label>
      <div id="connectionResult" class="muted"></div>
      <div class="dialog-actions">
        <button id="testConnections" type="button">Testar conexao</button>
        <button id="saveSettings" class="primary" value="save">Salvar</button>
      </div>
    </form>
  </dialog>

  <dialog id="choiceDialog" class="dialog">
    <div class="dialog-content">
      <h2>Escolha a referencia</h2>
      <div id="choiceList" class="choice-list"></div>
      <div class="dialog-actions">
        <button id="ignoreChoices">Ignorar</button>
      </div>
    </div>
  </dialog>
`;

const elements = {
  statusPill: document.querySelector<HTMLDivElement>(".status-pill")!,
  deviceSelect: document.querySelector<HTMLSelectElement>("#deviceSelect")!,
  listenButton: document.querySelector<HTMLButtonElement>("#listenButton")!,
  stopButton: document.querySelector<HTMLButtonElement>("#stopButton")!,
  settingsButton: document.querySelector<HTMLButtonElement>("#settingsButton")!,
  finishButton: document.querySelector<HTMLButtonElement>("#finishButton")!,
  lastReference: document.querySelector<HTMLDivElement>("#lastReference")!,
  lineCounter: document.querySelector<HTMLDivElement>("#lineCounter")!,
  meterBar: document.querySelector<HTMLSpanElement>("#meterBar")!,
  transcriptLines: document.querySelector<HTMLDivElement>("#transcriptLines")!,
  settingsDialog: document.querySelector<HTMLDialogElement>("#settingsDialog")!,
  choiceDialog: document.querySelector<HTMLDialogElement>("#choiceDialog")!,
  gladiaKey: document.querySelector<HTMLInputElement>("#gladiaKey")!,
  geminiKey: document.querySelector<HTMLInputElement>("#geminiKey")!,
  holyricsPath: document.querySelector<HTMLInputElement>("#holyricsPath")!,
  bibleVersion: document.querySelector<HTMLInputElement>("#bibleVersion")!,
  browseHolyrics: document.querySelector<HTMLButtonElement>("#browseHolyrics")!,
  saveSettings: document.querySelector<HTMLButtonElement>("#saveSettings")!,
  testConnections: document.querySelector<HTMLButtonElement>("#testConnections")!,
  connectionResult: document.querySelector<HTMLDivElement>("#connectionResult")!,
  choiceList: document.querySelector<HTMLDivElement>("#choiceList")!,
  ignoreChoices: document.querySelector<HTMLButtonElement>("#ignoreChoices")!
};

void bootstrap();

async function bootstrap(): Promise<void> {
  const snapshot = await window.bibleListener.getSnapshot();
  applySnapshot(snapshot);
  await loadDevices();
  bindEvents();
  render();
  if (!state.configuration.holyricsPath) {
    openSettings();
  }
}

function bindEvents(): void {
  elements.listenButton.addEventListener("click", () => void startListening());
  elements.stopButton.addEventListener("click", () => void stopListening());
  elements.settingsButton.addEventListener("click", openSettings);
  elements.finishButton.addEventListener("click", () => void finishSession());
  elements.browseHolyrics.addEventListener("click", () => void chooseHolyricsPath());
  elements.saveSettings.addEventListener("click", () => void saveSettings());
  elements.testConnections.addEventListener("click", () => void testConnections());
  elements.ignoreChoices.addEventListener("click", () => elements.choiceDialog.close());

  window.bibleListener.onStatusChanged((status) => {
    state.status = status;
    render();
  });
  window.bibleListener.onTranscriptLine((line) => {
    state.lines.push(line);
    renderTranscriptLine(line);
    render();
  });
  window.bibleListener.onLastReference((reference) => {
    state.lastReference = reference;
    render();
  });
  window.bibleListener.onMultipleReferences(showReferenceChoices);
  window.bibleListener.onError((message) => alert(message));
}

async function loadDevices(): Promise<void> {
  await navigator.mediaDevices.getUserMedia({ audio: true });
  const devices = await navigator.mediaDevices.enumerateDevices();
  state.devices = devices
    .filter((device) => device.kind === "audioinput")
    .map((device) => ({ deviceId: device.deviceId, label: device.label || "Microfone sem nome" }));
}

function applySnapshot(snapshot: AppSnapshot): void {
  state.status = snapshot.status;
  state.configuration = snapshot.configuration;
  state.lines = snapshot.transcriptLines;
  state.lastReference = snapshot.lastOpenedReference;
  elements.transcriptLines.innerHTML = "";
  state.lines.forEach(renderTranscriptLine);
}

async function startListening(): Promise<void> {
  const selected = selectedDevice();
  if (!selected) {
    alert("Selecione um dispositivo de audio.");
    return;
  }

  if (!state.configuration.holyricsPath) {
    openSettings();
    return;
  }

  state.mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: selected.deviceId ? { exact: selected.deviceId } : undefined,
      channelCount: 1,
      sampleRate: 16000,
      noiseSuppression: true,
      echoCancellation: false
    }
  });

  startMeter(state.mediaStream);
  startPcmStreaming(state.mediaStream);
  await window.bibleListener.startListening(selected);
}

async function stopListening(): Promise<void> {
  state.processor?.disconnect();
  state.audioContext?.close();
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  if (state.meterFrame) cancelAnimationFrame(state.meterFrame);
  elements.meterBar.style.width = "0%";
  await window.bibleListener.stopListening();
}

async function finishSession(): Promise<void> {
  if (state.status === "listening") {
    await stopListening();
  }
  const path = await window.bibleListener.finishSession();
  if (path) {
    state.lines = [];
    elements.transcriptLines.innerHTML = "";
    render();
    alert(`Transcricao salva em:\n${path}`);
  }
}

function openSettings(): void {
  elements.gladiaKey.value = state.configuration.gladiaApiKey ?? "";
  elements.geminiKey.value = state.configuration.geminiApiKey ?? "";
  elements.holyricsPath.value = state.configuration.holyricsPath ?? "";
  elements.bibleVersion.value = state.configuration.bibleVersion ?? "NAA";
  elements.settingsDialog.showModal();
}

async function chooseHolyricsPath(): Promise<void> {
  const path = await window.bibleListener.chooseHolyricsPath();
  if (path) elements.holyricsPath.value = path;
}

async function saveSettings(): Promise<void> {
  state.configuration = await window.bibleListener.saveConfiguration({
    gladiaApiKey: elements.gladiaKey.value.trim() || undefined,
    geminiApiKey: elements.geminiKey.value.trim() || undefined,
    holyricsPath: elements.holyricsPath.value.trim() || undefined,
    bibleVersion: elements.bibleVersion.value.trim() || "NAA"
  });
  render();
}

async function testConnections(): Promise<void> {
  elements.connectionResult.textContent = "Testando...";
  const result = await window.bibleListener.testConnections();
  elements.connectionResult.textContent = `Gladia: ${result.gladia ? "ok" : "falhou"} | Gemini: ${result.gemini ? "ok" : "falhou"}`;
}

function selectedDevice(): AudioInputDevice | undefined {
  return state.devices.find((device) => device.deviceId === elements.deviceSelect.value);
}

function startMeter(stream: MediaStream): void {
  state.audioContext = new AudioContext();
  const source = state.audioContext.createMediaStreamSource(stream);
  const analyser = state.audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  const tick = () => {
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;
    elements.meterBar.style.width = `${Math.min(100, average)}%`;
    state.meterFrame = requestAnimationFrame(tick);
  };
  tick();
}

function startPcmStreaming(stream: MediaStream): void {
  const context = state.audioContext ?? new AudioContext();
  state.audioContext = context;
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm = downsampleTo16BitPcm(input, context.sampleRate, 16000);
    void window.bibleListener.sendAudioChunk(pcm.buffer);
  };
  source.connect(processor);
  processor.connect(context.destination);
  state.processor = processor;
}

function downsampleTo16BitPcm(input: Float32Array, sourceRate: number, targetRate: number): Int16Array {
  if (targetRate === sourceRate) {
    return floatTo16BitPcm(input);
  }

  const ratio = sourceRate / targetRate;
  const length = Math.floor(input.length / ratio);
  const result = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.floor((index + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let inputIndex = start; inputIndex < end && inputIndex < input.length; inputIndex += 1) {
      sum += input[inputIndex];
      count += 1;
    }
    result[index] = count > 0 ? sum / count : 0;
  }
  return floatTo16BitPcm(result);
}

function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function showReferenceChoices(references: BibleReference[]): void {
  elements.choiceList.innerHTML = "";
  references.forEach((reference) => {
    const button = document.createElement("button");
    button.textContent = `Abrir ${formatReference(reference)}`;
    button.addEventListener("click", () => {
      void window.bibleListener.openReference(reference);
      elements.choiceDialog.close();
    });
    elements.choiceList.append(button);
  });
  elements.choiceDialog.showModal();
}

function render(): void {
  elements.statusPill.textContent = state.status === "listening" ? "OUVINDO" : "PARADO";
  elements.statusPill.dataset.status = state.status;
  elements.listenButton.disabled = state.status === "listening";
  elements.stopButton.disabled = state.status === "stopped";
  elements.lineCounter.textContent = String(state.lines.length);
  elements.lastReference.textContent = state.lastReference ? formatReference(state.lastReference) : "Nenhuma";
  renderDevices();
}

function renderDevices(): void {
  const selected = state.configuration.audioDeviceId;
  elements.deviceSelect.innerHTML = "";
  state.devices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label;
    option.selected = device.deviceId === selected;
    elements.deviceSelect.append(option);
  });
}

function renderTranscriptLine(line: TranscriptLine): void {
  const item = document.createElement("div");
  item.className = "line";
  item.textContent = line.text;
  elements.transcriptLines.append(item);
  elements.transcriptLines.scrollTop = elements.transcriptLines.scrollHeight;
}

function formatReference(reference: BibleReference): string {
  return `${reference.book} ${reference.chapter}:${reference.verse} ${reference.version}`;
}
