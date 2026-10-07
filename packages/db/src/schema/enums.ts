import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role_enum", ["student", "parent", "admin"]);
export const userStatusEnum = pgEnum("user_status_enum", ["active", "blocked_underage", "deleted"]);
export const factSourceEnum = pgEnum("fact_source_enum", [
  "user_stated",
  "document",
  "parent_shared",
  "crew_inferred",
  "system",
]);
export const factVisibilityEnum = pgEnum("fact_visibility_enum", ["crew", "crew_family", "scout_only", "private"]);
export const factStatusEnum = pgEnum("fact_status_enum", ["confirmed", "candidate", "rejected"]);
export const sensitiveKindEnum = pgEnum("sensitive_kind_enum", [
  "first_gen",
  "income_range",
  "heritage",
  "disability",
  "religion",
  "military_family",
  "foster_care",
  "noncitizen_filter",
]);
export const familyMemberRoleEnum = pgEnum("family_member_role_enum", ["student", "parent"]);
export const shareCategoryEnum = pgEnum("share_category_enum", [
  "deadlines",
  "colleges",
  "costs",
  "scholarships",
  "activities",
  "essays",
  "chats",
  "stories",
  "sensitive",
]);
export const familyTaskKindEnum = pgEnum("family_task_kind_enum", [
  "fafsa_contributor",
  "css_contributor",
  "share_income_range",
  "share_budget",
  "review_costs",
  "custom",
]);
export const taskStatusEnum = pgEnum("task_status_enum", ["todo", "done", "skipped"]);
export const helperRoleEnum = pgEnum("helper_role_enum", ["recommender", "counselor", "mentor"]);
export const catalogStatusEnum = pgEnum("catalog_status_enum", ["draft", "published", "stale", "retired", "flagged"]);
export const listingVisibilityEnum = pgEnum("listing_visibility_enum", ["public", "submitter_only"]);
export const collegeControlEnum = pgEnum("college_control_enum", ["public", "private_nonprofit", "private_forprofit"]);
export const testPolicyEnum = pgEnum("test_policy_enum", ["required", "optional", "blind", "unknown"]);
export const outsidePolicyEnum = pgEnum("outside_policy_enum", [
  "added_on_top",
  "reduces_loans_first",
  "may_reduce_grant",
  "unknown",
]);
export const catalogTaskKindEnum = pgEnum("catalog_task_kind_enum", [
  "research_candidate",
  "user_submission",
  "report",
  "recheck_changed",
  "import",
]);
export const catalogTaskStatusEnum = pgEnum("catalog_task_status_enum", ["open", "in_review", "resolved", "rejected"]);
export const reportReasonEnum = pgEnum("report_reason_enum", [
  "wrong_deadline",
  "dead_link",
  "scam",
  "wrong_amount",
  "other",
]);
export const reportStatusEnum = pgEnum("report_status_enum", ["open", "resolved", "rejected"]);
export const fitEnum = pgEnum("fit_enum", ["reach", "target", "likely"]);
export const appPlanEnum = pgEnum("app_plan_enum", ["ED", "EA", "REA", "RD", "rolling"]);
export const appStatusEnum = pgEnum("app_status_enum", [
  "researching",
  "applying",
  "submitted",
  "admitted",
  "waitlisted",
  "denied",
  "enrolled",
  "withdrawn",
]);
export const appItemKindEnum = pgEnum("app_item_kind_enum", [
  "form",
  "transcript",
  "counselor_rec",
  "teacher_rec",
  "supplement",
  "test_scores",
  "portfolio",
  "interview",
  "fee_or_waiver",
  "css_profile",
]);
export const itemStatusEnum = pgEnum("item_status_enum", ["todo", "in_progress", "done", "not_needed"]);
export const recStatusEnum = pgEnum("rec_status_enum", ["draft", "requested", "confirmed", "submitted", "declined"]);
export const appStageEnum = pgEnum("app_stage_enum", [
  "matched",
  "planned",
  "drafting",
  "submitted",
  "won",
  "lost",
  "skipped",
]);
export const essayTargetEnum = pgEnum("essay_target_enum", ["college", "scholarship", "general"]);
export const essayStatusEnum = pgEnum("essay_status_enum", ["drafting", "ready", "submitted"]);
export const commentAuthorEnum = pgEnum("comment_author_enum", ["quill", "helper", "user"]);
export const commentKindEnum = pgEnum("comment_kind_enum", [
  "question",
  "structure",
  "clarity",
  "prompt_fit",
  "word_budget",
]);
export const testKindEnum = pgEnum("test_kind_enum", ["ACT", "SAT", "PSAT"]);
export const verificationStatusEnum = pgEnum("verification_status_enum", [
  "self_reported",
  "requested",
  "verified",
  "declined",
]);
export const costSourceEnum = pgEnum("cost_source_enum", ["scorecard", "calculator", "offer"]);
export const documentKindEnum = pgEnum("document_kind_enum", [
  "award_letter",
  "transcript",
  "score_report",
  "essay",
  "resume",
  "other",
]);
export const parseStatusEnum = pgEnum("parse_status_enum", ["none", "queued", "parsing", "parsed", "failed"]);
export const offerStatusEnum = pgEnum("offer_status_enum", [
  "uploaded",
  "parsing",
  "needs_review",
  "confirmed",
  "failed",
]);
export const offerLineCategoryEnum = pgEnum("offer_line_category_enum", [
  "grant",
  "scholarship",
  "work_study",
  "loan_federal_subsidized",
  "loan_federal_unsubsidized",
  "loan_parent_plus",
  "loan_private",
  "other",
]);
export const aidProgramEnum = pgEnum("aid_program_enum", ["fafsa", "css"]);
export const assigneeKindEnum = pgEnum("assignee_kind_enum", ["student", "parent"]);
export const roomKindEnum = pgEnum("room_kind_enum", [
  "my_crew",
  "family",
  "temporary",
  "scholarship",
  "college",
  "essay",
]);
export const messageAuthorEnum = pgEnum("message_author_enum", ["user", "crew"]);
export const jobKindEnum = pgEnum("job_kind_enum", [
  "crew_request",
  "weekly_plan",
  "essay_review",
  "offer_parse",
  "appeal_outline",
  "retake_analysis",
]);
export const jobStatusEnum = pgEnum("job_status_enum", ["queued", "working", "ready", "needs_input", "failed"]);
export const planItemKindEnum = pgEnum("plan_item_kind_enum", [
  "scholarship",
  "essay",
  "application",
  "aid",
  "test_prep",
  "service",
  "recommendation",
  "thank_you",
  "custom",
]);
export const notificationKindEnum = pgEnum("notification_kind_enum", [
  "new_matches",
  "deadline",
  "job_ready",
  "family",
  "digest",
  "system",
]);
export const planIdEnum = pgEnum("plan_id_enum", ["free", "family", "season_pass"]);
export const subscriptionStatusEnum = pgEnum("subscription_status_enum", ["active", "past_due", "canceled", "expired"]);
export const exportStatusEnum = pgEnum("export_status_enum", ["queued", "ready", "failed"]);
