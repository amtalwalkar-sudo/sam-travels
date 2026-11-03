import "fake-indexeddb/auto";
import {beforeEach,describe,expect,it} from "vitest";
import {browserDatabase} from "../packages/storage-browser/src/database";
import {DexieDriverWorkflowRepository} from "../packages/storage-browser/src/driver-workflow";
import {createDriverCommand} from "../packages/application/src/driver-workflow-service";
import type {GpsFix} from "../packages/core/src/types";
const gps:GpsFix={latitude:19.076,longitude:72.8777,horizontalAccuracyM:8,fixAt:"2026-11-03T10:00:00.000Z",provider:"browser-geolocation"};
describe("durable single-driver workflow",()=>{
 beforeEach(async()=>{await browserDatabase.delete();await browserDatabase.open()});
 it("queues first and atomically commits event, projection, status and outbox",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot(),command=createDriverCommand(state,"shift_start","pwa","cmd-1","2026-11-03T10:00:00.000Z");
  const intent=await repo.queueIntent({command,status:"pending_location",createdAt:command.transitionAt,updatedAt:command.transitionAt});
  expect(intent.status).toBe("pending_location");expect((await repo.getSnapshot()).state).toBe("idle");
  const next=await repo.completeIntent(command.eventId,gps,command.transitionAt);
  expect(next.state).toBe("shift_active");expect(next.revision).toBe(1);
  expect(await repo.listEvents()).toHaveLength(1);expect((await repo.getIntent(command.eventId))?.status).toBe("recorded");
  await expect(repo.completeIntent(command.eventId,gps,command.transitionAt)).rejects.toThrow();
  expect((await repo.getSnapshot()).revision).toBe(1);
 });
 it("rejects stale competing commands rather than last-write-wins",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot();
  const first=createDriverCommand(state,"shift_start","pwa","cmd-a","2026-11-03T10:00:00.000Z");
  await repo.queueIntent({command:first,status:"pending_location",createdAt:first.transitionAt,updatedAt:first.transitionAt});
  const second=createDriverCommand(state,"shift_start","native_overlay","cmd-b","2026-11-03T10:00:01.000Z");
  await repo.queueIntent({command:second,status:"pending_location",createdAt:second.transitionAt,updatedAt:second.transitionAt});
  await repo.completeIntent(first.eventId,gps,first.transitionAt);
  await expect(repo.completeIntent(second.eventId,gps,second.transitionAt)).rejects.toThrow("stale_revision");
  expect((await repo.getSnapshot()).revision).toBe(1);
 });
 it("retains failed location intents for recovery without advancing state",async()=>{
  const repo=new DexieDriverWorkflowRepository(),state=await repo.getSnapshot(),command=createDriverCommand(state,"shift_start","pwa","cmd-pending","2026-11-03T10:00:00.000Z");
  await repo.queueIntent({command,status:"pending_location",createdAt:command.transitionAt,updatedAt:command.transitionAt});
  await repo.markNeedsAttention(command.eventId,"permission_denied");
  expect((await repo.listPending())[0].status).toBe("needs_attention");
  expect((await repo.getSnapshot()).revision).toBe(0);
 });
});
