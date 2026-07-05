import "./styles/app.css";
import type { AppConfiguration, AppSnapshot, AppStatus, AudioInputDevice, BibleReference, TranscriptLine } from "../types/domain";

const state: {
  status: AppStatus;
  configuration: AppConfiguration;
  devices: AudioInputDevice[];
  lines: TranscriptLine[];
  devicesLoaded: boolean;
  deviceError?: string;
  lastReference?: BibleReference;
  mediaStream?: MediaStream;
  audioContext?: AudioContext;
  meterContext?: AudioContext;
  processor?: ScriptProcessorNode;
  meterFrame?: number;
} = {
  status: "stopped",
  configuration: { bibleVersion: "NAA" },
  devices: [],
  devicesLoaded: false,
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
    <div id="appMessage" class="app-message" hidden></div>

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
      <label class="field"><span>Local do Holyrics</span><div class="path-row"><input id="holyricsPath" placeholder="Pasta do Holyrics ou Holyrics.exe" /><button id="browseHolyrics" type="button">Escolher</button></div></label>
      <label class="field"><span>Versao da Biblia</span><input id="bibleVersion" value="NAA" /></label>
      <div id="connectionResult" class="muted"></div>
      <div class="dialog-actions">
        <button id="testConnections" type="button">Testar conexao</button>
        <button id="testHolyricsAutomation" type="button">Testar automacao</button>
        <button id="saveSettings" class="primary" type="button">Salvar</button>
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
  appMessage: document.querySelector<HTMLDivElement>("#appMessage")!,
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
  testHolyricsAutomation: document.querySelector<HTMLButtonElement>("#testHolyricsAutomation")!,
  connectionResult: document.querySelector<HTMLDivElement>("#connectionResult")!,
  choiceList: document.querySelector<HTMLDivElement>("#choiceList")!,
  ignoreChoices: document.querySelector<HTMLButtonElement>("#ignoreChoices")!
};

void bootstrap();

