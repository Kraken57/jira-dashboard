-- Forge SQL schema for Enterprise Delivery KPI
-- Run with: forge sql run schema.sql

CREATE TABLE IF NOT EXISTS app_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS project_scope (
  project_id BIGINT PRIMARY KEY,
  project_key VARCHAR(50) NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_project_key (project_key)
);

CREATE TABLE IF NOT EXISTS pod_dimension (
  pod_id VARCHAR(100) PRIMARY KEY,
  pod_name VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS canonical_timebox (
  timebox_id VARCHAR(100) PRIMARY KEY,
  program_increment VARCHAR(100) NOT NULL,
  sequence_no INT NOT NULL,
  canonical_name VARCHAR(100) NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  commitment_at DATETIME NOT NULL,
  state VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_timebox_name (canonical_name),
  INDEX ix_timebox_dates (start_at, end_at)
);

CREATE TABLE IF NOT EXISTS jira_sprint (
  jira_sprint_id BIGINT PRIMARY KEY,
  jira_board_id BIGINT NOT NULL,
  sprint_name VARCHAR(255) NOT NULL,
  sprint_state VARCHAR(30) NOT NULL,
  start_at DATETIME,
  end_at DATETIME,
  complete_at DATETIME,
  goal TEXT,
  timebox_id VARCHAR(100),
  mapping_method VARCHAR(50),
  mapping_status VARCHAR(30) NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX ix_sprint_timebox (timebox_id),
  INDEX ix_sprint_board (jira_board_id)
);

CREATE TABLE IF NOT EXISTS field_mapping (
  logical_field VARCHAR(100) PRIMARY KEY,
  jira_field_id VARCHAR(100) NOT NULL,
  jira_field_name VARCHAR(255),
  field_type VARCHAR(50),
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS status_mapping (
  status_id VARCHAR(50) PRIMARY KEY,
  status_name VARCHAR(100) NOT NULL,
  status_category VARCHAR(50),
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_type_mapping (
  issue_type_id VARCHAR(50) PRIMARY KEY,
  issue_type_name VARCHAR(100) NOT NULL,
  is_measured_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  is_feature BOOLEAN NOT NULL DEFAULT FALSE,
  is_defect BOOLEAN NOT NULL DEFAULT FALSE,
  is_subtask BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS jira_issue_current (
  issue_id BIGINT PRIMARY KEY,
  issue_key VARCHAR(50) NOT NULL,
  project_id BIGINT NOT NULL,
  project_key VARCHAR(50) NOT NULL,
  issue_type_id VARCHAR(50) NOT NULL,
  issue_type_name VARCHAR(100) NOT NULL,
  summary TEXT,
  parent_issue_id BIGINT,
  parent_key VARCHAR(50),
  status_id VARCHAR(50) NOT NULL,
  status_name VARCHAR(100) NOT NULL,
  status_category VARCHAR(50),
  pod_id VARCHAR(100),
  program_increment VARCHAR(100),
  story_points DECIMAL(10,2),
  assignee_account_id VARCHAR(255),
  assignee_display_name VARCHAR(255),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  resolved_at DATETIME,
  due_date DATE,
  source_hash VARCHAR(64) NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uq_issue_key (issue_key),
  INDEX ix_issue_project_updated (project_id, updated_at),
  INDEX ix_issue_parent (parent_issue_id),
  INDEX ix_issue_pod_type (pod_id, issue_type_id)
);

CREATE TABLE IF NOT EXISTS issue_field_event (
  event_id VARCHAR(255) PRIMARY KEY,
  issue_id BIGINT NOT NULL,
  field_id VARCHAR(100) NOT NULL,
  field_name VARCHAR(255),
  from_value TEXT,
  from_display TEXT,
  to_value TEXT,
  to_display TEXT,
  changed_at DATETIME NOT NULL,
  INDEX ix_event_issue_field_time (issue_id, field_id, changed_at)
);

CREATE TABLE IF NOT EXISTS sprint_commitment_snapshot (
  jira_sprint_id BIGINT NOT NULL,
  timebox_id VARCHAR(100) NOT NULL,
  pod_id VARCHAR(100) NOT NULL,
  issue_id BIGINT NOT NULL,
  story_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  snapshot_at DATETIME NOT NULL,
  snapshot_source VARCHAR(40) NOT NULL,
  calculation_version VARCHAR(30) NOT NULL,
  PRIMARY KEY (jira_sprint_id, issue_id),
  INDEX ix_commit_timebox_pod (timebox_id, pod_id),
  INDEX ix_commit_issue (issue_id)
);

CREATE TABLE IF NOT EXISTS story_sprint_fact (
  jira_sprint_id BIGINT NOT NULL,
  timebox_id VARCHAR(100) NOT NULL,
  pod_id VARCHAR(100) NOT NULL,
  project_id BIGINT NOT NULL,
  issue_id BIGINT NOT NULL,
  issue_key VARCHAR(50) NOT NULL,
  feature_issue_id BIGINT,
  story_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  planned_at_commitment BOOLEAN NOT NULL,
  carried_in BOOLEAN NOT NULL,
  added_after_commitment BOOLEAN NOT NULL,
  removed_after_commitment BOOLEAN NOT NULL,
  done_by_sprint_close BOOLEAN NOT NULL,
  done_at DATETIME,
  outcome VARCHAR(30) NOT NULL,
  committed_delivered_sp DECIMAL(10,2) NOT NULL DEFAULT 0,
  missed_committed_sp DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_delivered_sp DECIMAL(10,2) NOT NULL DEFAULT 0,
  unplanned_delivered_sp DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_spike BOOLEAN NOT NULL,
  snapshot_source VARCHAR(40) NOT NULL,
  calculation_version VARCHAR(30) NOT NULL,
  calculated_at DATETIME NOT NULL,
  PRIMARY KEY (jira_sprint_id, issue_id),
  INDEX ix_fact_timebox_pod (timebox_id, pod_id),
  INDEX ix_fact_feature_timebox (feature_issue_id, timebox_id),
  INDEX ix_fact_issue (issue_id)
);

CREATE TABLE IF NOT EXISTS story_period_fact (
  reporting_period_id VARCHAR(100) NOT NULL,
  issue_id BIGINT NOT NULL,
  pod_id VARCHAR(100) NOT NULL,
  feature_issue_id BIGINT,
  sprints_touched INT NOT NULL,
  times_committed INT NOT NULL,
  times_missed INT NOT NULL,
  unique_story_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  committed_sp_across_sprints DECIMAL(10,2) NOT NULL DEFAULT 0,
  missed_sp_across_sprints DECIMAL(10,2) NOT NULL DEFAULT 0,
  done_by_period_cutoff BOOLEAN NOT NULL,
  done_by_cutoff_sp DECIMAL(10,2) NOT NULL DEFAULT 0,
  position_at_cutoff VARCHAR(40) NOT NULL,
  current_disposition VARCHAR(60),
  calculation_version VARCHAR(30) NOT NULL,
  PRIMARY KEY (reporting_period_id, issue_id),
  INDEX ix_story_period_pod (reporting_period_id, pod_id),
  INDEX ix_story_period_feature (reporting_period_id, feature_issue_id)
);

CREATE TABLE IF NOT EXISTS feature_baseline (
  feature_issue_id BIGINT NOT NULL,
  baseline_version INT NOT NULL,
  baseline_due_date DATE,
  baseline_scope_at DATETIME NOT NULL,
  approved BOOLEAN NOT NULL,
  recorded_at DATETIME NOT NULL,
  PRIMARY KEY (feature_issue_id, baseline_version)
);

CREATE TABLE IF NOT EXISTS feature_period_fact (
  reporting_period_id VARCHAR(100) NOT NULL,
  feature_issue_id BIGINT NOT NULL,
  pod_id VARCHAR(100),
  baseline_due_date DATE,
  due_in_period BOOLEAN NOT NULL,
  completed_by_baseline BOOLEAN NOT NULL,
  child_story_count INT NOT NULL,
  child_story_sp DECIMAL(10,2) NOT NULL DEFAULT 0,
  done_by_cutoff_sp DECIMAL(10,2) NOT NULL DEFAULT 0,
  incomplete_story_count INT NOT NULL,
  incomplete_sp DECIMAL(10,2) NOT NULL DEFAULT 0,
  feature_verdict VARCHAR(60) NOT NULL,
  PRIMARY KEY (reporting_period_id, feature_issue_id)
);

CREATE TABLE IF NOT EXISTS pod_timebox_kpi (
  timebox_id VARCHAR(100) NOT NULL,
  pod_id VARCHAR(100) NOT NULL,
  committed_sp DECIMAL(12,2) NOT NULL,
  delivered_committed_sp DECIMAL(12,2) NOT NULL,
  missed_committed_sp DECIMAL(12,2) NOT NULL,
  total_delivered_sp DECIMAL(12,2) NOT NULL,
  unplanned_delivered_sp DECIMAL(12,2) NOT NULL,
  committed_story_count INT NOT NULL,
  missed_story_count INT NOT NULL,
  say_do_ratio DECIMAL(10,6),
  carryover_ratio DECIMAL(10,6),
  plan_load DECIMAL(10,6),
  calculated_at DATETIME NOT NULL,
  calculation_version VARCHAR(30) NOT NULL,
  PRIMARY KEY (timebox_id, pod_id)
);

CREATE TABLE IF NOT EXISTS sync_run (
  sync_run_id VARCHAR(100) PRIMARY KEY,
  sync_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL,
  cursor_updated_at DATETIME,
  cursor_issue_id BIGINT,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  pages_read INT NOT NULL DEFAULT 0,
  records_read INT NOT NULL DEFAULT 0,
  records_written INT NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS dirty_entity (
  entity_type VARCHAR(30) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  reason VARCHAR(255),
  queued_at DATETIME NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS data_quality_warning (
  warning_id VARCHAR(100) PRIMARY KEY,
  warning_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(100),
  timebox_id VARCHAR(100),
  message TEXT,
  created_at DATETIME NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX ix_dq_timebox (timebox_id),
  INDEX ix_dq_type (warning_type)
);
