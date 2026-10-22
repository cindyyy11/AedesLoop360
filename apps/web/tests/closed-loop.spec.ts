import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, role: string) {
  const signOut=page.getByRole("button", {name:"Sign out"});
  const account=page.getByLabel("Local demonstration account");
  await expect(signOut.or(account)).toBeVisible();
  if (await signOut.isVisible()) {
    await signOut.click();
    await expect(account).toBeVisible();
  }
  await account.selectOption(role);
  await page.getByRole("button", {name:"Sign in", exact:true}).click();
  await expect(page.getByRole("button", {name:"Sign out"})).toBeVisible();
}

test("five-scene persisted loop and mobile layout", async ({page})=>{
  await page.goto("/dashboard");
  await login(page,"coordinator");
  await expect(page.getByRole("heading",{name:"Every observation. One loop."})).toBeVisible();
  await expect(page.getByRole("cell",{name:"DATA UNAVAILABLE",exact:true})).toBeVisible();
  await page.screenshot({path:"../../docs/evidence/dashboard-desktop.png",fullPage:true});
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
  await expect(page.getByText("MISSION_COMPLETED",{exact:true})).toBeVisible({timeout:20000});
  await expect(page.getByText("SKIPPED",{exact:true})).toBeVisible();
  await expect(page.getByText("MOCK_ACTION_RECORDED",{exact:true})).toBeVisible();
  const groundReview=page.getByText("GROUND_REVIEW",{exact:true});
  await expect(groundReview).toHaveCount(2);
  await expect(groundReview.first()).toBeVisible();
  await login(page,"coordinator");
  await page.getByRole("link",{name:"Next-round planning",exact:true}).click();
  await page.getByLabel("Window start · UTC").fill("2026-10-09");
  await page.getByLabel("Window end · UTC").fill("2026-10-16");
  await page.getByRole("button",{name:"Recompute allocation"}).click();
  await expect(page.getByRole("heading",{name:"Inspection priorities",exact:true})).toBeVisible();
  const before=await page.locator(".hash").textContent();
  await page.getByRole("link",{name:"Smart ovitraps",exact:true}).click();
  await page.getByRole("button",{name:"Import interval",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Interval saved");
  await page.getByRole("button",{name:"Import interval",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Interval saved");
  await expect(page.locator("details summary").filter({hasText:"B1-T1-2026W42-NEW"})).toHaveCount(1);
  await page.getByRole("link",{name:"Next-round planning",exact:true}).click();
  await page.getByLabel("Window start · UTC").fill("2026-10-09");
  await page.getByLabel("Window end · UTC").fill("2026-10-16");
  await page.getByRole("button",{name:"Recompute allocation"}).click();
  await expect(page.locator(".hash")).not.toHaveText(before??"");
  await page.getByRole("button",{name:"Approve task plan"}).click();
  await page.goto("/assets/asset-p03");
  await login(page,"inspector");
  await page.getByRole("button",{name:"Record P-03 water observation"}).click();
  await expect(page.getByText("NEEDS_REVIEW",{exact:true})).toBeVisible();
  await login(page,"reviewer");
  await page.getByRole("button",{name:"Confirm evidence"}).click();
  await expect(page.getByRole("heading",{name:"ENGINEERING REVIEW",exact:true})).toBeVisible();
  await login(page,"coordinator");
  await page.locator("article").filter({hasText:"ENGINEERING REVIEW"}).getByRole("button",{name:"Assign inspector"}).click();
  await login(page,"inspector");
  await page.getByRole("button",{name:"Start work"}).click();
  await page.getByRole("button",{name:"Record action complete"}).click();
  await expect(page.getByText("ACTION COMPLETED PENDING VERIFICATION",{exact:true})).toBeVisible();
  await login(page,"reviewer");
  await page.getByRole("button",{name:"Verify resolved"}).click();
  await expect(page.getByText("VERIFIED RESOLVED",{exact:true})).toBeVisible();
  await page.goto("/dashboard");
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:"../../docs/evidence/dashboard-mobile.png",fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
});
