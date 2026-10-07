ScholarCrew concept mockups
===========================

Contents
- mockups/screens: 18 desktop web screens (1440 x 900 layout, exported at 2x) and
  1 phone screen (390 x 844 layout, exported at 3x).
- ScholarCrew_System_Diagram.png: rough system sketch (agents, server, data, outside services).
- ScholarCrew_Mockups_Overview.png: all 19 screens on one board.
- mockups/source: the static HTML/CSS used to draw them. Open any .html file in a browser.
  styles.css holds the shared tokens and components; styles-extra.css adds what
  screens 09-19 need. shell.js fills in the sidebar, top bar, and icons.

Screens
Student app
  01 This week                 02 Crew chat                03 Scholarships board
  04 Essay Studio              05 Colleges                 06 Compare offers (spring)
  07 Memory                    08 Family
  09 Onboarding, step 3 of 5: matching opt-ins, all off by default, used only by the matcher
  10 Scholarship detail: Rotary Club of Eastside, why-you-match reasons, source and
     verified date, label legend, report a problem, crew room with Scout's note
  11 Test prep: ACT scores, superscore, "is a retake worth it" by school, study plan
  12 Service and activities: hours log with supervisor confirmation, hours required
     by a scholarship, activities with exact 150-character counts
  13 Settings: account, notifications, plan and crew-request usage, browser
     extension, export, delete account
Public pages (no sign-in)
  14 Sign in: email link, "check your email" state, 13-and-older note
  15 Landing page: the crew, the no-selling and no-referral-fee rules, how it works,
     pricing (test prices, not final)
  16 Texas scholarship directory: filters, verified dates, stale and unverified labels
  17 Helper view: Ms. Patel's read-only brag sheet from a helper link
Admin
  18 Review queue: a research candidate's extracted fields beside quoted source
     text, code checks (quote not found, past deadline, scam rules), publish or reject
Phone
  19 This week on a phone, with a bottom tab bar

How these were built
Plain HTML and CSS (no framework), rendered with an offscreen WebKit view and saved
as PNG. They are concept designs, not screenshots of a working app. Crew and money
colors use a palette checked for colorblind separation; every crew color appears
next to the crew member's name, and every status pairs an icon with a label.

All people, schools, scholarships, amounts, prices, and dates are fictional sample
data. The Compare offers screen shows a spring (March) state; the rest show
October 6, 2026. Screens 11 and 12 show Prep and Impact switched on.
ScholarCrew is a working name; availability has not been checked.
