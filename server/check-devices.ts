// Milestone 1 verification script.
// Prints every Govee device with its sku, name, deviceId, and full capability
// list, then explicitly flags which devices expose segmentedColorRgb (the
// capability the grid UI depends on).
//
// Run: bun run check-devices

import { listDevices, supportsSegmentColor, segmentCount, GoveeError } from "./govee.ts";

function divider() {
  console.log("─".repeat(72));
}

try {
  const devices = await listDevices();

  console.log(`\nFound ${devices.length} device(s) on this Govee account.\n`);

  const segmentCapable: typeof devices = [];

  for (const d of devices) {
    const ok = supportsSegmentColor(d);
    if (ok) segmentCapable.push(d);

    divider();
    console.log(`  SKU:       ${d.sku}`);
    console.log(`  Name:      ${d.deviceName}`);
    console.log(`  DeviceId:  ${d.device}`);
    console.log(`  Type:      ${d.type}`);
    console.log(`  segmentedColorRgb: ${ok ? "YES ✓" : "no"}`);
    const segCount = segmentCount(d);
    if (segCount != null) console.log(`  Segments (advertised max): ${segCount}`);
    console.log(`  Capabilities (${d.capabilities.length}):`);
    for (const c of d.capabilities) {
      console.log(`    - ${c.type}  [instance: ${c.instance}]`);
    }
  }
  divider();

  console.log(`\nSUMMARY`);
  console.log(`  Total devices:            ${devices.length}`);
  console.log(`  segmentedColorRgb-capable: ${segmentCapable.length}`);

  const h703b = devices.filter((d) => d.sku === "H703B");
  console.log(`\n  H703B units found: ${h703b.length}`);
  for (const d of h703b) {
    const ok = supportsSegmentColor(d);
    console.log(
      `    ${d.deviceName} (${d.device}) -> segmentedColorRgb: ${ok ? "SUPPORTED ✓" : "NOT SUPPORTED ✗"}`,
    );
  }

  if (h703b.length === 0) {
    console.log(`\n  ⚠  No H703B found. Make sure it is online in the Govee Home app.`);
  } else if (h703b.every((d) => !supportsSegmentColor(d))) {
    console.log(
      `\n  ✗ STOP: the H703B does NOT expose segmentedColorRgb. The grid UI` +
        ` depends on per-segment color, so we cannot proceed to the UI milestones` +
        ` until this is resolved.`,
    );
  } else {
    console.log(`\n  ✓ H703B supports per-segment color. Clear to proceed to Milestone 2.`);
  }
  console.log("");
} catch (err) {
  if (err instanceof GoveeError) {
    console.error(`\n✗ Govee API error (status ${err.status}): ${err.message}`);
    if (err.isRateLimit) {
      console.error(`  Rate limited. Retry after ${err.retryAfter ?? "?"}s.`);
    }
    if (err.status === 500 && err.message.includes("GOVEE_API_KEY")) {
      console.error(
        `\n  Fix: cp .env.example .env  then put your real key in GOVEE_API_KEY.`,
      );
    }
  } else {
    console.error(`\n✗ Unexpected error:`, err);
  }
  process.exit(1);
}
