CREATE TYPE "public"."aid_program_enum" AS ENUM('fafsa', 'css');--> statement-breakpoint
CREATE TYPE "public"."app_item_kind_enum" AS ENUM('form', 'transcript', 'counselor_rec', 'teacher_rec', 'supplement', 'test_scores', 'portfolio', 'interview', 'fee_or_waiver', 'css_profile');--> statement-breakpoint
CREATE TYPE "public"."app_plan_enum" AS ENUM('ED', 'EA', 'REA', 'RD', 'rolling');--> statement-breakpoint
CREATE TYPE "public"."app_stage_enum" AS ENUM('matched', 'planned', 'drafting', 'submitted', 'won', 'lost', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."app_status_enum" AS ENUM('researching', 'applying', 'submitted', 'admitted', 'waitlisted', 'denied', 'enrolled', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."assignee_kind_enum" AS ENUM('student', 'parent');--> statement-breakpoint
CREATE TYPE "public"."catalog_status_enum" AS ENUM('draft', 'published', 'stale', 'retired', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."catalog_task_kind_enum" AS ENUM('research_candidate', 'user_submission', 'report', 'recheck_changed', 'import');--> statement-breakpoint
CREATE TYPE "public"."catalog_task_status_enum" AS ENUM('open', 'in_review', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."college_control_enum" AS ENUM('public', 'private_nonprofit', 'private_forprofit');--> statement-breakpoint
CREATE TYPE "public"."comment_author_enum" AS ENUM('quill', 'helper', 'user');--> statement-breakpoint
CREATE TYPE "public"."comment_kind_enum" AS ENUM('question', 'structure', 'clarity', 'prompt_fit', 'word_budget');--> statement-breakpoint
CREATE TYPE "public"."cost_source_enum" AS ENUM('scorecard', 'calculator', 'offer');--> statement-breakpoint
CREATE TYPE "public"."document_kind_enum" AS ENUM('award_letter', 'transcript', 'score_report', 'essay', 'resume', 'other');--> statement-breakpoint
CREATE TYPE "public"."essay_status_enum" AS ENUM('drafting', 'ready', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."essay_target_enum" AS ENUM('college', 'scholarship', 'general');--> statement-breakpoint
CREATE TYPE "public"."export_status_enum" AS ENUM('queued', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."fact_source_enum" AS ENUM('user_stated', 'document', 'parent_shared', 'crew_inferred', 'system');--> statement-breakpoint
CREATE TYPE "public"."fact_status_enum" AS ENUM('confirmed', 'candidate', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."fact_visibility_enum" AS ENUM('crew', 'crew_family', 'scout_only', 'private');--> statement-breakpoint
CREATE TYPE "public"."family_member_role_enum" AS ENUM('student', 'parent');--> statement-breakpoint
CREATE TYPE "public"."family_task_kind_enum" AS ENUM('fafsa_contributor', 'css_contributor', 'share_income_range', 'share_budget', 'review_costs', 'custom');--> statement-breakpoint
CREATE TYPE "public"."fit_enum" AS ENUM('reach', 'target', 'likely');--> statement-breakpoint
CREATE TYPE "public"."helper_role_enum" AS ENUM('recommender', 'counselor', 'mentor');--> statement-breakpoint
CREATE TYPE "public"."item_status_enum" AS ENUM('todo', 'in_progress', 'done', 'not_needed');--> statement-breakpoint
CREATE TYPE "public"."job_kind_enum" AS ENUM('crew_request', 'weekly_plan', 'essay_review', 'offer_parse', 'appeal_outline', 'retake_analysis');--> statement-breakpoint
CREATE TYPE "public"."job_status_enum" AS ENUM('queued', 'working', 'ready', 'needs_input', 'failed');--> statement-breakpoint
CREATE TYPE "public"."listing_visibility_enum" AS ENUM('public', 'submitter_only');--> statement-breakpoint
CREATE TYPE "public"."message_author_enum" AS ENUM('user', 'crew');--> statement-breakpoint
CREATE TYPE "public"."notification_kind_enum" AS ENUM('new_matches', 'deadline', 'job_ready', 'family', 'digest', 'system');--> statement-breakpoint
CREATE TYPE "public"."offer_line_category_enum" AS ENUM('grant', 'scholarship', 'work_study', 'loan_federal_subsidized', 'loan_federal_unsubsidized', 'loan_parent_plus', 'loan_private', 'other');--> statement-breakpoint
CREATE TYPE "public"."offer_status_enum" AS ENUM('uploaded', 'parsing', 'needs_review', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outside_policy_enum" AS ENUM('added_on_top', 'reduces_loans_first', 'may_reduce_grant', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."parse_status_enum" AS ENUM('none', 'queued', 'parsing', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plan_id_enum" AS ENUM('free', 'family', 'season_pass');--> statement-breakpoint
CREATE TYPE "public"."plan_item_kind_enum" AS ENUM('scholarship', 'essay', 'application', 'aid', 'test_prep', 'service', 'recommendation', 'thank_you', 'custom');--> statement-breakpoint
CREATE TYPE "public"."rec_status_enum" AS ENUM('draft', 'requested', 'confirmed', 'submitted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."report_reason_enum" AS ENUM('wrong_deadline', 'dead_link', 'scam', 'wrong_amount', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status_enum" AS ENUM('open', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role_enum" AS ENUM('student', 'parent', 'admin');--> statement-breakpoint
CREATE TYPE "public"."room_kind_enum" AS ENUM('my_crew', 'family', 'temporary', 'scholarship', 'college', 'essay');--> statement-breakpoint
CREATE TYPE "public"."sensitive_kind_enum" AS ENUM('first_gen', 'income_range', 'heritage', 'disability', 'religion', 'military_family', 'foster_care', 'noncitizen_filter');--> statement-breakpoint
CREATE TYPE "public"."share_category_enum" AS ENUM('deadlines', 'colleges', 'costs', 'scholarships', 'activities', 'essays', 'chats', 'stories', 'sensitive');--> statement-breakpoint
CREATE TYPE "public"."subscription_status_enum" AS ENUM('active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."task_status_enum" AS ENUM('todo', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."test_kind_enum" AS ENUM('ACT', 'SAT', 'PSAT');--> statement-breakpoint
CREATE TYPE "public"."test_policy_enum" AS ENUM('required', 'optional', 'blind', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."user_status_enum" AS ENUM('active', 'blocked_underage', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."verification_status_enum" AS ENUM('self_reported', 'requested', 'verified', 'declined');--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"role" "role_enum" DEFAULT 'student' NOT NULL,
	"birth_year" integer,
	"time_zone" text DEFAULT 'America/Chicago' NOT NULL,
	"status" "user_status_enum" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"source_message_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" "fact_source_enum" NOT NULL,
	"source_ref" text,
	"visibility" "fact_visibility_enum" DEFAULT 'crew' NOT NULL,
	"status" "fact_status_enum" DEFAULT 'confirmed' NOT NULL,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"class_year" integer,
	"high_school" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"county" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"gpa_unweighted_x100" integer,
	"gpa_weighted_x100" integer,
	"intended_majors" text[] DEFAULT '{}'::text[] NOT NULL,
	"interests" text[] DEFAULT '{}'::text[] NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensitive_facts" (
	"owner_id" uuid NOT NULL,
	"kind" "sensitive_kind_enum" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"ciphertext" "bytea",
	"iv" "bytea",
	"tag" "bytea",
	"key_id" smallint DEFAULT 1 NOT NULL,
	"shared_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sensitive_facts_owner_id_kind_pk" PRIMARY KEY("owner_id","kind")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"moment" text NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'Family' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_budgets" (
	"family_id" uuid PRIMARY KEY NOT NULL,
	"annual_usd" integer NOT NULL,
	"shared_by_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"email" text NOT NULL,
	"member_role" "family_member_role_enum" DEFAULT 'parent' NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_id" uuid,
	CONSTRAINT "family_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"family_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_role" "family_member_role_enum" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_members_family_id_user_id_pk" PRIMARY KEY("family_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "family_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "family_task_kind_enum" NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"status" "task_status_enum" DEFAULT 'todo' NOT NULL,
	"due_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"aid_item_id" uuid,
	CONSTRAINT "family_tasks_aid_item_assignee_uq" UNIQUE("aid_item_id","assignee_id")
);
--> statement-breakpoint
CREATE TABLE "helper_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"label" text NOT NULL,
	"helper_role" "helper_role_enum" NOT NULL,
	"scope" text[] NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "helper_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "share_settings" (
	"student_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"category" "share_category_enum" NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "share_settings_student_id_family_id_category_pk" PRIMARY KEY("student_id","family_id","category")
);
--> statement-breakpoint
CREATE TABLE "aid_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"award_year" text NOT NULL,
	"state" text,
	"program" text NOT NULL,
	"deadline" date,
	"note" text DEFAULT '' NOT NULL,
	"source_url" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aid_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"award_year" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source_url" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "aid_rules_award_year_key_uq" UNIQUE("award_year","key")
);
--> statement-breakpoint
CREATE TABLE "catalog_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scholarship_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" "report_reason_enum" NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" "report_status_enum" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalog_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "catalog_task_kind_enum" NOT NULL,
	"status" "catalog_task_status_enum" DEFAULT 'open' NOT NULL,
	"scholarship_id" uuid,
	"payload" jsonb NOT NULL,
	"created_by_id" uuid,
	"resolved_by_id" uuid,
	"resolution_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "colleges" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"city" text NOT NULL,
	"control" "college_control_enum" NOT NULL,
	"admit_rate_x1000" integer,
	"cost_of_attendance_usd" integer,
	"net_price_by_income" jsonb NOT NULL,
	"test_policy" "test_policy_enum" DEFAULT 'unknown' NOT NULL,
	"superscore" boolean,
	"css_profile_required" boolean DEFAULT false NOT NULL,
	"outside_policy" "outside_policy_enum" DEFAULT 'unknown' NOT NULL,
	"merit_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deadlines" jsonb NOT NULL,
	"requirements" jsonb NOT NULL,
	"aid_priority_date" date,
	"source_url" text DEFAULT '' NOT NULL,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recheck_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anthropic_batch_id" text NOT NULL,
	"scholarship_ids" text[] NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"collected_at" timestamp with time zone,
	CONSTRAINT "recheck_batches_anthropic_batch_id_unique" UNIQUE("anthropic_batch_id")
);
--> statement-breakpoint
CREATE TABLE "scholarship_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scholarship_id" uuid NOT NULL,
	"url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scholarships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"source_url" text NOT NULL,
	"amount_min_usd" integer NOT NULL,
	"amount_max_usd" integer NOT NULL,
	"renewable" boolean DEFAULT false NOT NULL,
	"renewal_terms" text DEFAULT '' NOT NULL,
	"deadline" date,
	"cycle" text NOT NULL,
	"local_area" jsonb NOT NULL,
	"eligibility" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" jsonb NOT NULL,
	"status" "catalog_status_enum" DEFAULT 'draft' NOT NULL,
	"visibility" "listing_visibility_enum" DEFAULT 'public' NOT NULL,
	"submitted_by_id" uuid,
	"scam_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"est_minutes" integer DEFAULT 60 NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scholarships_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"organization" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hours_per_week" integer DEFAULT 0 NOT NULL,
	"weeks_per_year" integer DEFAULT 0 NOT NULL,
	"grades" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_owner_position_uq" UNIQUE("owner_id","position")
);
--> statement-breakpoint
CREATE TABLE "aid_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"award_year" text NOT NULL,
	"program" "aid_program_enum" NOT NULL,
	"college_id" text,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"assignee" "assignee_kind_enum" NOT NULL,
	"status" "task_status_enum" DEFAULT 'todo' NOT NULL,
	"due_on" date,
	"completed_at" timestamp with time zone,
	CONSTRAINT "aid_checklist_items_uq" UNIQUE NULLS NOT DISTINCT("owner_id","award_year","program","key","college_id")
);
--> statement-breakpoint
CREATE TABLE "application_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"college_list_id" uuid NOT NULL,
	"kind" "app_item_kind_enum" NOT NULL,
	"label" text NOT NULL,
	"status" "item_status_enum" DEFAULT 'todo' NOT NULL,
	"due_on" date,
	"essay_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"tag" "bytea" NOT NULL,
	"key_id" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "college_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"college_id" text NOT NULL,
	"fit" "fit_enum" NOT NULL,
	"plan" "app_plan_enum" NOT NULL,
	"status" "app_status_enum" DEFAULT 'researching' NOT NULL,
	"season" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"college_id" text NOT NULL,
	"source" "cost_source_enum" NOT NULL,
	"cost_of_attendance_usd" integer NOT NULL,
	"free_money_usd" integer NOT NULL,
	"net_price_usd" integer NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_estimates_owner_college_source_uq" UNIQUE("owner_id","college_id","source")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "document_kind_enum" NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"blob_id" uuid NOT NULL,
	"parse_status" "parse_status_enum" DEFAULT 'none' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"essay_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"author" "comment_author_enum" NOT NULL,
	"kind" "comment_kind_enum" NOT NULL,
	"quote" text NOT NULL,
	"occurrence" integer DEFAULT 1 NOT NULL,
	"body" text NOT NULL,
	"job_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"essay_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"word_count" integer NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "essay_versions_essay_version_uq" UNIQUE("essay_id","version")
);
--> statement-breakpoint
CREATE TABLE "essays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"word_limit" integer,
	"char_limit" integer,
	"target_type" "essay_target_enum" DEFAULT 'general' NOT NULL,
	"target_college_id" text,
	"target_scholarship_id" uuid,
	"current_version" integer DEFAULT 0 NOT NULL,
	"status" "essay_status_enum" DEFAULT 'drafting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"amount_usd" integer NOT NULL,
	"category" "offer_line_category_enum" NOT NULL,
	"renewable" boolean DEFAULT false NOT NULL,
	"renewal_condition" text DEFAULT '' NOT NULL,
	"page" integer,
	"cited_text" text DEFAULT '' NOT NULL,
	"user_corrected" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"college_id" text NOT NULL,
	"award_year" text NOT NULL,
	"document_id" uuid,
	"status" "offer_status_enum" DEFAULT 'uploaded' NOT NULL,
	"cost_of_attendance_usd" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"title" text NOT NULL,
	"kind" "plan_item_kind_enum" NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"minutes" integer NOT NULL,
	"value_usd" integer,
	"due_on" date,
	"status" "task_status_enum" DEFAULT 'todo' NOT NULL,
	"contributors" text[] DEFAULT '{}'::text[] NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rec_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"recommender_id" uuid NOT NULL,
	"college_list_id" uuid,
	"scholarship_application_id" uuid,
	"helper_link_id" uuid,
	"message" text DEFAULT '' NOT NULL,
	"status" "rec_status_enum" DEFAULT 'draft' NOT NULL,
	"requested_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"relationship" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scholarship_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"scholarship_id" uuid NOT NULL,
	"stage" "app_stage_enum" DEFAULT 'matched' NOT NULL,
	"match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fit_score" integer DEFAULT 0 NOT NULL,
	"est_minutes" integer DEFAULT 60 NOT NULL,
	"submitted_at" timestamp with time zone,
	"outcome_usd" integer,
	"outcome_renewable" boolean,
	"outcome_at" timestamp with time zone,
	"thank_you_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scholarship_applications_owner_scholarship_uq" UNIQUE("owner_id","scholarship_id")
);
--> statement-breakpoint
CREATE TABLE "service_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"organization" text NOT NULL,
	"activity" text NOT NULL,
	"served_on" date NOT NULL,
	"minutes" integer NOT NULL,
	"supervisor_name" text DEFAULT '' NOT NULL,
	"supervisor_email" text DEFAULT '' NOT NULL,
	"verification" "verification_status_enum" DEFAULT 'self_reported' NOT NULL,
	"verification_token_hash" text,
	"verification_expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verifier_note" text DEFAULT '' NOT NULL,
	"reflection" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_logs_verification_token_hash_unique" UNIQUE("verification_token_hash")
);
--> statement-breakpoint
CREATE TABLE "story_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"essay_id" uuid NOT NULL,
	"college_id" text,
	"scholarship_id" uuid,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_uses_story_essay_uq" UNIQUE("story_id","essay_id")
);
--> statement-breakpoint
CREATE TABLE "sweep_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"new_matches" integer NOT NULL,
	"total_usd" integer NOT NULL,
	"reuse_count" integer NOT NULL,
	"hidden_scams" integer NOT NULL,
	"hidden_scholarship_ids" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"test" "test_kind_enum" NOT NULL,
	"taken_on" date NOT NULL,
	"official" boolean NOT NULL,
	"composite" integer NOT NULL,
	"sections" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "action_receipts_message_card_uq" UNIQUE("message_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"user_id" uuid,
	"role" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"stop_reason" text NOT NULL,
	"cost_micros" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"room" "room_kind_enum" NOT NULL,
	"room_ref_id" text,
	"family_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crew_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "job_kind_enum" NOT NULL,
	"status" "job_status_enum" DEFAULT 'queued' NOT NULL,
	"conversation_id" uuid,
	"request_message_id" uuid,
	"result_message_id" uuid,
	"ref_id" text,
	"progress" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"safety" text,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"usage_month" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_kind" "message_author_enum" NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"reply" jsonb,
	"shared_categories" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "export_status_enum" DEFAULT 'queued' NOT NULL,
	"blob_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"digest_day" integer DEFAULT 0 NOT NULL,
	"digest_hour" integer DEFAULT 16 NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"phone_ciphertext" "bytea",
	"phone_iv" "bytea",
	"phone_tag" "bytea",
	"phone_key_id" smallint DEFAULT 1 NOT NULL,
	"quiet_start_hour" integer DEFAULT 21 NOT NULL,
	"quiet_end_hour" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind_enum" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"sms_sent_at" timestamp with time zone,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "sponsor_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"sponsor_name" text NOT NULL,
	"plan" "plan_id_enum" NOT NULL,
	"seats_total" integer NOT NULL,
	"seats_used" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_redemptions" (
	"code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_redemptions_code_user_id_pk" PRIMARY KEY("code","user_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"plan" "plan_id_enum" DEFAULT 'free' NOT NULL,
	"status" "subscription_status_enum" DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_event_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"crew_requests" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_facts" ADD CONSTRAINT "sensitive_facts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_budgets" ADD CONSTRAINT "family_budgets_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_budgets" ADD CONSTRAINT "family_budgets_shared_by_id_users_id_fk" FOREIGN KEY ("shared_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_tasks" ADD CONSTRAINT "family_tasks_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_tasks" ADD CONSTRAINT "family_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_tasks" ADD CONSTRAINT "family_tasks_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_tasks" ADD CONSTRAINT "family_tasks_aid_item_id_aid_checklist_items_id_fk" FOREIGN KEY ("aid_item_id") REFERENCES "public"."aid_checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "helper_links" ADD CONSTRAINT "helper_links_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_settings" ADD CONSTRAINT "share_settings_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_settings" ADD CONSTRAINT "share_settings_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_reports" ADD CONSTRAINT "catalog_reports_scholarship_id_scholarships_id_fk" FOREIGN KEY ("scholarship_id") REFERENCES "public"."scholarships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_reports" ADD CONSTRAINT "catalog_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_tasks" ADD CONSTRAINT "catalog_tasks_scholarship_id_scholarships_id_fk" FOREIGN KEY ("scholarship_id") REFERENCES "public"."scholarships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_sources" ADD CONSTRAINT "scholarship_sources_scholarship_id_scholarships_id_fk" FOREIGN KEY ("scholarship_id") REFERENCES "public"."scholarships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_checklist_items" ADD CONSTRAINT "aid_checklist_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_items" ADD CONSTRAINT "application_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_items" ADD CONSTRAINT "application_items_college_list_id_college_list_id_fk" FOREIGN KEY ("college_list_id") REFERENCES "public"."college_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "college_list" ADD CONSTRAINT "college_list_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "college_list" ADD CONSTRAINT "college_list_college_id_colleges_id_fk" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_estimates" ADD CONSTRAINT "cost_estimates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_estimates" ADD CONSTRAINT "cost_estimates_college_id_colleges_id_fk" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_blob_id_blobs_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."blobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_comments" ADD CONSTRAINT "essay_comments_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_versions" ADD CONSTRAINT "essay_versions_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_versions" ADD CONSTRAINT "essay_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essays" ADD CONSTRAINT "essays_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_lines" ADD CONSTRAINT "offer_lines_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_college_id_colleges_id_fk" FOREIGN KEY ("college_id") REFERENCES "public"."colleges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_requests" ADD CONSTRAINT "rec_requests_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_requests" ADD CONSTRAINT "rec_requests_recommender_id_recommenders_id_fk" FOREIGN KEY ("recommender_id") REFERENCES "public"."recommenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_requests" ADD CONSTRAINT "rec_requests_college_list_id_college_list_id_fk" FOREIGN KEY ("college_list_id") REFERENCES "public"."college_list"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_requests" ADD CONSTRAINT "rec_requests_scholarship_application_id_scholarship_applications_id_fk" FOREIGN KEY ("scholarship_application_id") REFERENCES "public"."scholarship_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommenders" ADD CONSTRAINT "recommenders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_applications" ADD CONSTRAINT "scholarship_applications_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_applications" ADD CONSTRAINT "scholarship_applications_scholarship_id_scholarships_id_fk" FOREIGN KEY ("scholarship_id") REFERENCES "public"."scholarships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_uses" ADD CONSTRAINT "story_uses_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_uses" ADD CONSTRAINT "story_uses_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweep_runs" ADD CONSTRAINT "sweep_runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_scores" ADD CONSTRAINT "test_scores_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_receipts" ADD CONSTRAINT "action_receipts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_receipts" ADD CONSTRAINT "action_receipts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_job_id_crew_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crew_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_jobs" ADD CONSTRAINT "crew_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_redemptions" ADD CONSTRAINT "sponsor_redemptions_code_sponsor_codes_code_fk" FOREIGN KEY ("code") REFERENCES "public"."sponsor_codes"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_redemptions" ADD CONSTRAINT "sponsor_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dev_outbox_to_idx" ON "dev_outbox" USING btree ("to");--> statement-breakpoint
CREATE INDEX "magic_links_email_idx" ON "magic_links" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_facts_owner_status_idx" ON "memory_facts" USING btree ("owner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_facts_current_uq" ON "memory_facts" USING btree ("owner_id","key") WHERE "memory_facts"."status" = 'confirmed' and "memory_facts"."superseded_by_id" is null;--> statement-breakpoint
CREATE INDEX "stories_owner_id_idx" ON "stories" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_user_uq" ON "family_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "family_tasks_family_status_idx" ON "family_tasks" USING btree ("family_id","status");--> statement-breakpoint
CREATE INDEX "catalog_tasks_status_kind_idx" ON "catalog_tasks" USING btree ("status","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_tasks_open_recheck_uq" ON "catalog_tasks" USING btree ("scholarship_id") WHERE "catalog_tasks"."kind" = 'recheck_changed' and "catalog_tasks"."status" in ('open', 'in_review');--> statement-breakpoint
CREATE INDEX "colleges_state_idx" ON "colleges" USING btree ("state");--> statement-breakpoint
CREATE INDEX "colleges_name_idx" ON "colleges" USING btree ("name");--> statement-breakpoint
CREATE INDEX "scholarships_status_idx" ON "scholarships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scholarships_deadline_idx" ON "scholarships" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "scholarships_visibility_idx" ON "scholarships" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "college_list_owner_college_active_uq" ON "college_list" USING btree ("owner_id","college_id") WHERE "college_list"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "plan_items_owner_week_idx" ON "plan_items" USING btree ("owner_id","week_start");--> statement-breakpoint
CREATE INDEX "sweep_runs_owner_ran_at_idx" ON "sweep_runs" USING btree ("owner_id","ran_at");--> statement-breakpoint
CREATE INDEX "conversations_owner_room_idx" ON "conversations" USING btree ("owner_id","room");--> statement-breakpoint
CREATE INDEX "crew_jobs_owner_created_idx" ON "crew_jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");