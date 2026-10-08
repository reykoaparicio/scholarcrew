import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { REPO_ROOT } from "../support/env";

// Standard HTML patterns used by scholarship portals: student/parent groups, disabled fields and essay inputs.
// No external application is submitted and no student data is sent off-device.
test("built extension fills reviewed React controls and preserves parent, essay and changed fields", async ({
  page,
}) => {
  const fixture = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      function Form() { const [email,setEmail]=React.useState(''); return React.createElement('form', {onSubmit:e=>{e.preventDefault();window.submissions++;}},
        React.createElement('label',null,'Student email',React.createElement('input',{id:'student-email',value:email,onChange:e=>setEmail(e.target.value)})),
        React.createElement('output',{id:'react-state'},email),
        React.createElement('label',null,'City',React.createElement('input',{id:'city',defaultValue:'Old city'})),
        React.createElement('fieldset',null,React.createElement('legend',null,'Parent information'),React.createElement('label',null,'Email',React.createElement('input',{id:'parent-email'}))),
        React.createElement('fieldset',{disabled:true},React.createElement('input',{id:'disabled', 'aria-label':'School name'})),
        React.createElement('label',null,'Essay',React.createElement('textarea',{id:'essay'})),
        React.createElement('button',{type:'submit'},'Submit application')); }
      window.submissions=0; createRoot(document.getElementById('root')).render(React.createElement(Form));`,
      resolveDir: resolve(REPO_ROOT, "apps/web"),
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.setContent('<main><div id="root"></div></main>');
  await page.addScriptTag({ content: fixture.outputFiles[0]?.text ?? "" });
  await expect(page.locator("#student-email")).toBeVisible();
  await page.evaluate(() => {
    const original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const root = original.call(this, init);
      (window as unknown as { review: ShadowRoot }).review = root;
      return root;
    };
    (window as unknown as { chrome: unknown }).chrome = {
      runtime: {
        id: "audit",
        onMessage: {
          addListener(listener: unknown) {
            (window as unknown as { listener: unknown }).listener = listener;
          },
        },
      },
    };
  });
  await page.addScriptTag({ path: resolve(REPO_ROOT, "apps/extension/dist/content.js") });
  const proposals = await page.evaluate(() => {
    const w = window as unknown as {
      listener: (message: unknown, sender: unknown, reply: (result: { proposals: number }) => void) => void;
    };
    let count = -1;
    w.listener(
      {
        type: "show-review",
        profile: {
          displayName: "Maya Torres",
          email: "maya@example.test",
          highSchool: "Lakeview High School",
          classYear: 2027,
          city: "Austin",
          state: "TX",
          gpa: 3.8,
          intendedMajors: ["Biology"],
          activities: [],
        },
      },
      { id: "audit" },
      (result) => {
        count = result.proposals;
      },
    );
    return count;
  });
  expect(proposals).toBe(2);
  await expect(page.locator("#student-email")).toHaveValue("");
  await page.evaluate(() => {
    const root = (window as unknown as { review: ShadowRoot }).review;
    const panel = root.querySelector(".panel")?.getBoundingClientRect();
    if (!panel || panel.left < 0 || panel.right > innerWidth) throw new Error("Review panel overflows phone");
    for (const checkbox of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) checkbox.checked = true;
  });
  await page.locator("#city").fill("Student's newer city");
  await page.evaluate(() =>
    (window as unknown as { review: ShadowRoot }).review.querySelector<HTMLButtonElement>("button.primary")?.click(),
  );
  await expect(page.locator("#student-email")).toHaveValue("maya@example.test");
  await expect(page.locator("#react-state")).toHaveText("maya@example.test");
  await expect(page.locator("#city")).toHaveValue("Student's newer city");
  await expect(page.locator("#parent-email")).toHaveValue("");
  await expect(page.locator("#disabled")).toHaveValue("");
  await expect(page.locator("#essay")).toHaveValue("");
  expect(await page.evaluate(() => (window as unknown as { submissions: number }).submissions)).toBe(0);
});