async function bootstrap(): Promise<void> {
  bindEvents();
  render();

  try {
    const snapshot = await window.bibleListener.getSnapshot();
    applySnapshot(snapshot);
  } catch (error) {
    showMessage(`Falha ao carregar configuracoes: ${readableError(error)}`, "error");
  }

  await loadDevices();
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
  elements.testHolyricsAutomation.addEventListener("click", () => void testHolyricsAutomation());
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
  state.deviceError = undefined;
  state.devicesLoaded = false;
  render();

  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error("Este ambiente nao disponibilizou a API de dispositivos de audio.");
    }

    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    state.devices = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Dispositivo de audio ${index + 1}`
      }));
    state.devicesLoaded = true;

    if (state.devices.length === 0) {
      state.deviceError = "Nenhum dispositivo de entrada de audio foi encontrado.";
    }
  } catch (error) {
    state.devices = [];
    state.devicesLoaded = true;
    state.deviceError = readableError(error);
    showMessage(`Nao foi possivel carregar os dispositivos de audio: ${state.deviceError}`, "error");
  }
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
  clearMessage();
  const selected = selectedDevice();
  if (!selected) {
    showMessage("Selecione um dispositivo de audio antes de iniciar.", "error");
    return;
  }

  if (!state.configuration.holyricsPath) {
    showMessage("Configure o local do Holyrics antes de iniciar.", "error");
    openSettings();
    return;
  }

  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: selected.deviceId ? { exact: selected.deviceId } : undefined,
        channelCount: 1,
        sampleRate: 16000,
        noiseSuppression: true,
        echoCancellation: false
      }
    });

    await window.bibleListener.startListening(selected);
    startMeter(state.mediaStream);
    startPcmStreaming(state.mediaStream);
  } catch (error) {
    stopLocalAudio();
    await window.bibleListener.stopListening().catch(() => undefined);
    showMessage(`Nao foi possivel iniciar a escuta: ${readableError(error)}`, "error");
  }
}

async function stopListening(): Promise<void> {
  try {
    stopLocalAudio();
    await window.bibleListener.stopListening();
  } catch (error) {
    showMessage(`Nao foi possivel parar a escuta: ${readableError(error)}`, "error");
  }
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
  try {
    const path = await window.bibleListener.chooseHolyricsPath();
    if (path) elements.holyricsPath.value = path;
  } catch (error) {
    showMessage(`Nao foi possivel escolher o local do Holyrics: ${readableError(error)}`, "error");
  }
}

async function saveSettings(): Promise<void> {
  try {
    state.configuration = await window.bibleListener.saveConfiguration({
      gladiaApiKey: elements.gladiaKey.value.trim() || undefined,
      geminiApiKey: elements.geminiKey.value.trim() || undefined,
      holyricsPath: elements.holyricsPath.value.trim() || undefined,
      bibleVersion: elements.bibleVersion.value.trim() || "NAA"
    });
    clearMessage();
    render();
    elements.settingsDialog.close();
  } catch (error) {
    showMessage(`Nao foi possivel salvar as configuracoes: ${readableError(error)}`, "error");
  }
}

async function testConnections(): Promise<void> {
  try {
    elements.connectionResult.textContent = "Testando...";
    const result = await window.bibleListener.testConnections({
      gladiaApiKey: elements.gladiaKey.value.trim() || undefined,
      geminiApiKey: elements.geminiKey.value.trim() || undefined,
      holyricsPath: elements.holyricsPath.value.trim() || undefined,
      bibleVersion: elements.bibleVersion.value.trim() || "NAA"
    });
    const summary = [
      `Gladia: ${result.gladia ? "ok" : "falhou"}`,
      `Gemini: ${result.gemini ? "ok" : "falhou"}`,
      `Holyrics: ${result.holyrics ? "ok" : "falhou"}`
    ].join(" | ");
    const details = [...result.errors, ...result.warnings].join(" | ");
    elements.connectionResult.textContent = details ? `${summary} | ${details}` : summary;
  } catch (error) {
    elements.connectionResult.textContent = `Falha no teste: ${readableError(error)}`;
  }
}

async function testHolyricsAutomation(): Promise<void> {
  try {
    elements.connectionResult.textContent = "Testando automacao do Holyrics com Mateus 20:2...";
    const result = await window.bibleListener.testHolyricsAutomation({
      holyricsPath: elements.holyricsPath.value.trim() || undefined,
      bibleVersion: elements.bibleVersion.value.trim() || "NAA"
    });
    const status = result.confirmed ? "Automacao confirmada" : "Automacao parcial";
    const diagnostic = result.diagnosticPath ? ` Diagnostico: ${result.diagnosticPath}` : "";
    elements.connectionResult.textContent = `${status}. ${result.logs.join(" ")}${diagnostic}`;
  } catch (error) {
    elements.connectionResult.textContent = `Falha na automacao do Holyrics: ${readableError(error)}`;
  }
}

function selectedDevice(): AudioInputDevice | undefined {
  return state.devices.find((device) => device.deviceId === elements.deviceSelect.value);
}

function startMeter(stream: MediaStream): void {
  state.meterContext = new AudioContext();
  const source = state.meterContext.createMediaStreamSource(stream);
  const analyser = state.meterContext.createAnalyser();
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
  const context = new AudioContext();
  state.audioContext = context;
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm = downsampleTo16BitPcm(input, context.sampleRate, 16000);
    const chunk = new ArrayBuffer(pcm.byteLength);
    new Uint8Array(chunk).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    void window.bibleListener.sendAudioChunk(chunk);
  };
  source.connect(processor);
  processor.connect(context.destination);
  state.processor = processor;
}

function stopLocalAudio(): void {
  state.processor?.disconnect();
  state.processor = undefined;
  void state.audioContext?.close();
  state.audioContext = undefined;
  void state.meterContext?.close();
  state.meterContext = undefined;
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.mediaStream = undefined;
  if (state.meterFrame) cancelAnimationFrame(state.meterFrame);
  state.meterFrame = undefined;
  elements.meterBar.style.width = "0%";
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
  elements.listenButton.disabled = state.status === "listening" || state.devices.length === 0;
  elements.stopButton.disabled = state.status === "stopped";
  elements.lineCounter.textContent = String(state.lines.length);
  elements.lastReference.textContent = state.lastReference ? formatReference(state.lastReference) : "Nenhuma";
  renderDevices();
}

function renderDevices(): void {
  const selected = state.configuration.audioDeviceId;
  elements.deviceSelect.innerHTML = "";

  if (!state.devicesLoaded) {
    const option = document.createElement("option");
    option.textContent = "Carregando dispositivos...";
    option.value = "";
    elements.deviceSelect.append(option);
    elements.deviceSelect.disabled = true;
    return;
  }

  if (state.devices.length === 0) {
    const option = document.createElement("option");
    option.textContent = state.deviceError ? "Nenhum dispositivo disponivel" : "Nenhum dispositivo encontrado";
    option.value = "";
    elements.deviceSelect.append(option);
    elements.deviceSelect.disabled = true;
    return;
  }

  elements.deviceSelect.disabled = state.status === "listening";
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

function showMessage(message: string, tone: "error" | "info" = "info"): void {
  elements.appMessage.textContent = message;
  elements.appMessage.dataset.tone = tone;
  elements.appMessage.hidden = false;
}

function clearMessage(): void {
  elements.appMessage.textContent = "";
  elements.appMessage.hidden = true;
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
