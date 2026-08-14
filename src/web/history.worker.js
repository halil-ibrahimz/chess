import { createHistoryWorkerController } from "./worker-controller.js";

const controller = createHistoryWorkerController({
  postMessage: (message) => self.postMessage(message),
});

self.addEventListener("message", (event) => {
  void controller.handleMessage(event.data);
});
