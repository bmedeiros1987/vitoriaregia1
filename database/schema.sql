-- CrewCheck Premium · MySQL/Aiven schema
-- O servidor cria/atualiza automaticamente com CREWCHECK_AUTO_MIGRATE=true.

create table if not exists crewcheck_users (
  id char(36) primary key,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  name varchar(255) not null default 'Tripulante',
  email varchar(320) not null,
  password_hash text not null,
  role varchar(64) not null default 'crew',
  crew_id varchar(64),
  base varchar(16),
  `rank` varchar(64),
  is_active tinyint(1) not null default 1,
  last_login_at timestamp null,
  temp_password_hash text,
  temp_password_expires_at timestamp null,
  unique key crewcheck_users_email_uidx (email)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists crewcheck_sessions (
  id char(36) primary key,
  created_at timestamp not null default current_timestamp,
  expires_at timestamp not null,
  user_id char(36),
  token_hash varchar(128) not null unique,
  user_agent text,
  ip varchar(128),
  key crewcheck_sessions_user_idx (user_id, created_at),
  constraint crewcheck_sessions_user_fk foreign key (user_id) references crewcheck_users(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists crewcheck_rosters (
  id char(36) primary key,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  user_id char(36),
  crew_name varchar(255),
  crew_id varchar(64),
  base varchar(16),
  `rank` varchar(64),
  airline varchar(128),
  period_year int,
  period_month int,
  source_file_name varchar(255),
  roster_json json not null,
  compliance_json json,
  gym_json json,
  score int,
  intensity_score int,
  alerts_count int not null default 0,
  critical_alerts_count int not null default 0,
  checksum varchar(128),
  key crewcheck_rosters_created_at_idx (created_at),
  key crewcheck_rosters_crew_id_idx (crew_id),
  key crewcheck_rosters_period_idx (period_year, period_month),
  key crewcheck_rosters_user_idx (user_id, created_at),
  key crewcheck_rosters_checksum_idx (checksum)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists crewcheck_audit_logs (
  id char(36) primary key,
  created_at timestamp not null default current_timestamp,
  user_id char(36),
  action varchar(160) not null,
  entity_id char(36),
  metadata json not null,
  key crewcheck_audit_user_idx (user_id, created_at),
  key crewcheck_audit_action_idx (action)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
