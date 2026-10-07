export const FORM_HTML = `
<form id="application" action="/apply" method="post">
  <h1>Lakeview Rotary Award application</h1>
  <label for="full-name">Full name</label>
  <input id="full-name" name="applicant_name" type="text">
  <label>Email address <input type="email" name="contact"></label>
  <input type="text" name="hs" aria-label="High school name">
  <span id="grad-label">High school graduation year</span>
  <input type="number" name="q4" aria-labelledby="grad-label">
  <input type="text" name="gpa_unweighted" placeholder="Unweighted GPA (4.0 scale)">
  <label for="city">City</label>
  <input id="city" type="text" value="Springfield">
  <label for="state">State</label>
  <select id="state" name="state">
    <option value="">Choose a state</option>
    <option value="IL">Illinois</option>
    <option value="TX">Texas</option>
  </select>
  <input type="text" id="intendedMajor">
  <label for="acts">List your extracurricular activities</label>
  <textarea id="acts" name="acts"></textarea>
  <label for="parent-email">Parent or guardian email</label>
  <input id="parent-email" type="email">
  <label for="essay">Why do you deserve this scholarship?</label>
  <textarea id="essay"></textarea>
  <input type="hidden" name="email" value="">
  <label for="pw">Create a password</label>
  <input id="pw" type="password" name="password">
  <label for="resume">Resume</label>
  <input id="resume" type="file">
  <div style="display: none"><label for="ghost-email">Email</label><input id="ghost-email" type="email"></div>
  <label for="old-city">City</label>
  <input id="old-city" type="text" disabled>
  <label><input type="checkbox" name="agree"> I agree to the terms</label>
  <button type="submit">Submit application</button>
  <input type="submit" value="Send">
</form>`;

/** Ids or names of the fields detectFields should return for FORM_HTML, in DOM order. */
export const VISIBLE_FIELDS = [
  "full-name",
  "contact",
  "hs",
  "q4",
  "gpa_unweighted",
  "city",
  "state",
  "intendedMajor",
  "acts",
  "parent-email",
  "essay",
];

export function mountForm(): HTMLFormElement {
  document.body.innerHTML = FORM_HTML;
  const form = document.getElementById("application");
  if (!(form instanceof HTMLFormElement)) throw new Error("fixture form missing");
  return form;
}

export function control<T extends Element = HTMLInputElement>(idOrName: string): T {
  const el = document.getElementById(idOrName) ?? document.querySelector(`[name="${idOrName}"]`);
  if (!el) throw new Error(`missing field ${idOrName}`);
  return el as unknown as T;
}

export function fieldKey(el: Element): string {
  return el.id || el.getAttribute("name") || "";
}
