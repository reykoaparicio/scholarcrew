-- Local demo data only (dev database). Run by prepare.sh before every ndemo open, play, and render.

-- 1. A reusable sign-in link for the seeded student. Signing in marks it used, so this re-arms it.
insert into magic_links (email, token_hash, expires_at)
values (
  'jordan@example.com',
  encode(sha256(convert_to('scholarcrew-demo-tour-jordan', 'UTF8')), 'hex'),
  now() + interval '1 day'
)
on conflict (token_hash) do update set used_at = null, expires_at = excluded.expires_at, email = excluded.email;

-- 2. Jordan's three confirmed award letters (fictional), so Compare offers has data after `pnpm db:seed`.
delete from offers where owner_id = (select id from users where email = 'jordan@example.com');

with letter as (
  insert into offers (owner_id, college_id, award_year, status, cost_of_attendance_usd, confirmed_at)
  select u.id, c.id, '2027-28', 'confirmed', v.coa, now()
  from users u
  cross join (values ('State U', 27800), ('Riverside College', 41200), ('Northgate University', 68400)) as v(name, coa)
  join colleges c on c.name = v.name
  where u.email = 'jordan@example.com'
  returning id, college_id
)
insert into offer_lines (offer_id, position, label, amount_usd, category, renewable, page, cited_text)
select l.id, x.position, x.label, x.amount, x.category::offer_line_category_enum, x.renewable, x.page, x.cited
from letter l
join colleges c on c.id = l.college_id
join (values
  ('State U', 0, 'Federal Pell Grant', 7395, 'grant', true, 1, 'Federal Pell Grant $7,395'),
  ('State U', 1, 'State U Opportunity Grant', 8205, 'grant', true, 1, 'State U Opportunity Grant $8,205'),
  ('State U', 2, 'State U Merit Award', 3000, 'scholarship', true, 1, 'State U Merit Award $3,000'),
  ('State U', 3, 'Federal Work-Study', 2000, 'work_study', false, 2, 'Federal Work-Study $2,000'),
  ('State U', 4, 'Direct Subsidized Loan', 3500, 'loan_federal_subsidized', false, 2, 'Direct Subsidized Loan $3,500'),
  ('State U', 5, 'Direct Unsubsidized Loan', 2000, 'loan_federal_unsubsidized', false, 2, 'Direct Unsubsidized Loan $2,000'),
  ('Riverside College', 0, 'Federal Pell Grant', 7395, 'grant', true, 1, 'Federal Pell Grant $7,395'),
  ('Riverside College', 1, 'Riverside Presidential Scholarship', 12000, 'scholarship', true, 1, 'Riverside Presidential Scholarship $12,000, renewable with a 3.0 GPA'),
  ('Riverside College', 2, 'Riverside Grant', 6500, 'grant', true, 1, 'Riverside Grant $6,500'),
  ('Riverside College', 3, 'First-Year Welcome Grant', 4000, 'grant', false, 1, 'First-Year Welcome Grant $4,000 (first year only)'),
  ('Riverside College', 4, 'Federal Work-Study', 2500, 'work_study', false, 2, 'Federal Work-Study $2,500'),
  ('Riverside College', 5, 'Direct Subsidized Loan', 3500, 'loan_federal_subsidized', false, 2, 'Direct Subsidized Loan $3,500'),
  ('Riverside College', 6, 'Direct Unsubsidized Loan', 2000, 'loan_federal_unsubsidized', false, 2, 'Direct Unsubsidized Loan $2,000'),
  ('Northgate University', 0, 'Federal Pell Grant', 7395, 'grant', true, 1, 'Federal Pell Grant $7,395'),
  ('Northgate University', 1, 'Northgate Grant', 46800, 'grant', true, 1, 'Northgate Grant $46,800, need-based'),
  ('Northgate University', 2, 'Federal Work-Study', 3000, 'work_study', false, 2, 'Federal Work-Study $3,000'),
  ('Northgate University', 3, 'Direct Subsidized Loan', 3500, 'loan_federal_subsidized', false, 2, 'Direct Subsidized Loan $3,500'),
  ('Northgate University', 4, 'Direct Unsubsidized Loan', 2000, 'loan_federal_unsubsidized', false, 2, 'Direct Unsubsidized Loan $2,000'),
  ('Northgate University', 5, 'Parent PLUS Loan', 6000, 'loan_parent_plus', false, 2, 'Parent PLUS Loan $6,000')
) as x(college, position, label, amount, category, renewable, page, cited) on x.college = c.name;

-- 3. Only the seeded conversations, so Crew opens "Weekend plan" and earlier demo chats don't pile up.
delete from conversations
where owner_id = (select id from users where email = 'jordan@example.com')
  and title not in ('Weekend plan', 'Family room');

-- 4. Award-letter uploads from earlier runs, so Settings lists no stray documents.
with gone as (
  delete from documents
  where owner_id = (select id from users where email = 'jordan@example.com') and filename = 'letter.pdf'
  returning blob_id
)
delete from blobs where id in (select blob_id from gone);
