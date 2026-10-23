import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, role: string) {
  const enterDemo=page.getByRole("button", {name:"Enter demo", exact:true});
  const currentRole=page.locator(".topbar .badge");
  // The splash screen shows while the session check runs; wait for either
  // the signed-out entry button or the signed-in topbar before acting.
  await expect(enterDemo.or(currentRole)).toBeVisible();
  if (await enterDemo.isVisible().catch(()=>false)) {
    await enterDemo.click();
  }
  await expect(currentRole).toBeVisible();
  const current=await currentRole.textContent();
  if (["coordinator","operator"].includes(role) && ["coordinator","operator"].includes(current??"")) {
    if (current !== role) await page.getByRole("button", {name:`Switch to ${role}`, exact:true}).click();
  } else {
    const response=await page.context().request.post(new URL("/api/v1/auth/login", page.url()).toString(), {data:{username:role,password:`demo-${role}-360`}});
    expect(response.ok()).toBeTruthy();
    await page.reload();
  }
  await expect(page.locator(".topbar .badge")).toHaveText(role);
}

test("five-scene persisted loop and mobile layout", async ({page}, testInfo)=>{
  await page.goto("/dashboard");
  await login(page,"coordinator");
  await expect(page.getByRole("heading",{name:"Surveillance by block",exact:true})).toBeVisible();
  await expect(page.getByText("DATA UNAVAILABLE",{exact:true}).first()).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("dashboard-desktop.png"),fullPage:true});
  await page.getByRole("link",{name:"Drone missions",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Candidate evidence"})).toBeVisible();
  await page.getByRole("button",{name:"Create new draft"}).click();
  await page.getByRole("button",{name:"Submit for review"}).click();
  for(const check of ["SIMULATED MODE","AUTHORIZED TEST ZONE","NO CHEMICAL PAYLOAD"]) await page.getByLabel(check,{exact:true}).check();
  await page.getByRole("button",{name:"Approve simulation",exact:true}).click();
  await expect(page.getByRole("heading",{name:"APPROVED",exact:true})).toBeVisible();
  const missionId=await page.getByLabel("Mission",{exact:true}).inputValue();
  await login(page,"operator");
  await page.getByLabel("Mission",{exact:true}).selectOption(missionId);
  await page.getByRole("button",{name:"Start simulation"}).click();
  // Findings accumulate across suite runs in a shared database, so a badge can appear more than once.
  await expect(page.getByText("MISSION_COMPLETED",{exact:true}).first()).toBeVisible({timeout:20000});
  await expect(page.getByText("SKIPPED",{exact:true}).first()).toBeVisible();
  await expect(page.getByText("MOCK_ACTION_RECORDED",{exact:true}).first()).toBeVisible();
  // Scope to the timeline: live-detection runs can add extra GROUND_REVIEW candidates to the findings list.
  const groundReview=page.locator(".timeline-event").getByText("GROUND_REVIEW",{exact:true});
  await expect(groundReview.first()).toBeVisible();
  await login(page,"coordinator");
  await page.getByLabel("PNG / JPEG · maximum 5 MB").setInputFiles("../../fixtures/images/aerial-001.png");
  await page.getByLabel("Linked asset").selectOption("asset-p02");
  await page.getByRole("button",{name:"Import private image"}).click();
  await expect(page.getByRole("status").filter({hasText:"DEMO_PREANNOTATED_V1"})).toBeVisible();
  await expect(page.getByText("Exact synthetic fixture match; copied human-authored annotation, not model inference")).toBeVisible({timeout:5000});
  await page.getByRole("link",{name:"Next-round planning",exact:true}).click();
  await page.getByLabel("Window start · UTC").fill("2026-10-09");
  await page.getByLabel("Window end · UTC").fill("2026-10-16");
  await page.getByRole("button",{name:"Recompute allocation"}).click();
  await expect(page.getByRole("heading",{name:"Inspection priorities",exact:true})).toBeVisible();
  const before=await page.locator(".hash").textContent();
  await page.getByRole("link",{name:"Smart ovitraps",exact:true}).click();
  await page.getByRole("tab",{name:/Type a count by hand/}).click();
  await page.getByRole("button",{name:"Import interval",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Interval saved");
  await page.getByRole("button",{name:"Import interval",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Interval saved");
  await expect(page.getByRole("button",{name:/2026-10-09 to 2026-10-16: 100 eggs/})).toHaveCount(1);
  const revisionOption=page.getByLabel("Sample to correct").locator("option").filter({hasText:"B1-T1-2026W42-NEW"});
  await page.getByLabel("Sample to correct").selectOption(await revisionOption.getAttribute("value")??"");
  await page.getByLabel("Corrected human count").fill("73");
  await page.getByRole("button",{name:"Save count correction"}).click();
  await expect(page.getByText(/Count revised 100 to 73/)).toBeVisible();
  await page.getByRole("link",{name:"Next-round planning",exact:true}).click();
  await page.getByLabel("Window start · UTC").fill("2026-10-09");
  await page.getByLabel("Window end · UTC").fill("2026-10-16");
  await page.getByRole("button",{name:"Recompute allocation"}).click();
  await expect(page.locator(".hash")).not.toHaveText(before??"");
  await page.getByRole("button",{name:"Approve task plan"}).click();
  await page.goto("/assets/asset-p03");
  await login(page,"operator");
  await page.getByRole("button",{name:"Record P-03 water observation"}).click();
  await expect(page.getByText("NEEDS_REVIEW",{exact:true})).toBeVisible();
  await login(page,"coordinator");
  await page.getByRole("button",{name:"Confirm evidence"}).click();
  // The work queue defaults to the board; the list view carries the headings and status badges asserted below.
  const listView=page.getByRole("button",{name:"List",exact:true});
  await listView.click();
  await expect(page.getByRole("heading",{name:"ENGINEERING REVIEW",exact:true})).toBeVisible();
  await login(page,"coordinator");
  await listView.click();
  await page.locator("article").filter({hasText:"ENGINEERING REVIEW"}).getByRole("button",{name:"Assign field operator"}).click();
  await login(page,"operator");
  await listView.click();
  await page.getByRole("button",{name:"Start work"}).click();
  await page.getByRole("button",{name:"Record action complete"}).click();
  await expect(page.getByText("ACTION COMPLETED PENDING VERIFICATION",{exact:true})).toBeVisible();
  await login(page,"coordinator");
  await listView.click();
  await page.getByRole("button",{name:"Verify resolved"}).click();
  await expect(page.getByText("VERIFIED RESOLVED",{exact:true})).toBeVisible();
  await page.goto("/dashboard");
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("heading",{name:"Surveillance by block",exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("dashboard-mobile.png"),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
});
