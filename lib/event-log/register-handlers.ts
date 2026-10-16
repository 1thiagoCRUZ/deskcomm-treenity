import { followupGatilhoPresencaHandler } from "@/lib/followup/gatilho-presenca.handler";
/**
 * Centralised handler registration for the event_log dispatcher.
 *
 * Imported by the cron drain route (and the workers entry point) so a single
 * call wires every consumer. Keep it lightweight — no DB calls at import time.
 */

import { lgpdExportHandler } from "@/workers/lgpd-export-worker.handler";
import { lgpdRedactHandler } from "@/workers/lgpd-redact-worker.handler";
import { automationRulesHandler } from "@/lib/automation/engine.handler";
import { followupReactivityHandler } from "@/lib/followup/reactivity.handler";
import { followupGatilhoEtapaHandler } from "@/lib/followup/gatilho-etapa.handler";
import { followupGatilhoCasoHandler } from "@/lib/followup/gatilho-caso.handler";
import { mediaPersistHandler } from "@/workers/media-persist-worker.handler";
import { mediaDeriveHandler } from "@/workers/media-derive-worker.handler";
import { webPushInboundHandler } from "@/lib/notifications/push.handler";
import { registerHandler } from "@/lib/event-log/dispatcher";

let _registered = false;

export function ensureHandlersRegistered(): void {
  if (_registered) return;
  registerHandler(followupReactivityHandler);
  registerHandler(lgpdExportHandler);
  registerHandler(lgpdRedactHandler);
  registerHandler(automationRulesHandler);
  registerHandler(followupGatilhoEtapaHandler);
  registerHandler(followupGatilhoCasoHandler);
  registerHandler(followupGatilhoPresencaHandler);
  registerHandler(mediaPersistHandler);
  registerHandler(mediaDeriveHandler);
  registerHandler(webPushInboundHandler);
  _registered = true;
}
