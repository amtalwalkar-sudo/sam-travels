export async function exerciseWorkShiftEntryPath(page) {
  await page.getByLabel("Shift-start odometer (km)").fill("1000");
  await page.getByRole("button", { name: "Start shift", exact: true }).click();
  await page.getByLabel("Shift-end odometer (km)").waitFor({ state: "visible" });
  await page.getByLabel("Shift-end odometer (km)").fill("1050");
  await page.getByRole("button", { name: "End shift", exact: true }).click();
  await page.getByRole("button", { name: "Start shift", exact: true }).waitFor({ state: "visible" });
  await page.getByText("1,050 km", { exact: true }).waitFor({ state: "visible" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start shift", exact: true }).waitFor({ state: "visible" });
  await page.getByText("1,050 km", { exact: true }).waitFor({ state: "visible" });
}

export async function exerciseComplianceRenewalEntryPath(page, monthDateOffset, complianceValidTo) {
  await page.getByRole("button", { name: "Add compliance / renewal", exact: true }).click();
  await page.getByLabel("Compliance type / name").fill("Acceptance Insurance");
  await page.getByLabel("Valid from").fill(monthDateOffset(13));
  await page.getByLabel("Valid until").fill(monthDateOffset(25));
  await page.getByLabel("Total cost (₹)").fill("13000");
  await page.getByLabel("Renewing previous record").selectOption({
    label: "Acceptance Insurance · valid to " + complianceValidTo,
  });
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Compliance record saved." }).last().waitFor({ state: "visible" });
  await page.getByText("Renewal linked to previous record", { exact: true }).waitFor({ state: "visible" });
}
