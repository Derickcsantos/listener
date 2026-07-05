import type { AudioInputDevice } from "../../types/domain.js";
import type { IAudioService } from "../interfaces/services.js";

export class AudioService implements IAudioService {
  private selectedDevice?: AudioInputDevice;

  setSelectedDevice(device: AudioInputDevice): void {
    this.selectedDevice = device;
  }

  getSelectedDevice(): AudioInputDevice | undefined {
    return this.selectedDevice;
  }
}
